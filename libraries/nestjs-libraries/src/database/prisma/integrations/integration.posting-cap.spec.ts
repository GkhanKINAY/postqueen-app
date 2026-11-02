import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { after, before, describe, it } from 'node:test';

// As in integration.removed-provider.spec.ts: tsx follows tsconfig's mapping
// of `file-type` and `mime` to their declarations, so the code the service
// imports is pointed at the packages' own entries. On a Node without
// registerHooks the spec is skipped rather than failed.
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
let IntegrationRepository: any;
const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
before(async () => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  if (canLoadService) {
    ({ IntegrationService } = await import('./integration.service.ts'));
    ({ IntegrationRepository } = await import('./integration.repository.ts'));
  }
});
after(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
});

// 'capped' stands for a platform with a daily cap on accounts posting through
// PostQueen, 'open' for one without.
const PROVIDERS: Record<string, { name: string; dailyPostingAccountCap?: number }> = {
  capped: { name: 'Capped', dailyPostingAccountCap: 300 },
  open: { name: 'Open' },
};

const run = async (accounts: number) => {
  const counted: string[] = [];
  const alerts: string[] = [];
  const usage = await new IntegrationService(
    {
      countPostingChannels: async (identifier: string, since: Date) => {
        counted.push(identifier);
        // the last 24 hours
        assert.ok(Math.abs(Date.now() - since.getTime() - 86_400_000) < 60_000);
        return accounts;
      },
    },
    {},
    {
      getAllowedSocialsIntegrations: () => Object.keys(PROVIDERS),
      getSocialIntegration: (identifier: string) => PROVIDERS[identifier],
      getSocialIntegrationName: (identifier: string) => PROVIDERS[identifier].name,
    },
    {},
    {},
    {},
    {},
    {
      alert: async (text: string) => {
        alerts.push(text);
        return true;
      },
    }
  ).warnNearPostingAccountCaps();
  return { counted, alerts, usage };
};

describe(
  'The daily check of caps on accounts posting through PostQueen',
  { skip: !canLoadService },
  () => {
    it('counts only the providers that declare a cap', async () => {
      const { counted, usage } = await run(3);
      assert.deepEqual(counted, ['capped']);
      assert.deepEqual(usage, [{ identifier: 'capped', accounts: 3, cap: 300 }]);
    });

    it('stays quiet below half the cap', async () => {
      assert.deepEqual((await run(149)).alerts, []);
    });

    it('warns from half the cap, with the numbers', async () => {
      assert.deepEqual((await run(150)).alerts, [
        'Capped: 150 accounts posted through PostQueen in the last 24 hours, 50% of the 300 a day Capped allows. Ask Capped for a higher limit before it fills up.',
      ]);
      assert.match((await run(300)).alerts[0], /300 accounts .* 100% of the 300/);
    });

    it('counts each channel once, failed and deleted posts included', async () => {
      const calls: any[] = [];
      const repository = new IntegrationRepository(
        {},
        {
          model: {
            post: {
              groupBy: async (args: unknown) => {
                calls.push(args);
                return [{ integrationId: 'a' }, { integrationId: 'b' }];
              },
            },
          },
        },
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {}
      );
      const since = new Date(Date.now() - 86_400_000);
      assert.equal(await repository.countPostingChannels('capped', since), 2);
      // No deletedAt filter: a post deleted after it went out was still
      // posted. ERROR counts: the platform may have counted the attempt. A
      // post due later is not counted.
      const [{ where, ...rest }] = calls;
      assert.deepEqual(rest, { by: ['integrationId'] });
      assert.deepEqual(where.integration, { providerIdentifier: 'capped' });
      assert.deepEqual(where.state, { in: ['PUBLISHED', 'ERROR'] });
      assert.equal(where.publishDate.gte, since);
      assert.ok(Math.abs(where.publishDate.lte.getTime() - Date.now()) < 5_000);
      assert.deepEqual(Object.keys(where).sort(), [
        'integration',
        'publishDate',
        'state',
      ]);
    });
  }
);
