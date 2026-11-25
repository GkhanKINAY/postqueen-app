import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { after, before, beforeEach, describe, it } from 'node:test';

// As in integration.pages.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the repository
// imports is pointed at the packages' own entries. On a Node without
// registerHooks the spec is skipped rather than failed.
const entries: Record<string, string> = {
  'file-type': '../../../../../../node_modules/file-type/source/index.js',
  mime: '../../../../../../node_modules/mime/dist/src/index.js',
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

let IntegrationRepository: any;
let IntegrationService: any;
// The repository builds its storage when constructed: keep it the local one.
const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
before(async () => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  if (canLoad) {
    ({ IntegrationRepository } = await import('./integration.repository.ts'));
    ({ IntegrationService } = await import('./integration.service.ts'));
  }
});
after(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

// The channel table in memory, over the Prisma calls the repository makes:
// enough to run a connect, a renewal and a page pick end to end, including
// the unique (organizationId, internalId) the database enforces.
type Row = Record<string, any>;
let rows: Row[];
let ids: number;
// The integrations whose posts were soft-deleted.
let postsRemoved: string[];

const matches = (row: Row, where: Row = {}): boolean =>
  Object.entries(where).every(([field, rule]) => {
    if (rule === undefined) {
      return true;
    }
    if (field === 'NOT') {
      return (Array.isArray(rule) ? rule : [rule]).every(
        (part: Row) => !matches(row, part)
      );
    }
    if (field === 'OR') {
      return rule.some((part: Row) => matches(row, part));
    }
    if (field === 'organizationId_internalId') {
      return (
        row.organizationId === rule.organizationId &&
        row.internalId === rule.internalId
      );
    }
    const value = row[field] ?? null;
    if (rule !== null && typeof rule === 'object' && !(rule instanceof Date)) {
      return (
        (!('not' in rule) || value !== rule.not) &&
        (!('in' in rule) || rule.in.includes(value))
      );
    }
    return value === rule;
  });

const pick = (row: Row, select?: Row) =>
  select
    ? Object.fromEntries(
        Object.keys(select)
          .filter((key) => select[key])
          .map((key) => [key, row[key] ?? null])
      )
    : { ...row };

const write = (row: Row, data: Row) => {
  const next = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  if (
    rows.some(
      (other) =>
        other !== row &&
        other.organizationId === next.organizationId &&
        other.internalId === next.internalId
    )
  ) {
    throw new Error('Unique constraint failed on (organizationId, internalId)');
  }
  return Object.assign(row, next);
};

const create = (data: Row) => {
  const row: Row = { id: `row-${++ids}`, deletedAt: null };
  rows.push(row);
  try {
    return write(row, data);
  } catch (err) {
    rows.splice(rows.indexOf(row), 1);
    throw err;
  }
};

const integration = {
  findUnique: async ({ where, select }: Row) => {
    const row = rows.find((r) => matches(r, where));
    return row ? pick(row, select) : null;
  },
  findFirst: async ({ where, select }: Row) => {
    const row = rows.find((r) => matches(r, where));
    return row ? pick(row, select) : null;
  },
  update: async ({ where, data, select }: Row) => {
    const row = rows.find((r) => matches(r, where));
    if (!row) {
      throw new Error('Record to update not found');
    }
    return pick(write(row, data), select);
  },
  updateMany: async ({ where, data }: Row) => {
    const hit = rows.filter((r) => matches(r, where));
    hit.forEach((row) => write(row, data));
    return { count: hit.length };
  },
  create: async ({ data, select }: Row) => pick(create(data), select),
  upsert: async ({ where, create: created, update }: Row) => {
    const row = rows.find((r) => matches(r, where));
    return { ...(row ? write(row, update) : create(created)) };
  },
};

const repository = () =>
  new IntegrationRepository(
    { model: { integration } },
    {
      model: {
        post: {
          updateMany: async ({ where }: Row) => {
            postsRemoved.push(where.integrationId);
            return { count: 0 };
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

const channel = (fields: Row) =>
  create({
    type: 'social',
    name: 'Channel',
    inBetweenSteps: false,
    refreshNeeded: false,
    platformUserId: null,
    ...fields,
  });

const byId = (id: string) => rows.find((row) => row.id === id)!;

// createOrUpdateIntegration's positional arguments after the token.
const renewal = (
  org: string,
  internalId: string,
  provider: string,
  token: string,
  expectedRootInternalId: string | null,
  oneTimeToken = true
) =>
  repository().createOrUpdateIntegration(
    undefined,
    oneTimeToken,
    org,
    'Channel',
    undefined,
    'social',
    internalId,
    provider,
    token,
    `${token}-refresh`,
    3600,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    expectedRootInternalId
  );

const connect = (
  org: string,
  internalId: string,
  provider: string,
  token: string,
  options: {
    oneTimeToken?: boolean;
    refreshToken?: string;
    rootInternalId?: string;
  } = {}
) =>
  repository().createOrUpdateIntegration(
    undefined,
    options.oneTimeToken ?? false,
    org,
    'Channel',
    undefined,
    'social',
    internalId,
    provider,
    token,
    options.refreshToken ?? '',
    3600,
    'someone',
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    options.rootInternalId
  );

beforeEach(() => {
  rows = [];
  ids = 0;
  postsRemoved = [];
});

describe('the token copy of a oneTimeToken login', { skip: !canLoad }, () => {
  it("renews the login's channels of the same provider, and no other provider's channel with that id", async () => {
    const own = channel({
      organizationId: 'org-a',
      providerIdentifier: 'linkedin',
      internalId: 'member-1',
      rootInternalId: 'member-1',
      token: 'a-old',
    });
    const sameLogin = channel({
      organizationId: 'org-c',
      providerIdentifier: 'linkedin',
      internalId: 'member-1',
      rootInternalId: 'member-1',
      token: 'c-old',
    });
    const otherProvider = channel({
      organizationId: 'org-b',
      providerIdentifier: 'mastodon-custom',
      internalId: 'member-1',
      rootInternalId: 'member-1',
      token: 'b-own',
      refreshToken: 'b-own-refresh',
    });

    await renewal('org-a', 'member-1', 'linkedin', 'fresh', 'member-1');

    assert.equal(byId(own.id).token, 'fresh');
    assert.equal(byId(sameLogin.id).token, 'fresh');
    assert.equal(byId(otherProvider.id).token, 'b-own');
    assert.equal(byId(otherProvider.id).refreshToken, 'b-own-refresh');
  });

  it("copies a connect's tokens to no other provider's channel either", async () => {
    const otherProvider = channel({
      organizationId: 'org-b',
      providerIdentifier: 'wordpress',
      internalId: 'member-2',
      rootInternalId: 'member-2',
      token: 'b-own',
    });

    await connect('org-a', 'member-2', 'linkedin', 'fresh', {
      oneTimeToken: true,
      refreshToken: 'fresh-refresh',
      rootInternalId: 'member-2',
    });

    assert.equal(byId(otherProvider.id).token, 'b-own');
  });

  it('copies nothing from a channel without a root', async () => {
    channel({
      organizationId: 'org-a',
      providerIdentifier: 'linkedin',
      internalId: 'member-3',
      rootInternalId: null,
      token: 'a-old',
    });
    const usesItAsRoot = channel({
      organizationId: 'org-b',
      providerIdentifier: 'linkedin',
      internalId: 'member-3',
      rootInternalId: 'member-3',
      token: 'b-own',
    });

    await renewal('org-a', 'member-3', 'linkedin', 'fresh', null);

    assert.equal(byId(usesItAsRoot.id).token, 'b-own');
  });

  it('copies nothing to a deleted channel of the login', async () => {
    channel({
      organizationId: 'org-a',
      providerIdentifier: 'linkedin',
      internalId: 'member-4',
      rootInternalId: 'member-4',
      token: 'a-old',
    });
    const removed = channel({
      organizationId: 'org-b',
      providerIdentifier: 'linkedin',
      internalId: 'member-4',
      rootInternalId: 'member-4',
      token: 'gone',
      deletedAt: new Date('2026-11-01T00:00:00Z'),
    });

    await renewal('org-a', 'member-4', 'linkedin', 'fresh', 'member-4');

    assert.equal(byId(removed.id).token, 'gone');
  });
});

describe('a token renewal', { skip: !canLoad }, () => {
  it('is dropped when a reconnect moved the channel to another login in between', async () => {
    const moved = channel({
      organizationId: 'org-a',
      providerIdentifier: 'linkedin-page',
      internalId: '1001',
      rootInternalId: 'linkedin-page_member-new',
      token: 'new-login',
    });
    const previousLogin = channel({
      organizationId: 'org-b',
      providerIdentifier: 'linkedin-page',
      internalId: '1002',
      rootInternalId: 'linkedin-page_member-old',
      token: 'old-login',
    });

    await renewal(
      'org-a',
      '1001',
      'linkedin-page',
      'stale',
      'linkedin-page_member-old'
    );

    assert.equal(byId(moved.id).token, 'new-login');
    assert.equal(byId(previousLogin.id).token, 'old-login');
  });

  it('never brings a deleted channel back', async () => {
    const removed = channel({
      organizationId: 'org-a',
      providerIdentifier: 'linkedin',
      internalId: 'member-5',
      rootInternalId: 'member-5',
      token: 'gone',
      deletedAt: new Date('2026-11-01T00:00:00Z'),
    });

    await renewal('org-a', 'member-5', 'linkedin', 'fresh', 'member-5');

    assert.equal(byId(removed.id).token, 'gone');
    assert.ok(byId(removed.id).deletedAt);
  });
});

describe('a connect', { skip: !canLoad }, () => {
  it("that lands on another provider's channel starts from its own root, without that login's refresh token or person", async () => {
    const replaced = channel({
      organizationId: 'org-a',
      providerIdentifier: 'linkedin',
      internalId: 'shared-id',
      rootInternalId: 'member-9',
      token: 'li-token',
      refreshToken: 'li-refresh',
      platformUserId: 'member-9',
    });

    await connect('org-a', 'shared-id', 'mastodon-custom', 'm-token');

    const row = byId(replaced.id);
    assert.equal(row.providerIdentifier, 'mastodon-custom');
    assert.equal(row.rootInternalId, 'shared-id');
    assert.equal(row.refreshToken, '');
    assert.equal(row.platformUserId, null);
  });

  it('moves a reconnected channel to the login that reconnected it, and drops the previous refresh token', async () => {
    const page = channel({
      organizationId: 'org-a',
      providerIdentifier: 'linkedin-page',
      internalId: '2001',
      // Older rows hold the page id as their root.
      rootInternalId: '2001',
      token: 'old',
      refreshToken: 'old-refresh',
    });
    const otherOrgSamePage = channel({
      organizationId: 'org-b',
      providerIdentifier: 'linkedin-page',
      internalId: '2001',
      rootInternalId: '2001',
      token: 'b-own',
    });

    await connect('org-a', '2001', 'linkedin-page', 'fresh', {
      oneTimeToken: true,
      rootInternalId: 'linkedin-page_member-2',
    });

    assert.equal(byId(page.id).rootInternalId, 'linkedin-page_member-2');
    assert.equal(byId(page.id).refreshToken, '');
    assert.equal(byId(otherOrgSamePage.id).token, 'b-own');
  });

  it('keeps a stored refresh token over an empty one on the same login', async () => {
    const own = channel({
      organizationId: 'org-a',
      providerIdentifier: 'youtube',
      internalId: 'UC-1',
      rootInternalId: 'google-1',
      token: 'old',
      refreshToken: 'kept',
    });

    await connect('org-a', 'UC-1', 'youtube', 'fresh');

    assert.equal(byId(own.id).refreshToken, 'kept');
    assert.equal(byId(own.id).rootInternalId, 'google-1');
  });
});

describe('a page pick', { skip: !canLoad }, () => {
  const params = {
    internalId: 'page-1',
    organizationId: 'org-a',
    name: 'Brand',
    inBetweenSteps: false,
    token: 'page-token',
  };

  it("never hands the page's token to another provider's channel with the page's id", async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      internalId: 'user-1',
      rootInternalId: 'user-1',
      inBetweenSteps: true,
      token: 'user-token',
    });
    const otherProvider = channel({
      organizationId: 'org-a',
      providerIdentifier: 'mastodon-custom',
      internalId: 'page-1',
      rootInternalId: 'page-1',
      token: 'theirs',
    });

    await assert.rejects(
      repository().updateIntegration(picked.id, { ...params }, {
        providerIdentifier: 'facebook',
        internalId: 'user-1',
      })
    );

    assert.equal(byId(otherProvider.id).token, 'theirs');
    assert.equal(byId(otherProvider.id).deletedAt, null);
  });

  it('takes over an earlier channel of the same provider with that page', async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      internalId: 'user-1',
      rootInternalId: 'user-1',
      inBetweenSteps: true,
      token: 'user-token',
    });
    const earlier = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      internalId: 'page-1',
      rootInternalId: 'user-0',
      token: 'old-page-token',
    });

    const result = await repository().updateIntegration(
      picked.id,
      { ...params },
      { providerIdentifier: 'facebook', internalId: 'user-1' }
    );

    assert.deepEqual(result, { id: earlier.id });
    assert.equal(byId(earlier.id).token, 'page-token');
    assert.ok(byId(picked.id).deletedAt);
    assert.deepEqual(postsRemoved, [picked.id]);
  });

  it('writes nothing to a channel removed while its page was looked up', async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      internalId: 'user-1',
      rootInternalId: 'user-1',
      inBetweenSteps: true,
      token: 'user-token',
      deletedAt: new Date('2026-11-25T00:00:00Z'),
    });

    const result = await repository().updateIntegration(
      picked.id,
      { ...params },
      { providerIdentifier: 'facebook', internalId: 'user-1' }
    );

    assert.equal(result, null);
    assert.ok(byId(picked.id).deletedAt);
    assert.equal(byId(picked.id).token, 'user-token');
  });

  it('keeps the posts of a channel put back between steps that picks its own page again', async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      internalId: 'page-1',
      rootInternalId: 'user-1',
      inBetweenSteps: true,
      token: 'old-page-token',
    });

    const result = await repository().updateIntegration(
      picked.id,
      { ...params },
      { providerIdentifier: 'facebook', internalId: 'page-1' }
    );

    assert.deepEqual(result, { id: picked.id });
    assert.equal(byId(picked.id).token, 'page-token');
    assert.equal(byId(picked.id).deletedAt, null);
    assert.deepEqual(postsRemoved, []);
  });

  // A renewal writes inBetweenSteps: false, also over a channel that never
  // picked its page, which then still holds the login's id.
  it('saves the page of a channel a renewal turned the flag off for', async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      internalId: 'user-1',
      rootInternalId: 'user-1',
      inBetweenSteps: false,
      token: 'user-token',
    });

    const result = await repository().updateIntegration(
      picked.id,
      { ...params },
      {
        providerIdentifier: 'facebook',
        internalId: 'user-1',
        inBetweenSteps: false,
      }
    );

    assert.deepEqual(result, { id: picked.id });
    assert.equal(byId(picked.id).internalId, 'page-1');
    assert.equal(byId(picked.id).token, 'page-token');
  });

  it('writes nothing to a channel that got its page while this one was looked up', async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      // read while it still held user-1; another tab picked page-0 since
      internalId: 'page-0',
      rootInternalId: 'user-1',
      inBetweenSteps: false,
      token: 'page-0-token',
    });

    for (const read of ['user-1', 'page-0']) {
      const result = await repository().updateIntegration(
        picked.id,
        { ...params },
        { providerIdentifier: 'facebook', internalId: read, inBetweenSteps: false }
      );

      assert.equal(result, null, `read as ${read}`);
      assert.equal(byId(picked.id).internalId, 'page-0');
      assert.equal(byId(picked.id).token, 'page-0-token');
    }
  });

  // A page whose id is the login's (a Tumblr primary blog) finishes the
  // channel without changing its id.
  it('writes nothing to a channel read as flagged that was finished meanwhile under the same id', async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'tumblr',
      internalId: 'blog-1',
      rootInternalId: 'blog-1',
      inBetweenSteps: false,
      token: 'finished-token',
    });

    const result = await repository().updateIntegration(
      picked.id,
      { ...params },
      { providerIdentifier: 'tumblr', internalId: 'blog-1', inBetweenSteps: true }
    );

    assert.equal(result, null);
    assert.equal(byId(picked.id).internalId, 'blog-1');
    assert.equal(byId(picked.id).token, 'finished-token');
  });

  it('writes nothing when the channel became another one while its page was looked up', async () => {
    const picked = channel({
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      // read as user-1, a reconnect changed it since
      internalId: 'user-2',
      rootInternalId: 'user-2',
      inBetweenSteps: true,
      token: 'user-2-token',
    });

    const result = await repository().updateIntegration(
      picked.id,
      { ...params },
      { providerIdentifier: 'facebook', internalId: 'user-1' }
    );

    assert.equal(result, null);
    assert.equal(byId(picked.id).token, 'user-2-token');
    assert.equal(byId(picked.id).internalId, 'user-2');
  });

  it("does not turn another provider's channel into an extra page", async () => {
    const otherProvider = channel({
      organizationId: 'org-a',
      providerIdentifier: 'mastodon-custom',
      internalId: 'page-2',
      rootInternalId: 'page-2',
      token: 'theirs',
    });
    const template = {
      id: 'tpl',
      organizationId: 'org-a',
      providerIdentifier: 'facebook',
      type: 'social',
      internalId: 'page-1',
      rootInternalId: 'user-1',
      token: 'user-token',
      refreshToken: 'user-refresh',
      tokenExpiration: null,
      platformUserId: null,
    };

    await assert.rejects(
      repository().createExtraProviderPage(template, {
        name: 'Second',
        internalId: 'page-2',
        token: 'page-2-token',
      })
    );

    assert.equal(byId(otherProvider.id).token, 'theirs');
    assert.equal(byId(otherProvider.id).providerIdentifier, 'mastodon-custom');
  });
});

describe('the hourly token renewal', { skip: !canLoad }, () => {
  const renewAll = async (channels: Row[], stored: Row[] = []) => {
    const writes: any[][] = [];
    const { LinkedinPageProvider } = await import(
      '../../../integrations/social/linkedin.page.provider.ts'
    );
    const service = new IntegrationService(
      {
        needsToBeRefreshed: async () => channels,
        getIntegrationById: async (org: string, id: string) =>
          stored.find(
            (row) => row.organizationId === org && row.id === id
          ) || null,
        createOrUpdateIntegration: async (...args: any[]) => {
          writes.push(args);
        },
      },
      {},
      {
        getSocialIntegration: () => ({
          oneTimeToken: true,
          isPageId: LinkedinPageProvider.prototype.isPageId,
          refreshToken: async () => ({
            accessToken: 'fresh',
            refreshToken: 'fresh-refresh',
            expiresIn: 3600,
          }),
        }),
      },
      {},
      {},
      {},
      {}
    );
    await service.refreshTokens();
    return writes.map((args) => ({
      oneTimeToken: args[1],
      expectedRoot: args[18],
    }));
  };

  it('shares tokens only by a root that names the login, and stores them only under the root read', async () => {
    const page = {
      organizationId: 'org-a',
      providerIdentifier: 'linkedin-page',
      name: 'Brand',
      refreshToken: 'old',
    };

    assert.deepEqual(
      await renewAll([
        { ...page, internalId: '3001', rootInternalId: 'linkedin-page_m1' },
        // Older rows hold the page id as their root.
        { ...page, internalId: '3002', rootInternalId: '3002' },
      ]),
      [
        { oneTimeToken: true, expectedRoot: 'linkedin-page_m1' },
        { oneTimeToken: false, expectedRoot: '3002' },
      ]
    );
  });

  it('reads the root again for a row without it, and skips one that is gone', async () => {
    const page = {
      organizationId: 'org-a',
      providerIdentifier: 'linkedin-page',
      name: 'Brand',
      refreshToken: 'old',
    };

    assert.deepEqual(
      await renewAll(
        [
          { ...page, id: 'kept', internalId: '3003' },
          { ...page, id: 'gone', internalId: '3004' },
        ],
        [{ id: 'kept', organizationId: 'org-a', rootInternalId: '3003' }]
      ),
      [{ oneTimeToken: false, expectedRoot: '3003' }]
    );
  });
});

// A renewal the platform refuses: another flow may have stored new tokens
// meanwhile, and otherwise the person is told once, by whichever attempt
// turns the flag on.
describe('the hourly token renewal, refused', { skip: !canLoad }, () => {
  const refuseAll = async (renewedElsewhere: string[], claims: boolean[]) => {
    const log: string[] = [];
    const channel = (id: string) => ({
      id,
      organizationId: 'org-a',
      internalId: `internal-${id}`,
      rootInternalId: `internal-${id}`,
      providerIdentifier: 'tiktok',
      name: id,
      refreshToken: 'old',
    });
    const service = new IntegrationService(
      {
        needsToBeRefreshed: async () => [channel('renewed'), channel('revoked')],
        refreshNeeded: async (_: string, id: string) => {
          log.push(`flag ${id}`);
          return claims.shift() ?? false;
        },
        createOrUpdateIntegration: async () => {
          log.push('write');
        },
      },
      {},
      {
        getSocialIntegration: () => ({
          refreshToken: async () => {
            throw new Error('invalid_grant');
          },
        }),
      },
      {},
      {
        renewedMeanwhile: async (integration: Row) =>
          renewedElsewhere.includes(integration.id)
            ? { accessToken: 'stored', refreshToken: 'stored-refresh' }
            : false,
      },
      {},
      {},
      {}
    );
    service.informAboutRefreshError = async (_: string, integration: Row) => {
      log.push(`notify ${integration.id}`);
    };
    await service.refreshTokens();
    return log;
  };

  it('leaves a channel another flow renewed meanwhile alone', async () => {
    assert.deepEqual(await refuseAll(['renewed'], [true]), [
      'flag revoked',
      'notify revoked',
    ]);
  });

  it('tells the person once, on the run that flags the channel', async () => {
    assert.deepEqual(await refuseAll([], [false, false]), [
      'flag renewed',
      'flag revoked',
    ]);
  });
});

describe('a LinkedIn Page, end to end', { skip: !canLoad }, () => {
  // Two organizations connect the same Page, each through its own admin:
  // connect (placeholder row), pick the Page, then the hourly renewal. Two
  // older rows of that Page, in two more organizations, hold its id as root.
  it('shares no token between the logins of the same Page', async () => {
    const { LinkedinPageProvider } = await import(
      '../../../integrations/social/linkedin.page.provider.ts'
    );
    const repo = repository();
    const service = new IntegrationService(
      repo,
      {},
      {
        getSocialIntegration: () => ({
          oneTimeToken: true,
          isPageId: LinkedinPageProvider.prototype.isPageId,
          fetchPageInformation: async (token: string, { page }: Row) => ({
            id: page,
            name: 'Brand',
            access_token: token,
            username: 'brand',
          }),
          refreshToken: async (refresh: string) => ({
            accessToken: `${refresh}-renewed`,
            refreshToken: `${refresh}-next`,
            expiresIn: 3600,
          }),
        }),
      },
      {},
      {},
      {},
      {}
    );

    for (const [org, member] of [
      ['org-a', 'member-a'],
      ['org-b', 'member-b'],
    ]) {
      const placeholder = `linkedin-page_${member}`;
      const row = await service.createOrUpdateIntegration(
        undefined,
        true,
        org,
        'Admin',
        undefined,
        'social',
        placeholder,
        'linkedin-page',
        `${member}-token`,
        `${member}-refresh`,
        3600,
        'admin',
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        placeholder
      );
      await service.saveProviderPage(org, row.id, { page: '5001' });
    }

    const pages = () =>
      rows.filter((row) => row.internalId === '5001' && !row.deletedAt);
    assert.deepEqual(
      pages().map((row) => [row.organizationId, row.rootInternalId, row.token]),
      [
        ['org-a', 'linkedin-page_member-a', 'member-a-token'],
        ['org-b', 'linkedin-page_member-b', 'member-b-token'],
      ]
    );
    for (const member of ['c', 'd']) {
      channel({
        organizationId: `org-${member}`,
        providerIdentifier: 'linkedin-page',
        internalId: '5001',
        rootInternalId: '5001',
        token: `member-${member}-token`,
        refreshToken: `member-${member}-refresh`,
      });
    }

    // The hourly renewal reads every channel due and renews it.
    repo.needsToBeRefreshed = async () => pages().map((row) => ({ ...row }));
    await service.refreshTokens();

    assert.deepEqual(
      pages().map((row) => [row.organizationId, row.token]),
      [
        ['org-a', 'member-a-refresh-renewed'],
        ['org-b', 'member-b-refresh-renewed'],
        ['org-c', 'member-c-refresh-renewed'],
        ['org-d', 'member-d-refresh-renewed'],
      ]
    );
  });
});
