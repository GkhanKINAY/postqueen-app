import { Logger } from '@nestjs/common';
import type { CreditsService } from '@gitroom/nestjs-libraries/database/prisma/credits/credits.service';
import { getAuth } from '@gitroom/nestjs-libraries/chat/async.storage';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

type RequestContextReader = { get: (key: never) => unknown };

/** The parts of a finished model call the charge reads. */
type ModelStep = {
  usage?: { inputTokens?: number; outputTokens?: number };
  response?: { id?: string; modelId?: string };
  model?: { modelId?: string };
};

const logger = new Logger('CopilotCredits');

// The CopilotKit runtime methods that run a model. `info`, `agent/connect`
// (a thread's history replayed) and `agent/stop` cost nothing.
const MODEL_METHODS = ['agent/run', 'agent/suggest', 'transcribe'];

/**
 * What a CopilotKit runtime request asks of the balance: nothing, a turn the
 * person started, or the rest of one. CopilotKit runs the agent again after
 * every frontend tool (a Post Preview card) to finish the turn, and that run
 * carries the tool's result as its newest message.
 */
export const copilotRunKind = (body: any): 'free' | 'turn' | 'continuation' => {
  if (!MODEL_METHODS.includes(body?.method)) {
    return 'free';
  }
  const messages = body?.body?.messages;
  const newest = Array.isArray(messages)
    ? messages[messages.length - 1]
    : undefined;
  return newest?.role === 'tool' ? 'continuation' : 'turn';
};

/**
 * Who a run is for. The app's Copilot puts the organization in the request
 * context; MCP carries it in the request's async context (`runWithContext`
 * in start.mcp.ts), which a run started from there inherits.
 */
export const copilotOrganizationId = (requestContext: RequestContextReader) => {
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
};

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
export const copilotRunOptions = async (
  credits: Pick<CreditsService, 'assertLlmTurn' | 'chargeLlm'>,
  requestContext: RequestContextReader
) => {
  const organizationId = copilotOrganizationId(requestContext);
  const ui = requestContext.get('ui' as never) === 'true';
  if (!ui) {
    if (organizationId) {
      await credits.assertLlmTurn(organizationId);
    } else if (isBillingEnabled()) {
      throw new Error('This run has no organization to be charged to.');
    }
  }

  return {
    // Without a cap Mastra's loop runs until the model stops calling
    // tools, which a model retrying a failing draft never does. A normal
    // turn is three or four steps; image and analytics flows a few more.
    maxSteps: 12,
    onStepFinish: async (step: ModelStep) => {
      if (!organizationId) {
        logger.warn('A Copilot run has no organization to charge');
        return;
      }
      // Mastra gives every call an id, the provider's or its own.
      const key = step.response?.id || makeId(20);
      try {
        await credits.chargeLlm(organizationId, {
          key: `llm:${key}`,
          model: step.model?.modelId || step.response?.modelId,
          inputTokens: step.usage?.inputTokens || 0,
          outputTokens: step.usage?.outputTokens || 0,
          action: ui ? 'copilot' : 'copilot_mcp',
        });
      } catch (err) {
        // The reply is already on its way; a charge that failed must not
        // take it down.
        logger.error(`Could not charge ${key} to ${organizationId}: ${err}`);
      }
    },
  };
};
