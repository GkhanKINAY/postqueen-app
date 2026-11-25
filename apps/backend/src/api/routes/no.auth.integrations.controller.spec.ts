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
const connect = async (
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
    },
    { startRefreshWorkflow: async () => false },
    { getOrgById: async () => ({ id: 'org-1', isTrailing: false }) },
    {}
  );

  await controller.connectSocialMedia('network', {
    state: 'state-1',
    code: 'code',
    timezone: '0',
  });

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
