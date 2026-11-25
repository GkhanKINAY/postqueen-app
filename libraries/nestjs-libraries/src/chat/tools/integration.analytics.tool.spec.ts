import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { IntegrationAnalyticsTool } from './integration.analytics.tool.ts';

// The organization comes from the request context, the way the MCP server
// and the app's Copilot set it
const context = () => {
  const values = new Map<string, string>([
    ['organization', JSON.stringify({ id: 'org-1' })],
  ]);
  return {
    requestContext: {
      get: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
    },
  };
};

const tool = (answer: () => Promise<any>) => {
  const calls: unknown[][] = [];
  const instance = new IntegrationAnalyticsTool({
    checkAnalytics: async (...args: unknown[]) => {
      calls.push(args);
      return answer();
    },
  } as any);
  return { run: instance.run() as any, calls };
};

describe('integrationAnalyticsTool', () => {
  // A Refresh (forceRefresh / readManualOnly) is what reads a provider that
  // bills every read; the tool must only ever ask for what a page view gets
  it("reads the channel as a page view does, in the caller's organization", async () => {
    const { run, calls } = tool(async () => [
      {
        label: 'Impressions',
        percentageChange: 5,
        data: [{ total: 12, date: '2026-11-20' }],
      },
    ]);

    assert.deepEqual(await run.execute({ id: 'channel-1' }, context()), {
      output: {
        analytics: [
          {
            label: 'Impressions',
            percentageChange: 5,
            data: [{ total: '12', date: '2026-11-20' }],
          },
        ],
      },
    });
    assert.deepEqual(await run.execute({ id: 'channel-1', days: 30 }, context()), {
      output: {
        analytics: [
          {
            label: 'Impressions',
            percentageChange: 5,
            data: [{ total: '12', date: '2026-11-20' }],
          },
        ],
      },
    });
    assert.deepEqual(calls, [
      [{ id: 'org-1' }, 'channel-1', '7'],
      [{ id: 'org-1' }, 'channel-1', '30'],
    ]);
  });

  it('says why when the channel cannot be read', async () => {
    const { run } = tool(async () => {
      throw new HttpException('Channel not found', 404);
    });
    assert.deepEqual(await run.execute({ id: 'nope' }, context()), {
      output: { errors: 'Channel not found' },
    });
  });

  it('keeps the window to what the app offers', () => {
    const { run } = tool(async () => []);
    assert.equal(run.inputSchema.safeParse({ id: 'c', days: 91 }).success, false);
    assert.equal(run.inputSchema.safeParse({ id: 'c', days: 0 }).success, false);
    assert.equal(run.inputSchema.safeParse({ id: 'c', days: 90 }).success, true);
  });
});
