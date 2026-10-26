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
// The repository builds its storage when constructed: keep it the local one.
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

// The row a fresh login left waiting for its page to be picked.
const freshLogin = (overrides: Record<string, unknown> = {}) => ({
  id: 'fresh',
  organizationId: 'org',
  providerIdentifier: 'youtube',
  type: 'social',
  internalId: 'login-b',
  rootInternalId: 'login-b',
  inBetweenSteps: true,
  token: 'user-token-b',
  refreshToken: 'refresh-b',
  tokenExpiration: new Date('2026-10-27T12:00:00Z'),
  platformUserId: null,
  ...overrides,
});

const serviceSaving = (row: Record<string, unknown>) => {
  const saved: Array<{ id: string; params: Record<string, unknown> }> = [];
  const service = new IntegrationService(
    {
      getIntegrationByIdNotDeleted: async () => row,
      checkForDeletedOnceAndUpdate: async () => undefined,
      updateIntegration: async (id: string, params: Record<string, unknown>) => {
        saved.push({ id, params });
        return { id: 'kept' };
      },
    },
    {},
    {
      getSocialIntegration: () => ({
        fetchPageInformation: async () => ({
          id: 'page-1',
          name: 'Brand channel',
          picture: '',
          access_token: 'page-token',
          username: 'brand',
        }),
      }),
    },
    {},
    {},
    {},
    {}
  );
  return { service, saved };
};

describe('IntegrationService.saveProviderPage', { skip: !canLoadService }, () => {
  it("hands the picked page the fresh login's identity and refresh token", async () => {
    const { service, saved } = serviceSaving(freshLogin());

    await service.saveProviderPage('org', 'fresh', { page: 'page-1' });

    assert.equal(saved.length, 1);
    assert.equal(saved[0].params.rootInternalId, 'login-b');
    assert.equal(saved[0].params.refreshToken, 'refresh-b');
    assert.deepEqual(
      saved[0].params.tokenExpiration,
      new Date('2026-10-27T12:00:00Z')
    );
  });

  it('never sends an empty refresh token or identity over a stored one', async () => {
    const { service, saved } = serviceSaving(
      freshLogin({ refreshToken: '', rootInternalId: null })
    );

    await service.saveProviderPage('org', 'fresh', { page: 'page-1' });

    assert.equal('refreshToken' in saved[0].params, false);
    assert.equal('rootInternalId' in saved[0].params, false);
  });
});

describe('IntegrationRepository.createExtraProviderPage', { skip: !canLoadService }, () => {
  const repositoryWith = (existing: Record<string, unknown> | null) => {
    const writes: Array<{ kind: string; data: Record<string, unknown> }> = [];
    const integration = {
      findUnique: async () => existing,
      update: async ({ data }: any) => {
        writes.push({ kind: 'update', data });
        return { id: existing?.id, ...data };
      },
      create: async ({ data }: any) => {
        writes.push({ kind: 'create', data });
        return { id: 'new', ...data };
      },
    };
    const repository = new IntegrationRepository(
      { model: { integration } },
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
    return { repository, writes };
  };
  const page = {
    name: 'Second page',
    internalId: 'page-2',
    token: 'page-2-token',
    username: 'second',
  };

  it('moves a live row it takes over to the login whose tokens it now holds', async () => {
    const { repository, writes } = repositoryWith({
      id: 'old-row',
      deletedAt: null,
      rootInternalId: 'login-a',
    });

    await repository.createExtraProviderPage(freshLogin(), page);

    assert.equal(writes.length, 1);
    assert.equal(writes[0].kind, 'update');
    assert.equal(writes[0].data.rootInternalId, 'login-b');
    assert.equal(writes[0].data.refreshToken, 'refresh-b');
  });

  it('groups a new row under the login as before', async () => {
    const { repository, writes } = repositoryWith(null);

    await repository.createExtraProviderPage(freshLogin(), page);

    assert.equal(writes[0].kind, 'create');
    assert.equal(writes[0].data.rootInternalId, 'login-b');
  });
});
