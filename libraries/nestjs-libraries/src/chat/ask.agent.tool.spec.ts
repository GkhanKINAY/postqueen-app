import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { askAgentTool } from './ask.agent.tool.ts';
import { getAuth, runWithContext } from './async.storage.ts';
import { CopilotCreditsService } from './copilot.credits.service.ts';
import { insufficientCredits } from '../database/prisma/credits/credits.repository.ts';
import { LLM_TURN_MINIMUM } from '../database/prisma/subscriptions/pricing.ts';

const org = { id: 'org-1', name: 'Spec organization' };
const answer = '- Facebook: 3\n- Instagram: 1';

// The model, faked: one call that answers with text.
const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const response = () => ({
  id: 'resp_1',
  modelId: 'gpt-6.2-sol',
  timestamp: new Date(),
});
const fakeModel = {
  specificationVersion: 'v3',
  provider: 'openai.responses',
  modelId: 'gpt-6.2-sol',
  supportedUrls: {},
  async doGenerate() {
    return {
      content: [{ type: 'text', text: answer }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      response: response(),
      warnings: [],
    };
  },
  async doStream() {
    return {
      stream: new ReadableStream({
        start(controller) {
          [
            { type: 'stream-start', warnings: [] },
            { type: 'response-metadata', ...response() },
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: answer },
            { type: 'text-end', id: 't1' },
            {
              type: 'finish',
              usage,
              finishReason: { unified: 'stop', raw: 'stop' },
            },
          ].forEach((part) => controller.enqueue(part));
          controller.close();
        },
      }),
    };
  },
} as any;

let balance: number;
let charges: { org: string; key: string; action: string }[];

// The credits ledger, faked
const credits = {
  async creditPricing() {
    return 'legacy';
  },
  async assertLlmTurn() {
    if (balance < LLM_TURN_MINIMUM) {
      throw insufficientCredits(LLM_TURN_MINIMUM, balance);
    }
  },
  async chargeLlm(organizationId: string, spend: any) {
    charges.push({ org: organizationId, key: spend.key, action: spend.action });
    return { id: 'spend', charged: true };
  },
};

// The agent as load.tools.service builds it, with the model faked and one
// tool; the real list cannot be loaded under tsx (an import maps to a .d.ts)
const lookup = createTool({
  id: 'integrationList',
  description: 'spec',
  inputSchema: z.object({}),
  mcp: { annotations: { title: 'List Integrations', readOnlyHint: true } },
  execute: async () => ({ output: [] }),
});
const agent = new Agent({
  id: 'postqueen',
  name: 'postqueen',
  description:
    'Agent that helps schedule posts and report social analytics for users',
  instructions: 'spec',
  model: fakeModel,
  defaultOptions: ({ requestContext }) =>
    new CopilotCreditsService(credits as any).runOptions(requestContext),
  tools: { integrationList: lookup },
});
const realGenerate = agent.generate.bind(agent);
let generate: (message: string, options: any) => Promise<any>;
(agent as any).generate = (message: string, options: any) =>
  generate(message, options);

describe('ask_postqueen over MCP', () => {
  let http: Server | undefined;
  let base: string;

  before(async () => {
    const config = {
      name: 'PostQueen MCP',
      version: '1.0.0',
      protocolVersion: '2026-07-28' as const,
    };
    const tools = { integrationList: lookup };
    const servers: Record<string, MCPServer> = {
      // what a key (/mcp/:id, Bearer /mcp) and SSE reach now
      '/ours': new MCPServer({
        ...config,
        tools: { ...tools, ask_postqueen: askAgentTool('postqueen', agent) },
      }),
      // what they reached until now: MCPServer's own agent tool
      '/agents': new MCPServer({
        ...config,
        tools,
        agents: { postqueen: agent },
      }),
    };

    const app = express();
    for (const [path, server] of Object.entries(servers)) {
      // the refused run below is logged as an error otherwise
      server.__setLogger(noopLogger);
      app.use(path, async (req: any, res) => {
        // as start.mcp.ts does: the organization on the request, and the
        // request run inside its async context
        req.auth = org;
        await runWithContext({ requestId: 'key-1', auth: org }, async () => {
          await server.startHTTP({
            url: new URL(path, base),
            httpPath: path,
            options: { serverless: true },
            req,
            res,
          });
        });
      });
    }
    const listening = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => listening.once('listening', resolve));
    http = listening;
    const { port } = listening.address() as { port: number };
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (http) {
      http.closeAllConnections();
      await new Promise((resolve) => http!.close(resolve));
    }
  });

  beforeEach(() => {
    balance = 500;
    charges = [];
    generate = realGenerate;
  });

  const withClient = async <T>(
    path: string,
    run: (client: Client) => Promise<T>
  ) => {
    const client = new Client({ name: 'spec', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(path, base)));
    try {
      return await run(client);
    } finally {
      await client.close();
    }
  };
  const listTools = (path: string) =>
    withClient(path, async (client) => (await client.listTools()).tools);
  const ask = (path: string, message: string) =>
    withClient(path, (client) =>
      client.callTool({ name: 'ask_postqueen', arguments: { message } })
    );

  it('lists ask_postqueen exactly as the agents option did', async () => {
    const ours = await listTools('/ours');
    assert.deepEqual(ours, await listTools('/agents'));
    assert.deepEqual(
      ours.map((tool) => tool.name),
      ['integrationList', 'ask_postqueen']
    );
    const tool = ours.find((t) => t.name === 'ask_postqueen')!;
    assert.equal(
      tool.description,
      "Ask agent 'postqueen' a question. Agent description: Agent that helps schedule posts and report social analytics for users"
    );
    assert.deepEqual(tool.inputSchema.properties, {
      message: {
        type: 'string',
        description: 'The question or input for the agent.',
      },
    });
    assert.deepEqual(tool.inputSchema.required, ['message']);
    assert.equal(tool.annotations, undefined);
  });

  it('answers with the text alone, however much the run returned', async () => {
    const seen: any[] = [];
    generate = async (message, options) => {
      seen.push({ message, options, auth: getAuth() });
      return {
        text: answer,
        steps: Array.from({ length: 6 }, () => ({
          request: { body: 'system prompt and tools '.repeat(5000) },
          response: { body: 'x'.repeat(20000) },
        })),
        messages: [{ role: 'system', content: 'y'.repeat(20000) }],
        usage: { inputTokens: 70000, outputTokens: 12 },
      };
    };
    assert.deepEqual(await ask('/ours', 'How many channels do I have?'), {
      content: [{ type: 'text', text: answer }],
      isError: false,
    });

    // Mastra's tool sent all of it back
    const whole = await ask('/agents', 'How many channels do I have?');
    assert.ok(JSON.stringify(whole).length > 200000);

    // and gave the agent the same call
    assert.equal(seen.length, 2);
    const [ours, theirs] = seen;
    assert.equal(ours.message, 'How many channels do I have?');
    assert.deepEqual(
      Object.keys(ours.options).sort(),
      Object.keys(theirs.options).sort()
    );
    assert.deepEqual(
      [...ours.options.requestContext.keys()].sort(),
      [...theirs.options.requestContext.keys()].sort()
    );
    // The organization reaches the agent both ways: as the request's
    // authInfo (copied from mcp.extra, which the tools' checkAuth reads),
    // and in the async context the credits are charged by
    assert.deepEqual(ours.options.requestContext.get('authInfo'), org);
    assert.deepEqual(ours.auth, org);
  });

  // A run that ends on a tool call (the step cap, or the credits floor
  // reached mid-run) has no text; the client hears that it stopped
  it('says the agent stopped when a run ends without text', async () => {
    generate = async () => ({ text: '', finishReason: 'tool-calls', steps: [] });
    assert.deepEqual(await ask('/ours', 'Schedule everything'), {
      content: [
        {
          type: 'text',
          text: 'The agent stopped before it wrote an answer (finish reason: tool-calls).',
        },
      ],
      isError: false,
    });
  });

  it('runs the agent and charges its model calls to the organization', async () => {
    const result = await ask('/ours', 'How many channels do I have?');
    assert.deepEqual(result.content, [{ type: 'text', text: answer }]);
    assert.deepEqual(charges, [
      { org: 'org-1', key: 'llm:resp_1', action: 'copilot_mcp' },
    ]);
  });

  it('answers an error from the agent as an MCP error, as before', async () => {
    balance = 0;
    const ours = await ask('/ours', 'How many channels do I have?');
    assert.equal(ours.isError, true);
    assert.deepEqual(ours, await ask('/agents', 'How many channels do I have?'));
    assert.match((ours.content as any)[0].text, /credits/i);
    assert.deepEqual(charges, []);
  });
});
