import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { insufficientCredits } from '../credits/credits.repository.ts';

let PostMetricsService: any;
let redis: { set: (...args: unknown[]) => Promise<string | null> };
before(async () => {
  ({ PostMetricsService } = await import('./post-metrics.service.ts'));
  ({ ioRedis: redis } = (await import(
    '../../../redis/redis.service.ts'
  )) as any);
  // Every test decides whether the cooldown key is free, so none depends on
  // a key another test or a real Redis left behind
  redis.set = async () => {
    claims += 1;
    return claimFree ? 'OK' : null;
  };
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
    // Billed per post read and for the overview on v2, free before.
    creditCost: (op: any, creditPricing: string) =>
      creditPricing !== 'v2'
        ? 0
        : op.type === 'post-metrics'
        ? op.posts * 25
        : op.type === 'account-metrics'
        ? 50
        : undefined,
  },
  linkedin: {
    postsAnalytics: async () => [],
    analyticsRetentionDays: 365,
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
let prunes: Array<{ identifiers: string[]; before: Date; limit: number }>;
let pruneCounts: number[];
let pruneFails: boolean;
let profileRuns: string[];
let claims: number;
let capturedToday: Record<string, string[]>;
let creditPricing: 'legacy' | 'v2';
let balance: number;
let spends: Array<{ key: string; amount: number }>;
let overviewFails: boolean;

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
      upsertSnapshot: async (row: { integrationId: string; postId: string }) => {
        lastSnapshot[row.integrationId] = new Date();
        capturedToday[row.integrationId] = [
          ...(capturedToday[row.integrationId] || []),
          row.postId,
        ];
      },
      postIdsCapturedOn: async (id: string) => capturedToday[id] || [],
      deleteSnapshotsBefore: async (
        identifiers: string[],
        before: Date,
        limit: number,
      ) => {
        if (pruneFails) {
          throw new Error('database down');
        }
        prunes.push({ identifiers, before, limit });
        return { count: pruneCounts.shift() ?? 0 };
      },
    },
    {
      getSocialIntegration: (identifier: string) => providers[identifier],
      getAllowedSocialsIntegrations: () => Object.keys(providers),
    },
    {
      isExpired: () => false,
      refreshDueProfiles: async () => {
        profileRuns.push('refresh');
      },
    },
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
      eraseExpiredChannelData: async () => {
        profileRuns.push('erase');
      },
      clearExpiredProfiles: async () => {
        profileRuns.push('clear');
      },
      checkAnalytics: async (
        _: unknown,
        id: string,
        __: string,
        ___: boolean,
        readManualOnly: boolean,
      ) => {
        assert.equal(readManualOnly, true);
        if (overviewFails) {
          throw new Error('X is down');
        }
        overviews.push(id);
        return [];
      },
    },
    // The ledger, faked: a key is charged once, as the real one makes it.
    {
      creditPricing: async () => creditPricing,
      assertAvailable: async (_: string, amount: number) => {
        if (amount > balance) {
          throw insufficientCredits(amount, balance);
        }
      },
      everReserved: async (_: string, key: string) =>
        spends.some((spend) => spend.key === key),
      spend: async (_: string, spend: { key: string; amount: number }) => {
        if (!spends.some((s) => s.key === spend.key)) {
          spends.push({ key: spend.key, amount: spend.amount });
          balance -= spend.amount;
        }
        return { id: spend.key, charged: true };
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
  prunes = [];
  pruneCounts = [];
  pruneFails = false;
  profileRuns = [];
  claims = 0;
  capturedToday = {};
  creditPricing = 'legacy';
  balance = 0;
  spends = [];
  overviewFails = false;
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
    assert.deepEqual(status, {
      integrations: 0,
      lastSyncedAt: null,
      credits: 0,
    });
  });
});

describe('manual refresh on the credits balance', () => {
  it('costs nothing on the list sold before v2', async () => {
    assert.equal((await service().manualRefreshStatus('org-1')).credits, 0);
    await service().manualRefresh('org-1');
    assert.deepEqual(reads, ['release-int-x']);
    assert.deepEqual(spends, []);
  });

  it('says what it will cost, and charges each post read and the overview on v2', async () => {
    creditPricing = 'v2';
    balance = 1000;
    // one post not read today, and the overview: 25 + 50
    assert.equal((await service().manualRefreshStatus('org-1')).credits, 0.75);
    await service().manualRefresh('org-1');
    assert.deepEqual(
      spends.map((spend) => spend.amount),
      [25, 50]
    );
    assert.match(spends[0].key, /^post-metrics:int-x:/);
    assert.match(spends[1].key, /^account-metrics:int-x:\d{4}-\d{2}-\d{2}$/);
    assert.equal(balance, 925);
  });

  it('charges nothing again the same day, once the cooldown has passed', async () => {
    creditPricing = 'v2';
    balance = 1000;
    await service().manualRefresh('org-1');
    lastSnapshot['int-x'] = new Date(Date.now() - 60 * 60 * 1000);
    assert.equal((await service().manualRefreshStatus('org-1')).credits, 0);
    await service().manualRefresh('org-1');
    assert.deepEqual(reads, ['release-int-x', 'release-int-x']);
    assert.equal(balance, 925);
  });

  it('is refused with a 402 before anything is read when the balance cannot pay', async () => {
    creditPricing = 'v2';
    balance = 74;
    await assert.rejects(
      service().manualRefresh('org-1'),
      (err) => err instanceof HttpException && err.getStatus() === 402
    );
    assert.deepEqual(reads, []);
    assert.deepEqual(overviews, []);
    assert.equal(claims, 0);
    assert.deepEqual(spends, []);
  });

  it('charges nothing for an overview it could not read', async () => {
    creditPricing = 'v2';
    balance = 1000;
    overviewFails = true;
    const result = await service().manualRefresh('org-1');
    assert.equal(result.failed, 1);
    assert.deepEqual(
      spends.map((spend) => spend.amount),
      [25]
    );
  });
});

describe('post metrics retention', () => {
  it('deletes snapshots past a provider retention, and none for providers without it', async () => {
    await service().pruneExpiredSnapshots();
    assert.equal(prunes.length, 1);
    assert.deepEqual(prunes[0].identifiers, ['linkedin']);
    const expected = new Date();
    expected.setUTCHours(0, 0, 0, 0);
    expected.setUTCDate(expected.getUTCDate() - 365);
    assert.equal(prunes[0].before.toISOString(), expected.toISOString());
  });

  it('deletes in batches until one comes back short, and stops at the per-run cap', async () => {
    pruneCounts = [500, 500, 12];
    await service().pruneExpiredSnapshots();
    assert.equal(prunes.length, 3);

    prunes = [];
    pruneCounts = Array(50).fill(500);
    await service().pruneExpiredSnapshots();
    assert.equal(prunes.length, 20);
  });

  it('prunes on the hourly run only, not on an organization sync', async () => {
    await service().listIntegrationsNeedingSync();
    assert.equal(prunes.length, 1);
    await service().maybeEnqueueStaleSync('org-1');
    assert.equal(prunes.length, 1);
  });

  it('reads due channel profiles, erases expired channel data and clears expired profiles on the hourly run only', async () => {
    await service().listIntegrationsNeedingSync();
    assert.deepEqual(profileRuns, ['refresh', 'erase', 'clear']);
    await service().maybeEnqueueStaleSync('org-1');
    assert.deepEqual(profileRuns, ['refresh', 'erase', 'clear']);
  });

  it('still lists the hourly targets when the prune fails', async () => {
    pruneFails = true;
    const targets = await service().listIntegrationsNeedingSync();
    assert.deepEqual(
      targets.map((target: { integrationId: string }) => target.integrationId),
      ['int-li'],
    );
  });
});
