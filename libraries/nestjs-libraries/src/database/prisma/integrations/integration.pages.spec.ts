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

const serviceSaving = (
  row: Record<string, unknown>,
  answer: { id: string } | null = { id: 'kept' },
  connected: Record<string, unknown> | null = null,
  provider: Record<string, unknown> = {}
) => {
  const saved: Array<{
    id: string;
    params: Record<string, unknown>;
    read: Record<string, unknown>;
  }> = [];
  const service = new IntegrationService(
    {
      getIntegrationByIdNotDeleted: async () => row,
      getIntegrationByInternalId: async () => connected,
      checkForDeletedOnceAndUpdate: async () => undefined,
      updateIntegration: async (
        id: string,
        params: Record<string, unknown>,
        read: Record<string, unknown>
      ) => {
        saved.push({ id, params, read });
        return answer;
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
        ...provider,
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

  // The page's earlier row keeps living: under the new login's root, the
  // previous login's refresh token would keep renewing it.
  it("sends the login's refresh token with its root even when it is empty", async () => {
    const { service, saved } = serviceSaving(freshLogin({ refreshToken: '' }));

    await service.saveProviderPage('org', 'fresh', { page: 'page-1' });

    assert.equal(saved[0].params.rootInternalId, 'login-b');
    assert.equal(saved[0].params.refreshToken, '');
  });

  it('saves the page only on the channel as it was read', async () => {
    const { service, saved } = serviceSaving(freshLogin());

    await service.saveProviderPage('org', 'fresh', { page: 'page-1' });

    assert.equal(saved[0].read.providerIdentifier, 'youtube');
    assert.equal(saved[0].read.internalId, 'login-b');
  });

  it("refuses a page that is already another provider's channel, before writing anything", async () => {
    const { service, saved } = serviceSaving(freshLogin(), { id: 'kept' }, {
      id: 'standalone',
      providerIdentifier: 'instagram-standalone',
    });

    await assert.rejects(
      service.saveProviderPage('org', 'fresh', { page: 'page-1' }),
      (err: any) =>
        err?.getStatus?.() === 400 &&
        /already connected as another channel/.test(err.message)
    );
    assert.equal(saved.length, 0);
  });

  it('saves a page this provider already has here, as before', async () => {
    const { service, saved } = serviceSaving(freshLogin(), { id: 'kept' }, {
      id: 'earlier',
      providerIdentifier: 'youtube',
    });

    await service.saveProviderPage('org', 'fresh', { page: 'page-1' });

    assert.equal(saved.length, 1);
  });

  // A renewal writes inBetweenSteps: false, also over a channel that never
  // picked its page; the channel list shows it as unfinished again.
  it('takes the pick of a channel a renewal turned the flag off for, while it still holds the login id', async () => {
    const { service, saved } = serviceSaving(
      freshLogin({ inBetweenSteps: false }),
      { id: 'kept' },
      null,
      { pageRequiredToPost: true }
    );

    await service.saveProviderPage('org', 'fresh', { page: 'page-1' });

    assert.equal(saved.length, 1);
    assert.equal(saved[0].params.internalId, 'page-1');
  });

  it('refuses a pick for a channel that already has its page, or posts with the login itself', async () => {
    for (const [row, provider] of [
      [freshLogin({ inBetweenSteps: false, internalId: 'page-0' }), { pageRequiredToPost: true }],
      [freshLogin({ inBetweenSteps: false }), {}],
      [
        freshLogin({ inBetweenSteps: false, internalId: '1001', rootInternalId: '1001' }),
        { pageRequiredToPost: true, isPageId: (id: string) => /^\d+$/.test(id) },
      ],
    ] as const) {
      const { service, saved } = serviceSaving(row, { id: 'kept' }, null, provider);

      await assert.rejects(
        service.saveProviderPage('org', 'fresh', { page: 'page-1' }),
        (err: any) => err?.getStatus?.() === 400
      );
      assert.equal(saved.length, 0);
    }
  });

  it('refuses the save when the channel became another one meanwhile', async () => {
    const { service } = serviceSaving(freshLogin(), null);

    await assert.rejects(
      service.saveProviderPage('org', 'fresh', { page: 'page-1' }),
      (err: any) => err?.getStatus?.() === 400
    );
  });
});

describe('IntegrationService.needsPageSelection', { skip: !canLoadService }, () => {
  const service = () =>
    new IntegrationService({}, {}, {}, {}, {}, {}, {});
  const channel = (fields: Record<string, unknown> = {}) => ({
    inBetweenSteps: false,
    internalId: 'login-1',
    rootInternalId: 'login-1',
    ...fields,
  });
  const needsPage = { pageRequiredToPost: true };
  const knowsPageIds = {
    pageRequiredToPost: true,
    isPageId: (id: string) => /^\d+$/.test(id),
  };

  // The post workflows fail a post on the flag whatever the provider.
  it('keeps every channel that is still flagged, whatever its provider', () => {
    for (const provider of [needsPage, {}, undefined]) {
      assert.equal(
        service().needsPageSelection(
          channel({ inBetweenSteps: true, internalId: 'UC-1' }),
          provider
        ),
        true
      );
    }
  });

  it("adds a channel whose renewal turned the flag off while it still holds the login's id", () => {
    assert.equal(service().needsPageSelection(channel(), needsPage), true);
  });

  it('leaves out a finished channel, a provider that posts with the login, and a root that is a page id', () => {
    assert.equal(
      service().needsPageSelection(channel({ internalId: 'page-1' }), needsPage),
      false
    );
    assert.equal(service().needsPageSelection(channel(), {}), false);
    assert.equal(service().needsPageSelection(channel(), undefined), false);
    assert.equal(
      service().needsPageSelection(channel({ rootInternalId: null }), needsPage),
      false
    );
    assert.equal(
      service().needsPageSelection(
        channel({ internalId: '1001', rootInternalId: '1001' }),
        knowsPageIds
      ),
      false
    );
    assert.equal(
      service().needsPageSelection(
        channel({
          internalId: 'linkedin-page_m1',
          rootInternalId: 'linkedin-page_m1',
        }),
        knowsPageIds
      ),
      true
    );
  });
});

describe('IntegrationRepository.createExtraProviderPage', { skip: !canLoadService }, () => {
  const repositoryWith = (existing: Record<string, unknown> | null) => {
    const writes: Array<{ kind: string; data: Record<string, unknown> }> = [];
    const integration = {
      findFirst: async () => existing,
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
