import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';

let PostMetricsService: any;
let redis: { set: (...args: unknown[]) => Promise<string | null> };
before(async () => {
  ({ PostMetricsService } = await import('./post-metrics.service.ts'));
  ({ ioRedis: redis } = (await import(
    '../../../redis/redis.service.ts'
  )) as any);
  // Every test decides whether the cooldown key is free, so none depends on
  // a key another test or a real Redis left behind
  redis.set = async () => (claimFree ? 'OK' : null);
});

// `x` stands for any provider that bills post reads: short lookback, read
// only on request. `linkedin` stands for every other provider.
const providers: Record<string, any> = {
  x: {
    postsAnalytics: async (_: string, __: string, ids: string[]) => {
      reads.push(...ids);
      return ids.map((id) => ({
        platformPostId: id,
        impressions: 10,
        reactions: 1,
        comments: 0,
        shares: 0,
      }));
    },
    analyticsLookbackDays: 7,
    analyticsManualOnly: true,
  },
  linkedin: {
    postsAnalytics: async () => [],
  },
};

const integrations: Record<string, any> = {
  'int-x': { id: 'int-x', providerIdentifier: 'x' },
  'int-li': { id: 'int-li', providerIdentifier: 'linkedin' },
};

let reads: string[];
let lookbacks: Record<string, number>;
let lastSnapshot: Record<string, Date | undefined>;
let enqueued: number;
let overviews: string[];
let claimFree: boolean;

const service = () =>
  new PostMetricsService(
    {
      listIntegrationsNeedingSync: async () =>
        Object.values(integrations).map((integration) => ({
          organizationId: 'org-1',
          integrationId: integration.id,
          integration: { providerIdentifier: integration.providerIdentifier },
        })),
      listIntegrations: async (_: string, integrationId?: string) =>
        Object.values(integrations).filter(
          (integration) => !integrationId || integration.id === integrationId,
        ),
      lastSnapshotAt: async (ids: string[]) =>
        ids.map((id) => ({
          integrationId: id,
          _max: { capturedAt: lastSnapshot[id] || null },
        })),
      getIntegration: async (_: string, id: string) => ({
        ...integrations[id],
        internalId: `internal-${id}`,
        token: 'token',
        disabled: false,
        refreshNeeded: false,
        inBetweenSteps: false,
      }),
      listPublishedPostsForSync: async (id: string, days: number) => {
        lookbacks[id] = days;
        return [
          {
            id: `post-${id}`,
            releaseId: `release-${id}`,
            releaseURL: null,
            organizationId: 'org-1',
            integrationId: id,
            settings: '{}',
            publishDate: new Date(),
          },
        ];
      },
      upsertSnapshot: async (row: { integrationId: string }) => {
        lastSnapshot[row.integrationId] = new Date();
      },
    },
    { getSocialIntegration: (identifier: string) => providers[identifier] },
    { isExpired: () => false },
    {
      client: {
        getRawClient: () => ({
          workflow: {
            start: async () => {
              enqueued += 1;
            },
          },
        }),
      },
    },
    {},
    {
      checkAnalytics: async (
        _: unknown,
        id: string,
        __: string,
        ___: boolean,
        readManualOnly: boolean,
      ) => {
        assert.equal(readManualOnly, true);
        overviews.push(id);
        return [];
      },
    },
  );

beforeEach(() => {
  reads = [];
  lookbacks = {};
  lastSnapshot = {};
  enqueued = 0;
  overviews = [];
  claimFree = true;
});

describe('post metrics lookback', () => {
  it('reads the provider lookback, and 90 days for every other provider', async () => {
    await service().syncIntegration('org-1', 'int-x');
    await service().syncIntegration('org-1', 'int-li');
    assert.equal(lookbacks['int-x'], 7);
    assert.equal(lookbacks['int-li'], 90);
  });
});

describe('automatic post metrics sync', () => {
  it('leaves manual-only providers out of the hourly targets', async () => {
    const targets = await service().listIntegrationsNeedingSync();
    assert.deepEqual(
      targets.map((target: { integrationId: string }) => target.integrationId),
      ['int-li'],
    );
  });

  it('starts no stale sync when only manual-only channels are stale', async () => {
    delete integrations['int-li'];
    try {
      const result = await service().maybeEnqueueStaleSync('org-1');
      assert.equal(result.syncing, false);
      assert.equal(enqueued, 0);
    } finally {
      integrations['int-li'] = { id: 'int-li', providerIdentifier: 'linkedin' };
    }
  });
});

describe('manual post metrics refresh', () => {
  it('syncs only the manual-only channels and reports when', async () => {
    const result = await service().manualRefresh('org-1');
    assert.equal(result.synced, 1);
    assert.equal(result.refreshed, 1);
    assert.equal(result.failed, 0);
    assert.deepEqual(overviews, ['int-x']);
    assert.equal(result.skipped, 0);
    assert.equal(result.integrations, 1);
    assert.ok(result.lastSyncedAt instanceof Date);
    assert.deepEqual(reads, ['release-int-x']);
    assert.equal(lookbacks['int-li'], undefined);
  });

  it('skips a channel synced within the cooldown', async () => {
    lastSnapshot['int-x'] = new Date(Date.now() - 5 * 60 * 1000);
    const result = await service().manualRefresh('org-1');
    assert.equal(result.synced, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(reads, []);
  });

  it('skips a channel whose cooldown key another press holds', async () => {
    claimFree = false;
    const result = await service().manualRefresh('org-1');
    assert.equal(result.synced, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(reads, []);
    assert.deepEqual(overviews, []);
  });

  it('reads again once the cooldown has passed', async () => {
    lastSnapshot['int-x'] = new Date(Date.now() - 60 * 60 * 1000);
    const result = await service().manualRefresh('org-1');
    assert.equal(result.synced, 1);
    assert.deepEqual(reads, ['release-int-x']);
  });

  it('does nothing for a channel that is not manual-only', async () => {
    const result = await service().manualRefresh('org-1', 'int-li');
    assert.equal(result.integrations, 0);
    assert.equal(result.synced, 0);
    assert.equal(lookbacks['int-li'], undefined);
  });

  it('reports no manual-only channels for an organization without one', async () => {
    const status = await service().manualRefreshStatus('org-1', 'int-li');
    assert.deepEqual(status, { integrations: 0, lastSyncedAt: null });
  });
});
