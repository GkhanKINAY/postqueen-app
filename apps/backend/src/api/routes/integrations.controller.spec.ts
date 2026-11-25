import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { before, describe, it } from 'node:test';

// As in no.auth.integrations.controller.spec.ts: tsx follows tsconfig's
// mapping of `file-type` and `mime` to their declarations, so the code the
// controller imports is pointed at the packages' own entries. On a Node
// without registerHooks the spec is skipped rather than failed.
const entries: Record<string, string> = {
  'file-type': '../../../../../node_modules/file-type/source/index.js',
  mime: '../../../../../node_modules/mime/dist/src/index.js',
};
const canLoad = typeof nodeModule.registerHooks === 'function';
if (canLoad) {
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

let IntegrationsController: any;
let IntegrationService: any;
before(async () => {
  process.env.DATABASE_URL ||= 'postgresql://spec:spec@127.0.0.1:1/spec';
  if (!canLoad) {
    return;
  }
  ({ IntegrationsController } = await import('./integrations.controller.ts'));
  ({ IntegrationService } = await import(
    '../../../../../libraries/nestjs-libraries/src/database/prisma/integrations/integration.service.ts'
  ));
});

// POST /integrations/function on a channel whose token is past its stored
// expiry. Records the refreshes asked for and the token the provider got.
const call = async (
  channel: Record<string, unknown>,
  options: {
    callable?: boolean;
    refreshed?: boolean;
    pageRequiredToPost?: boolean;
  } = {}
) => {
  const refreshes: string[] = [];
  const tokens: string[] = [];
  const provider = {
    pageRequiredToPost: options.pageRequiredToPost ?? true,
    pages: async (token: string) => {
      tokens.push(token);
      return [{ id: 'page-1' }];
    },
  };
  const controller = new IntegrationsController(
    { getSocialIntegration: () => provider },
    {
      getIntegrationByIdNotDeleted: async () => ({
        id: 'channel-1',
        providerIdentifier: 'facebook',
        token: 'stored-token',
        refreshToken: 'stored-refresh',
        internalId: 'user-1',
        rootInternalId: 'user-1',
        inBetweenSteps: false,
        ...channel,
      }),
      isCallableFunction: () => options.callable ?? true,
      // The service's own rule, which reads nothing but its arguments.
      needsPageSelection: IntegrationService.prototype.needsPageSelection,
      withFunctionCredits: async (
        _org: string,
        _integration: unknown,
        _name: string,
        _data: unknown,
        run: () => Promise<unknown>
      ) => run(),
    },
    {},
    {
      isExpired: () => true,
      refresh: async (integration: { id: string }) => {
        refreshes.push(integration.id);
        return options.refreshed === false
          ? false
          : { accessToken: 'fresh-token', refreshToken: 'fresh-refresh' };
      },
    }
  );

  const result = await controller
    .functionIntegration({ id: 'org-1' }, { id: 'channel-1', name: 'pages' })
    .catch((err: unknown) => ({ failed: err }));
  return { result, refreshes, tokens };
};

describe('a provider function call on an expired token', { skip: !canLoad }, () => {
  it("refreshes it first for a channel that still holds its login's id", async () => {
    for (const inBetweenSteps of [false, true]) {
      const { result, refreshes, tokens } = await call({ inBetweenSteps });

      assert.deepEqual(refreshes, ['channel-1']);
      assert.deepEqual(tokens, ['fresh-token']);
      assert.deepEqual(result, [{ id: 'page-1' }]);
    }
  });

  it('calls a finished channel with its stored token, as a failed refresh would flag it', async () => {
    const { result, refreshes, tokens } = await call({ internalId: 'page-1' });

    assert.deepEqual(refreshes, []);
    assert.deepEqual(tokens, ['stored-token']);
    assert.deepEqual(result, [{ id: 'page-1' }]);
  });

  // The renewal writes inBetweenSteps: false, so a channel that has only the
  // flag would come out of it looking finished, its page never picked.
  it('refreshes nothing for a channel that has only the flag', async () => {
    for (const [channel, options] of [
      [{ inBetweenSteps: true }, { pageRequiredToPost: false }],
      [{ inBetweenSteps: true, internalId: 'page-0' }, {}],
    ] as const) {
      const { refreshes, tokens } = await call(channel, options);

      assert.deepEqual(refreshes, []);
      assert.deepEqual(tokens, ['stored-token']);
    }
  });

  it('answers false without calling the provider when the refresh fails', async () => {
    const { result, tokens } = await call({}, { refreshed: false });

    assert.equal(result, false);
    assert.deepEqual(tokens, []);
  });

  it('refreshes nothing for a function that may not be called', async () => {
    const { result, refreshes } = await call({}, { callable: false });

    assert.equal(result.failed?.getStatus?.(), 400);
    assert.deepEqual(refreshes, []);
  });
});

describe('the channel list', { skip: !canLoad }, () => {
  it('shows a channel as unfinished while it is flagged, or still holds the login id where a page is needed', async () => {
    const row = (id: string, provider: string, fields: Record<string, unknown>) => ({
      id,
      name: id,
      providerIdentifier: provider,
      internalId: 'login-1',
      rootInternalId: 'login-1',
      inBetweenSteps: false,
      postingTimes: '[]',
      ...fields,
    });
    const providers: Record<string, Record<string, unknown>> = {
      facebook: { editor: 'normal', pageRequiredToPost: true },
      youtube: { editor: 'normal' },
    };
    const controller = new IntegrationsController(
      { getSocialIntegration: (name: string) => providers[name] },
      {
        getIntegrationsList: async () => [
          row('fb-renewed', 'facebook', {}),
          row('fb-done', 'facebook', { internalId: 'page-1' }),
          row('yt-flagged', 'youtube', { inBetweenSteps: true }),
          row('yt-done', 'youtube', {}),
        ],
        needsPageSelection: IntegrationService.prototype.needsPageSelection,
      },
      {},
      {}
    );

    const { integrations } = await controller.getIntegrationList({
      id: 'org-1',
    });

    assert.deepEqual(
      Object.fromEntries(
        integrations.map((p: { id: string; inBetweenSteps: boolean }) => [
          p.id,
          p.inBetweenSteps,
        ])
      ),
      {
        'fb-renewed': true,
        'fb-done': false,
        'yt-flagged': true,
        'yt-done': false,
      }
    );
  });
});
