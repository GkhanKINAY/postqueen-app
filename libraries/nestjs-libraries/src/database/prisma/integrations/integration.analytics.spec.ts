import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, before, beforeEach, describe, it } from 'node:test';

// As in create.post.spec.ts: tsx follows tsconfig's mapping of `file-type`
// and `mime` to their declarations, so the code the service and the
// providers import is pointed at the packages' own entries. registerHooks
// arrived in Node 22.15; on an older 22 the spec is skipped rather than
// failed.
const entries: Record<string, string> = {
  'file-type': '../../../../../../node_modules/file-type/source/index.js',
  mime: '../../../../../../node_modules/mime/dist/src/index.js',
};
const canLoadService = typeof nodeModule.registerHooks === 'function';
if (canLoadService) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      entries[specifier]
        ? {
            url: new URL(entries[specifier], import.meta.url).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let IntegrationService: any;
before(async () => {
  if (canLoadService) {
    ({ IntegrationService } = await import('./integration.service.ts'));
  }
});

let ioRedis: any;
before(async () => {
  ({ ioRedis } = (await import('../../../redis/redis.service.ts')) as any);
});

const series = [
  {
    label: 'Impressions',
    percentageChange: 5,
    data: [{ total: '12', date: '2026-10-10' }],
  },
];

let reads: number[];

// `x` stands for a provider that bills every read, `linkedin` for the rest
const providers: Record<string, any> = {
  x: {
    analyticsManualOnly: true,
    analyticsLookbackDays: 7,
    analytics: async (_: string, __: string, days: number) => {
      reads.push(days);
      return series;
    },
  },
  linkedin: {
    analytics: async (_: string, __: string, days: number) => {
      reads.push(days);
      return series;
    },
  },
};

const service = () =>
  new IntegrationService(
    {
      getIntegrationById: async (_org: string, id: string) => ({
        id,
        type: 'social',
        providerIdentifier: id.startsWith('x') ? 'x' : 'linkedin',
        internalId: 'internal',
        token: 'token',
        deletedAt: null,
      }),
    },
    {},
    { getSocialIntegration: (identifier: string) => providers[identifier] },
    {},
    { isExpired: () => false },
    {},
    {}
  );

const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  // The service builds its storage when constructed: keep it the local one.
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  reads = [];
});

afterEach(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
});

describe(
  'channel analytics of a manual-only provider',
  { skip: !canLoadService && 'needs Node 22.15+ for registerHooks' },
  () => {
    it('answers a page view from storage without asking the network', async () => {
      assert.deepEqual(
        await service().checkAnalytics({ id: 'org-a' }, 'x-1', '7'),
        []
      );
      await ioRedis.set('integration:org-a:x-1:manual', JSON.stringify(series));
      assert.deepEqual(
        await service().checkAnalytics({ id: 'org-a' }, 'x-1', '7'),
        series
      );
      assert.deepEqual(reads, []);
    });

    it('reads its lookback window on Refresh, whatever the period, and stores it', async () => {
      const result = await service().checkAnalytics(
        { id: 'org-b' },
        'x-1',
        '90',
        false,
        true
      );
      assert.deepEqual(result, series);
      assert.deepEqual(reads, [7]);
      assert.equal(
        await ioRedis.get('integration:org-b:x-1:manual'),
        JSON.stringify(series)
      );
    });

    it('keeps the stored numbers when a Refresh reads nothing', async () => {
      await ioRedis.set('integration:org-d:x-1:manual', JSON.stringify(series));
      const analytics = providers.x.analytics;
      providers.x.analytics = async (_: string, __: string, days: number) => {
        reads.push(days);
        return [];
      };
      try {
        const result = await service().checkAnalytics(
          { id: 'org-d' },
          'x-1',
          '7',
          false,
          true
        );
        assert.deepEqual(result, series);
        assert.deepEqual(reads, [7]);
        assert.equal(
          await ioRedis.get('integration:org-d:x-1:manual'),
          JSON.stringify(series)
        );
      } finally {
        providers.x.analytics = analytics;
      }
    });

    it('reads every other provider for the period asked, as before', async () => {
      await service().checkAnalytics({ id: 'org-c' }, 'li-1', '30');
      assert.deepEqual(reads, [30]);
      assert.equal(
        await ioRedis.get('integration:org-c:li-1:30'),
        JSON.stringify(series)
      );
    });
  }
);
