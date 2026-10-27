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

    it('are looked up by the retired list at boot', async () => {
      const asked: string[][] = [];
      await service({
        getLiveChannelsOfProviders: async (providers: string[]) => {
          asked.push(providers);
          return [];
        },
      }).getRetiredChannels();
      assert.deepEqual(asked, [RETIRED_PROVIDERS]);
    });

    it('are found while live, whether on or off', async () => {
      const calls: any[] = [];
      const repository = new IntegrationRepository(
        {
          model: {
            integration: {
              findMany: async (args: unknown) => {
                calls.push(args);
                return [{ id: 'b', organizationId: 'org' }];
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
      assert.deepEqual(await repository.getLiveChannelsOfProviders(['gone']), [
        { id: 'b', organizationId: 'org' },
      ]);
      // No `disabled` filter: a channel a downgrade switched off keeps its
      // autoDisabledAt and would come back on with an upgrade.
      assert.deepEqual(calls, [
        {
          where: {
            providerIdentifier: { in: ['gone'] },
            deletedAt: null,
          },
          select: { id: true, organizationId: true },
        },
      ]);
    });
  }
);
