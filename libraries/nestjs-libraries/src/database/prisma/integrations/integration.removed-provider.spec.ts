import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { after, before, describe, it } from 'node:test';

// As in integration.profile.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the service
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
let RETIRED_PROVIDERS: string[];
let socialIntegrationList: { identifier: string }[];
// The repository builds its storage when constructed: keep it the local one.
const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
before(async () => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  if (canLoadService) {
    ({ IntegrationService } = await import('./integration.service.ts'));
    ({ IntegrationRepository } = await import('./integration.repository.ts'));
    ({ RETIRED_PROVIDERS, socialIntegrationList } = await import(
      '../../../integrations/integration.manager.ts'
    ));
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

// 'gone' stands for a network removed from the code while a database still
// has its channels.
const REGISTERED = ['x', 'lemmy'];
const rows = [
  { id: 'a', providerIdentifier: 'x', disabled: false },
  { id: 'b', providerIdentifier: 'gone', disabled: false },
  { id: 'c', providerIdentifier: 'lemmy', disabled: true },
];

const service = (repository: Record<string, unknown>) =>
  new IntegrationService(
    repository,
    {},
    { getAllowedSocialsIntegrations: () => REGISTERED },
    {},
    {},
    {},
    {}
  );

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe(
  'Channels of a provider the build no longer has',
  { skip: !canLoadService },
  () => {
    it('are left out of the workspace list every caller reads', async () => {
      const list = await service({
        getIntegrationsList: async () => rows,
      }).getIntegrationsList('org');
      assert.deepEqual(
        list.map((row: { id: string }) => row.id),
        ['a', 'c']
      );
    });

    it('are switched off at boot when their network is retired', async () => {
      const asked: string[][] = [];
      service({
        disableChannelsOfProviders: async (providers: string[]) => {
          asked.push(providers);
          return 1;
        },
        syncStoredTokenEncryption: async () => 0,
      }).onModuleInit();
      await settle();
      assert.deepEqual(asked, [RETIRED_PROVIDERS]);
    });

    it('never retire a provider the build still has', () => {
      // A provider merely unknown to a build (an older one, after a rollback)
      // is never written: only the retired list is.
      const registered = socialIntegrationList.map((p) => p.identifier);
      assert.ok(RETIRED_PROVIDERS.length > 0);
      assert.deepEqual(
        RETIRED_PROVIDERS.filter((id) => registered.includes(id)),
        []
      );
    });

    it('never fail the boot when the switch-off fails', async () => {
      service({
        disableChannelsOfProviders: async () => {
          throw new Error('database unreachable');
        },
        syncStoredTokenEncryption: async () => 0,
      }).onModuleInit();
      await settle();
    });

    it('are switched off only while live and on', async () => {
      const calls: any[] = [];
      const repository = new IntegrationRepository(
        {
          model: {
            integration: {
              updateMany: async (args: unknown) => {
                calls.push(args);
                return { count: 2 };
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
        {},
        {}
      );
      assert.equal(await repository.disableChannelsOfProviders(['gone']), 2);
      assert.deepEqual(calls, [
        {
          where: {
            providerIdentifier: { in: ['gone'] },
            deletedAt: null,
            disabled: false,
          },
          data: { disabled: true },
        },
      ]);
    });
  }
);
