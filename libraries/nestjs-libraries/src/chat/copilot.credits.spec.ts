import 'reflect-metadata';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/di';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { copilotRunOptions } from './copilot.credits.ts';
import { runWithContext } from './async.storage.ts';
import { insufficientCredits } from '../database/prisma/credits/credits.repository.ts';
import {
  LLM_CONTINUATION_FLOOR,
  LLM_TURN_MINIMUM,
} from '../database/prisma/subscriptions/pricing.ts';

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
});

// Two model calls, the way a Copilot turn goes: a tool call, then the reply.
const turn = (first = 'resp_1', second = 'resp_2') => [
  [
    { type: 'stream-start', warnings: [] },
    {
      type: 'response-metadata',
      id: first,
      modelId: 'gpt-5.2-2025-12-11',
      timestamp: new Date(),
    },
    {
      type: 'tool-call',
      toolCallId: 'call_1',
      toolName: 'lookup',
      input: '{}',
    },
    {
      type: 'finish',
      usage: usage(1000, 200),
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    },
  ],
  [
    { type: 'stream-start', warnings: [] },
    {
      type: 'response-metadata',
      id: second,
      modelId: 'gpt-5.2-2025-12-11',
      timestamp: new Date(),
    },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: 'Scheduled.' },
    { type: 'text-end', id: 't1' },
    {
      type: 'finish',
      usage: usage(1500, 100),
      finishReason: { unified: 'stop', raw: 'stop' },
    },
  ],
];

// A model that answers each call with the next step, streamed (`stream`) or
// whole (`generate`).
const fakeModel = (steps: any[][]) => {
  let call = 0;
  return {
    specificationVersion: 'v3',
    provider: 'openai.responses',
    modelId: 'gpt-5.2',
    supportedUrls: {},
    async doGenerate() {
      const parts = steps[call++];
      const meta = parts.find((p) => p.type === 'response-metadata');
      const finish = parts.find((p) => p.type === 'finish');
      return {
        content: parts
          .filter((p) => p.type === 'tool-call' || p.type === 'text-delta')
          .map((p) =>
            p.type === 'text-delta' ? { type: 'text', text: p.delta } : p
          ),
        finishReason: finish.finishReason,
        usage: finish.usage,
        response: {
          id: meta.id,
          modelId: meta.modelId,
          timestamp: meta.timestamp,
        },
        warnings: [],
      };
    },
    async doStream() {
      const parts = steps[call++];
      return {
        stream: new ReadableStream({
          start(controller) {
            parts.forEach((part) => controller.enqueue(part));
            // A step with no finish is still streaming when it is stopped.
            if (parts.some((part) => part.type === 'finish')) {
              controller.close();
            }
          },
        }),
      };
    },
  } as any;
};

let charges: {
  org: string;
  key: string;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  action: string;
}[];
let checks: string[];
let balance: number;
let failCharges: boolean;

// The credits service with its ledger faked: a key is charged once, the way
// the real one's unique (organizationId, idempotencyKey) makes it.
const credits = () => ({
  async assertLlmTurn(org: string, continuation = false) {
    checks.push(org);
    if (balance < (continuation ? LLM_CONTINUATION_FLOOR : LLM_TURN_MINIMUM)) {
      throw insufficientCredits(LLM_TURN_MINIMUM, balance);
    }
  },
  async chargeLlm(org: string, usage: any) {
    if (failCharges) {
      throw new Error('database down');
    }
    if (!charges.some((c) => c.org === org && c.key === usage.key)) {
      charges.push({ org, ...usage });
    }
    return { id: 'spend', charged: true };
  },
});

// The agent as load.tools.service builds it, with the model faked.
const agentFor = (steps: unknown[][]) =>
  new Agent({
    id: 'postqueen',
    name: 'postqueen',
    instructions: 'spec',
    model: fakeModel(steps),
    defaultOptions: ({ requestContext }) =>
      copilotRunOptions(credits(), requestContext),
    tools: {
      lookup: createTool({
        id: 'lookup',
        description: 'spec',
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    },
  });

const appContext = (organization: object | null) => {
  const context = new RequestContext();
  if (organization) {
    context.set('organization', JSON.stringify(organization));
  }
  context.set('ui', 'true');
  return context;
};

beforeEach(() => {
  charges = [];
  checks = [];
  balance = 500;
  failCharges = false;
});

describe('Copilot runs are charged by the tokens of each model call', () => {
  it('charges every call of a run once, by its own usage and response id', async () => {
    await agentFor(turn()).generate('Schedule it', {
      requestContext: appContext({ id: 'org-1' }),
    });
    assert.deepEqual(
      charges.map(({ org, key, model, inputTokens, outputTokens, action }) => ({
        org,
        key,
        model,
        inputTokens,
        outputTokens,
        action,
      })),
      [
        {
          org: 'org-1',
          key: 'llm:resp_1',
          model: 'gpt-5.2',
          inputTokens: 1000,
          outputTokens: 200,
          action: 'copilot',
        },
        {
          org: 'org-1',
          key: 'llm:resp_2',
          model: 'gpt-5.2',
          inputTokens: 1500,
          outputTokens: 100,
          action: 'copilot',
        },
      ]
    );
  });

  it('charges a streamed run the same way', async () => {
    const output = await agentFor(turn()).stream('Schedule it', {
      requestContext: appContext({ id: 'org-1' }),
    });
    await output.consumeStream();
    assert.deepEqual(
      charges.map((c) => [c.key, c.inputTokens, c.outputTokens]),
      [
        ['llm:resp_1', 1000, 200],
        ['llm:resp_2', 1500, 100],
      ]
    );
  });

  it('charges the calls a run stopped by the person already made', async () => {
    // Stopped while the reply streams: Mastra ends such a run with no usage
    // at all, so a charge taken at the end would make the whole turn free.
    const steps = turn();
    steps[1] = steps[1].filter((part: any) => part.type !== 'finish');
    const stop = new AbortController();
    const output = await agentFor(steps).stream('Schedule it', {
      requestContext: appContext({ id: 'org-1' }),
      abortSignal: stop.signal,
    });
    const reader = output.fullStream.getReader();
    while (!charges.length) {
      const { done } = await reader.read();
      assert.ok(!done, 'the first call should be charged before the run ends');
    }
    stop.abort();
    while (!(await reader.read()).done) {
      /** drain **/
    }
    assert.deepEqual(
      charges.map((c) => [c.key, c.inputTokens, c.outputTokens]),
      [['llm:resp_1', 1000, 200]]
    );
  });

  it('still answers when a charge cannot be written', async () => {
    failCharges = true;
    const result = await agentFor(turn()).generate('Schedule it', {
      requestContext: appContext({ id: 'org-1' }),
    });
    assert.equal(result.text, 'Scheduled.');
  });

  it('never charges the same model call twice', async () => {
    // The same response ids again: a callback that fires twice, or a retry
    // that replays them, finds the key already paid.
    await agentFor(turn()).generate('One', {
      requestContext: appContext({ id: 'org-1' }),
    });
    await agentFor(turn()).generate('Two', {
      requestContext: appContext({ id: 'org-1' }),
    });
    assert.deepEqual(
      charges.map((c) => c.key),
      ['llm:resp_1', 'llm:resp_2']
    );
  });

  it("leaves the app's refusal to its controller, so a started turn is never stopped here", async () => {
    balance = -250;
    await agentFor(turn()).generate('Go', {
      requestContext: appContext({ id: 'org-1' }),
    });
    assert.deepEqual(checks, []);
    assert.equal(charges.length, 2);
  });

  it('charges MCP to the organization of the request, and refuses it at an empty balance', async () => {
    const mcp = new RequestContext();
    await runWithContext({ requestId: 'token', auth: { id: 'org-mcp' } }, () =>
      agentFor(turn()).generate('Over MCP', { requestContext: mcp })
    );
    assert.deepEqual(checks, ['org-mcp']);
    assert.deepEqual(
      charges.map((c) => [c.org, c.action]),
      [
        ['org-mcp', 'copilot_mcp'],
        ['org-mcp', 'copilot_mcp'],
      ]
    );

    charges = [];
    balance = 0;
    await assert.rejects(
      runWithContext({ requestId: 'token', auth: { id: 'org-mcp' } }, () =>
        agentFor(turn()).generate('Over MCP', {
          requestContext: new RequestContext(),
        })
      ),
      (err) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), 402);
        assert.equal((err.getResponse() as any).code, 'insufficient_credits');
        return true;
      }
    );
    assert.deepEqual(charges, []);
  });

  it('refuses a run with no organization to charge, unless billing is off', async () => {
    const KEYS = ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'];
    const saved = KEYS.map((k) => process.env[k]);
    try {
      KEYS.forEach((k) => (process.env[k] = 'spec'));
      await assert.rejects(
        agentFor(turn()).generate('Nobody', {
          requestContext: new RequestContext(),
        }),
        /no organization to be charged/
      );

      delete process.env.STRIPE_SECRET_KEY;
      const result = await agentFor(turn()).generate('Nobody', {
        requestContext: new RequestContext(),
      });
      assert.equal(result.text, 'Scheduled.');
      assert.deepEqual(checks, []);
      assert.deepEqual(charges, []);
    } finally {
      KEYS.forEach((k, i) =>
        saved[i] === undefined
          ? delete process.env[k]
          : (process.env[k] = saved[i])
      );
    }
  });
});
