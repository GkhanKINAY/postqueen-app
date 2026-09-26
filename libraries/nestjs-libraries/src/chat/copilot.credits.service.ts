import { HttpException, Injectable, Logger } from '@nestjs/common';
import { CreditsService } from '@gitroom/nestjs-libraries/database/prisma/credits/credits.service';
import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import { llmCreditCost } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

type RequestContextReader = { get: (key: never) => unknown };

/** The parts of a finished model call the charge reads. */
type ModelStep = {
  usage?: { inputTokens?: number; outputTokens?: number };
  response?: { id?: string; modelId?: string };
  model?: { modelId?: string };
};

// The CopilotKit runtime methods that run a model. `info`, `agent/connect`
// (a thread's history replayed) and `agent/stop` cost nothing.
const MODEL_METHODS = ['agent/run', 'agent/suggest', 'transcribe'];

/**
 * Copilot and the MCP agent on the credits balance: who a run is charged to,
 * whether it may start, and the charge for every model call it makes.
 */
@Injectable()
export class CopilotCreditsService {
  private readonly logger = new Logger(CopilotCreditsService.name);

  constructor(private _creditsService: CreditsService) {}

  /**
   * What a CopilotKit runtime request asks of the balance: nothing, a turn the
   * person started, or the rest of one. CopilotKit runs the agent again after
   * every frontend tool (a Post Preview card) to finish the turn, and that run
   * carries the tool's result as its newest message.
   */
  runKind(body: any): 'free' | 'turn' | 'continuation' {
    if (!MODEL_METHODS.includes(body?.method)) {
      return 'free';
    }
    const messages = body?.body?.messages;
    const newest = Array.isArray(messages)
      ? messages[messages.length - 1]
      : undefined;
    return newest?.role === 'tool' ? 'continuation' : 'turn';
  }

  /**
   * Refused before the runtime starts, so the answer is a 402 and never an
   * error inside a stream. Only what runs a model is checked: a thread's
   * history keeps loading at zero.
   */
  async assertRun(organizationId: string, body: any) {
    const kind = this.runKind(body);
    if (kind !== 'free') {
      await this._creditsService.assertLlmTurn(
        organizationId,
        kind === 'continuation'
      );
    }
  }

  /**
   * Who a run is for. The app's Copilot puts the organization in the request
   * context; MCP carries it in the request's async context (`runWithContext`
   * in start.mcp.ts), which a run started from there inherits.
   */
  organizationId(requestContext: RequestContextReader) {
    try {
      const raw = requestContext.get('organization' as never);
      const id = typeof raw === 'string' ? JSON.parse(raw)?.id : undefined;
      if (typeof id === 'string') {
        return id;
      }
    } catch {
      /** falls through to MCP's **/
    }
    const auth = getAuth<{ id?: string }>();
    return typeof auth?.id === 'string' ? auth.id : undefined;
  }

  /**
   * The options of one Copilot run: the agent's `defaultOptions`. Every model
   * call is charged when it finishes, by the tokens it used and keyed by the
   * provider's response id, so a callback that fires twice charges once.
   * Charged per call rather than once at the end: a run stopped by the person
   * ends without its usage, and one that fails ends without the end callback
   * at all, and the calls before either are paid for all the same. The title
   * Mastra generates afterwards does not go through here and is not charged.
   *
   * An empty balance is refused before the run. The app's Copilot is refused
   * by its controller before the stream starts, so this is for MCP, where the
   * refusal is the tool's error, and where a run nobody can be charged for is
   * refused as well.
   *
   * A call still in flight when a run is stopped, or when its call fails, has
   * no usage to charge; only finished calls are charged.
   */
  async runOptions(requestContext: RequestContextReader) {
    const organizationId = this.organizationId(requestContext);
    const ui = requestContext.get('ui' as never) === 'true';
    if (!ui) {
      if (organizationId) {
        await this._creditsService.assertLlmTurn(organizationId);
      } else if (isBillingEnabled()) {
        throw new Error('This run has no organization to be charged to.');
      }
    }

    return {
      // Without a cap Mastra's loop runs until the model stops calling
      // tools, which a model retrying a failing draft never does. A normal
      // turn is three or four steps; image and analytics flows a few more.
      maxSteps: 12,
      // Checked before every further step: a run that took the balance past
      // the floor stops there, however it started. Runs started together,
      // or a client that sends every run as the rest of a turn, each go one
      // call past it at most. Mastra asks before the step that just finished
      // is charged, so its cost is counted here.
      stopWhen: async ({ steps }: { steps: ModelStep[] }) => {
        if (!organizationId) {
          return false;
        }
        const last = steps[steps.length - 1];
        try {
          await this._creditsService.assertLlmTurn(
            organizationId,
            true,
            llmCreditCost(
              last?.model?.modelId || last?.response?.modelId,
              last?.usage?.inputTokens || 0,
              last?.usage?.outputTokens || 0
            )
          );
          return false;
        } catch (err) {
          return err instanceof HttpException && err.getStatus() === 402;
        }
      },
      onStepFinish: async (step: ModelStep) => {
        if (!organizationId) {
          this.logger.warn('A Copilot run has no organization to charge');
          return;
        }
        // Mastra gives every call an id, the provider's or its own.
        const key = step.response?.id || makeId(20);
        try {
          await this._creditsService.chargeLlm(organizationId, {
            key: `llm:${key}`,
            model: step.model?.modelId || step.response?.modelId,
            inputTokens: step.usage?.inputTokens || 0,
            outputTokens: step.usage?.outputTokens || 0,
            action: ui ? 'copilot' : 'copilot_mcp',
          });
        } catch (err) {
          // The reply is already on its way; a charge that failed must not
          // take it down.
          this.logger.error(
            `Could not charge ${key} to ${organizationId}: ${err}`
          );
        }
      },
    };
  }
}
