import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { after, before, describe, it } from 'node:test';

// As in integration.pages.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the controller
// imports is pointed at the packages' own entries. On a Node without
// registerHooks the spec is skipped rather than failed.
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

let NoAuthIntegrationsController: any;
let NotEnoughScopes: any;
let ioRedis: any;
let redisGet: any;
let redisDel: any;
before(async () => {
  process.env.DATABASE_URL ||= 'postgresql://spec:spec@127.0.0.1:1/spec';
  if (!canLoad) {
    return;
  }
  ({ NoAuthIntegrationsController } = await import(
    './no.auth.integrations.controller.ts'
  ));
  ({ ioRedis } = await import(
    '../../../../../libraries/nestjs-libraries/src/redis/redis.service.ts'
  ));
  ({ NotEnoughScopes } = await import(
    '../../../../../libraries/nestjs-libraries/src/integrations/social.abstract.ts'
  ));
  redisGet = ioRedis.get;
  redisDel = ioRedis.del;
});
after(() => {
  if (ioRedis) {
    ioRedis.get = redisGet;
    ioRedis.del = redisDel;
  }
});

// The arguments of createOrUpdateIntegration after the connect: the person
// (platformUserId, 17th) and the login the channel belongs to from now on
// (rootInternalId, 18th).
const attempt = async (
  provider: Record<string, unknown>,
  refresh: string | null
) => {
  ioRedis.get = async (key: string) =>
    ({
      'login:state-1': 'verifier',
      'organization:state-1': 'org-1',
      ...(refresh ? { 'refresh:state-1': refresh } : {}),
    })[key] ?? null;
  ioRedis.del = async () => 1;

  const writes: any[][] = [];
  const spent: string[] = [];
  const controller = new NoAuthIntegrationsController(
    {
      getAllowedSocialsIntegrations: () => ['network'],
      getSocialIntegration: () => provider,
    },
    {
      assertConnectAllowed: () => undefined,
      checkPreviousConnections: async () => false,
      migrateIntegration: async () => undefined,
      migrateIntegrationOnConnect: async () => undefined,
      createOrUpdateIntegration: async (...args: any[]) => {
        writes.push(args);
        return { id: 'channel-1' };
      },
      spendConnectLink: async (state: string) => {
        spent.push(state);
      },
    },
    { startRefreshWorkflow: async () => false },
    { getOrgById: async () => ({ id: 'org-1', isTrailing: false }) },
    {}
  );

  const result = await controller
    .connectSocialMedia('network', {
      state: 'state-1',
      code: 'code',
      timezone: '0',
    })
    .catch((err: unknown) => ({ failed: err }));

  return { writes, result, spent };
};

const connect = async (
  provider: Record<string, unknown>,
  refresh: string | null
) => {
  const { writes } = await attempt(provider, refresh);

  assert.equal(writes.length, 1);
  return {
    internalId: writes[0][6],
    platformUserId: writes[0][16],
    rootInternalId: writes[0][17],
  };
};

const login = (id: string) => async () => ({
  id,
  accessToken: 'token',
  refreshToken: 'refresh',
  expiresIn: 3600,
  name: 'Someone',
  picture: '',
  username: 'someone',
  platformUserId: 'person-1',
});

describe('the root a connect states', { skip: !canLoad }, () => {
  it('is the login for a first connect of a oneTimeToken provider', async () => {
    assert.deepEqual(
      await connect(
        {
          oneTimeToken: true,
          isBetweenSteps: true,
          authenticate: login('network_member-1'),
          reConnect: async () => {
            throw new Error('not a reconnect');
          },
          companies: async () => [],
        },
        null
      ),
      {
        internalId: 'network_member-1',
        platformUserId: 'person-1',
        rootInternalId: 'network_member-1',
      }
    );
  });

  it('is the login that did a reconnect, whatever the page', async () => {
    for (const oneTimeToken of [true, false]) {
      assert.deepEqual(
        await connect(
          {
            oneTimeToken,
            isBetweenSteps: true,
            authenticate: login('network_member-2'),
            reConnect: async () => ({
              id: '5001',
              name: 'Brand',
              accessToken: 'page-token',
              picture: '',
              username: 'brand',
            }),
          },
          '5001'
        ),
        {
          internalId: '5001',
          platformUserId: 'person-1',
          rootInternalId: 'network_member-2',
        },
        `oneTimeToken: ${oneTimeToken}`
      );
    }
  });

  it('is left to the channel for any other provider', async () => {
    assert.deepEqual(
      await connect(
        { isBetweenSteps: false, authenticate: login('account-1') },
        null
      ),
      {
        internalId: 'account-1',
        platformUserId: 'person-1',
        rootInternalId: undefined,
      }
    );
  });
});

describe('a connect whose pages cannot be listed', { skip: !canLoad }, () => {
  const twoStep = (pages: () => Promise<unknown[]>) => ({
    isBetweenSteps: true,
    authenticate: login('account-1'),
    pages,
  });

  it('is refused before any channel is saved', async () => {
    const { writes, result } = await attempt(
      twoStep(async () => {
        throw new Error('Request failed with status code 500');
      }),
      null
    );

    assert.equal(writes.length, 0);
    assert.ok(result.failed instanceof NotEnoughScopes);
    assert.match(
      result.failed.message,
      /could not load the pages or accounts of this channel/
    );
  });

  it("keeps the provider's own reason, as for an account without a channel", async () => {
    const { writes, result } = await attempt(
      twoStep(async () => {
        throw new NotEnoughScopes('This Google account has no YouTube channel');
      }),
      null
    );

    assert.equal(writes.length, 0);
    assert.equal(
      result.failed.message,
      'This Google account has no YouTube channel'
    );
  });

  it('saves the channel and hands the pages over when they can be listed, an empty list included', async () => {
    for (const listed of [[{ id: 'page-1', name: 'Brand' }], []]) {
      const { writes, result } = await attempt(
        twoStep(async () => listed),
        null
      );

      assert.equal(writes.length, 1);
      assert.deepEqual(result.pages, listed);
    }
  });

  it('lists nothing on a reconnect', async () => {
    let asked = 0;
    const { writes } = await attempt(
      twoStep(async () => {
        asked++;
        throw new Error('not asked on a reconnect');
      }),
      'account-1'
    );

    assert.equal(asked, 0);
    assert.equal(writes.length, 1);
  });
});

describe('a connect link', { skip: !canLoad }, () => {
  const controller = (
    redis: Record<string, string>,
    deleted: string[],
    extra: {
      org?: Record<string, unknown> | null;
      canCreateChannel?: boolean;
      started?: string[];
    } = {}
  ) => {
    ioRedis.get = async (key: string) => redis[key] ?? null;
    ioRedis.del = async (key: string) => {
      deleted.push(key);
      return 1;
    };
    return new NoAuthIntegrationsController(
      {
        getAllowedSocialsIntegrations: () => ['network'],
        getSocialIntegration: () => ({
          isBetweenSteps: false,
          authenticate: login('account-1'),
        }),
      },
      {
        assertConnectAllowed: () => undefined,
        checkPreviousConnections: async () => false,
        migrateIntegration: async () => undefined,
        migrateIntegrationOnConnect: async () => undefined,
        createOrUpdateIntegration: async () => ({ id: 'channel-1' }),
        spendConnectLink: async () => undefined,
        getConnectLinkOrganization: async () => 'org-1',
        startConnectLink: async (token: string) => {
          extra.started?.push(token);
          return { url: 'https://network.example/oauth' };
        },
      },
      { startRefreshWorkflow: async () => false },
      {
        getOrgById: async () =>
          extra.org === undefined
            ? { id: 'org-1', isTrailing: false, createdAt: new Date() }
            : extra.org,
      },
      {},
      {
        check: async () => ({
          can: () => extra.canCreateChannel ?? true,
        }),
      }
    );
  };

  it('hands its address back to be offered, never to be followed', async () => {
    const deleted: string[] = [];
    const result = await controller(
      {
        'login:state-1': 'verifier',
        'organization:state-1': 'org-1',
        'continue:state-1': 'https://client.example.com/done',
      },
      deleted
    ).connectSocialMedia('network', {
      state: 'state-1',
      code: 'code',
      timezone: '0',
    });

    assert.equal(result.continueURL, 'https://client.example.com/done');
    assert.equal(result.returnURL, undefined);
    assert.ok(deleted.includes('continue:state-1'));
  });

  it("refuses to start once the workspace's plan has no channel left, without a billing answer", async () => {
    const started: string[] = [];
    await assert.rejects(
      controller({}, [], { canCreateChannel: false, started }).startConnectLink(
        'token'
      ),
      (err: any) => err.getStatus() === 400 && /channel limit/.test(err.message)
    );
    assert.deepEqual(started, []);
  });

  it('reads a removed workspace as an expired link', async () => {
    const started: string[] = [];
    await assert.rejects(
      controller({}, [], {
        org: { id: 'org-1', deletedAt: new Date() },
        started,
      }).startConnectLink('token'),
      (err: any) => err.getStatus() === 404
    );
    assert.deepEqual(started, []);
  });

  it('starts the sign-in while the plan has room', async () => {
    const started: string[] = [];
    assert.deepEqual(
      await controller({}, [], { started }).startConnectLink('token'),
      { url: 'https://network.example/oauth' }
    );
    assert.deepEqual(started, ['token']);
  });
});

describe('the link a connect came through', { skip: !canLoad }, () => {
  it('is spent once the channel is saved', async () => {
    const { writes, spent } = await attempt(
      { isBetweenSteps: false, authenticate: login('account-1') },
      null
    );
    assert.equal(writes.length, 1);
    assert.deepEqual(spent, ['state-1']);
  });

  it('stays usable after a sign-in that failed or was cancelled', async () => {
    for (const authenticate of [
      async () => 'The user cancelled',
      async () => {
        throw new Error('access_denied');
      },
    ]) {
      const { writes, spent } = await attempt(
        { isBetweenSteps: false, authenticate },
        null
      );
      assert.equal(writes.length, 0);
      assert.deepEqual(spent, []);
    }
  });
});
