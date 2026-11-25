import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { before, describe, it } from 'node:test';
import dayjs from 'dayjs';

// As in integration.credits.spec.ts: tsx follows tsconfig's mapping of
// `file-type` and `mime` to their declarations, so the code the service and
// the providers import is pointed at the packages' own entries. On a Node
// without registerHooks the spec is skipped rather than failed.
const entries: Record<string, string> = {
  'file-type': '../../../../node_modules/file-type/source/index.js',
  mime: '../../../../node_modules/mime/dist/src/index.js',
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

let service: any;
before(async () => {
  if (!canLoad) {
    return;
  }
  const { RefreshIntegrationService } =
    await import('./refresh.integration.service.ts');
  const providers: Record<string, any> = {
    facebook: new (
      await import('./social/facebook.provider.ts')
    ).FacebookProvider(),
    instagram: new (
      await import('./social/instagram.provider.ts')
    ).InstagramProvider(),
    'instagram-standalone': new (
      await import('./social/instagram.standalone.provider.ts')
    ).InstagramStandaloneProvider(),
    'linkedin-page': new (
      await import('./social/linkedin.page.provider.ts')
    ).LinkedinPageProvider(),
  };
  service = new RefreshIntegrationService(
    { getSocialIntegration: (id: string) => providers[id] } as any,
    {} as any,
    {} as any,
  );
});

const expired = (providerIdentifier: string, tokenExpiration: Date | null) =>
  service.isExpired({ providerIdentifier, tokenExpiration });

const past = dayjs().subtract(1, 'day').toDate();
const future = dayjs().add(1, 'day').toDate();

// Facebook stored now + 59 days for a Page token that never expires, then
// asked the person to reconnect a working channel once that date passed.
describe('RefreshIntegrationService.isExpired', { skip: !canLoad }, () => {
  it('never refreshes a Facebook Page on its stored date', () => {
    assert.equal(expired('facebook', past), false);
    assert.equal(expired('facebook', future), false);
  });

  it('still refreshes the providers whose tokens expire', () => {
    for (const id of ['instagram', 'instagram-standalone', 'linkedin-page']) {
      assert.equal(expired(id, past), true, id);
      assert.equal(expired(id, future), false, id);
    }
  });

  it('treats a channel without a stored expiry as not expired', () => {
    assert.equal(expired('linkedin-page', null), false);
  });
});

// A provider whose terms limit how long a Page's name and logo may be kept,
// and one that sets no limit.
const pageProvider = {
  profileRetentionDays: 56,
  fetchPageInformation: async (token: string, { page }: { page: string }) => {
    reads.push(`${token}:${page}`);
    return answer(page);
  },
};
let reads: string[];
let answer: (page: string) => any;
let saved: Array<{ id: string; profile: any }>;
let marks: Record<string, number>;
let channels: any[];
let copyFails: boolean;

const profileService = async (redis: any) => {
  const { RefreshIntegrationService } =
    await import('./refresh.integration.service.ts');
  const { ioRedis } = (await import('../redis/redis.service.ts')) as any;
  ioRedis.get = async (key: string) => redis.get(key);
  ioRedis.set = async (key: string, _: string, __: string, ttl: number) => {
    marks[key] = ttl;
    return 'OK';
  };
  const service = new RefreshIntegrationService(
    {
      getAllowedSocialsIntegrations: () => ['linkedin-page', 'x'],
      getSocialIntegration: (id: string) =>
        id === 'linkedin-page' ? pageProvider : { fetchPageInformation: async () => ({}) },
    } as any,
    {
      listProfileRefreshCandidates: async (id: string) =>
        id === 'linkedin-page' ? channels : [{ id: 'x-1', internalId: 'x' }],
      refreshProfile: async (id: string, profile: any) => {
        saved.push({ id, profile });
        return { copyFailed: copyFails };
      },
    } as any,
    {} as any,
  );
  return service;
};

const page = (id: string, extra: Record<string, unknown> = {}) => ({
  id: `ch-${id}`,
  internalId: id,
  providerIdentifier: 'linkedin-page',
  token: 'token',
  tokenExpiration: future,
  ...extra,
});

describe('RefreshIntegrationService.refreshDueProfiles', { skip: !canLoad }, () => {
  const reset = () => {
    reads = [];
    saved = [];
    marks = {};
    channels = [page('100')];
    copyFails = false;
    answer = (id) => ({
      id,
      name: 'PostQueen',
      picture: 'https://media.licdn.com/logo.png',
      username: 'postqueen',
    });
  };

  it("stores the Page's current name, logo and public name, and reads it again a day before the limit", async () => {
    reset();
    await (await profileService({ get: async () => null })).refreshDueProfiles();
    assert.deepEqual(reads, ['token:100']);
    assert.deepEqual(saved, [
      {
        id: 'ch-100',
        profile: {
          name: 'PostQueen',
          picture: 'https://media.licdn.com/logo.png',
          profile: 'postqueen',
        },
      },
    ]);
    assert.equal(marks['integration:profile-read:ch-100'], 55 * 24 * 60 * 60);
  });

  it('leaves a channel read within the limit alone', async () => {
    reset();
    await (await profileService({ get: async () => '1' })).refreshDueProfiles();
    assert.deepEqual(reads, []);
    assert.deepEqual(saved, []);
  });

  it('keeps the stored profile when LinkedIn answers without a name or for another Page, and tries a day later', async () => {
    for (const reply of [{ id: '100' }, { id: '999', name: 'Someone else' }]) {
      reset();
      answer = () => reply;
      await (await profileService({ get: async () => null })).refreshDueProfiles();
      assert.deepEqual(saved, []);
      assert.equal(marks['integration:profile-read:ch-100'], 24 * 60 * 60);
    }
  });

  it('saves the new name but tries again a day later when the logo could not be copied', async () => {
    reset();
    copyFails = true;
    await (await profileService({ get: async () => null })).refreshDueProfiles();
    assert.equal(saved.length, 1);
    assert.equal(marks['integration:profile-read:ch-100'], 24 * 60 * 60);
  });

  it('refreshes an expired token before reading the Page', async () => {
    reset();
    channels = [page('100', { tokenExpiration: past })];
    const service = await profileService({ get: async () => null });
    service.refresh = async () => ({ accessToken: 'fresh' });
    await service.refreshDueProfiles();
    assert.deepEqual(reads, ['fresh:100']);
  });

  it('reads at most 25 channels in one run, and none of a provider without the limit', async () => {
    reset();
    channels = Array.from({ length: 30 }, (_, i) => page(String(i)));
    await (await profileService({ get: async () => null })).refreshDueProfiles();
    assert.equal(reads.length, 25);
    assert.ok(!saved.some((s) => s.id === 'x-1'));
  });
});

// A removed channel's token must not be refreshed: the write would bring the
// row back, and a failure would email its person to reconnect it.
describe('RefreshIntegrationService.refresh on a removed channel', { skip: !canLoad }, () => {
  it('returns false without asking the platform or writing anything', async () => {
    const { RefreshIntegrationService } =
      await import('./refresh.integration.service.ts');
    const touched: string[] = [];
    const removed = new RefreshIntegrationService(
      {
        getSocialIntegration: () => ({
          refreshToken: async () => {
            touched.push('refreshToken');
            return { accessToken: 'fresh' };
          },
        }),
      } as any,
      {
        createOrUpdateIntegration: async () => touched.push('write'),
        refreshNeeded: async () => touched.push('flag'),
        informAboutRefreshError: async () => touched.push('notify'),
      } as any,
      {} as any,
    );

    assert.equal(
      await removed.refresh({
        id: 'ch-gone',
        providerIdentifier: 'youtube',
        deletedAt: new Date(),
      } as any),
      false,
    );
    assert.deepEqual(touched, []);
  });
});

// A channel deleted from its account keeps a working token, so the refresh
// throws a Disconnect from reConnect: the channel then waits for its person.
// A failure that may pass (an outage, a spent quota) is tried a day later.
describe('RefreshIntegrationService.refreshDueProfiles when the refresh throws', { skip: !canLoad }, () => {
  const run = async (failure: Error) => {
    reads = [];
    saved = [];
    marks = {};
    channels = [page('100', { tokenExpiration: past })];
    const between: string[] = [];
    const service = await profileService({ get: async () => null });
    service.refresh = async () => {
      throw failure;
    };
    service.setBetweenSteps = async (channel: any, cause: string) => {
      between.push(`${channel.id}:${cause}`);
    };
    await service.refreshDueProfiles();
    return between;
  };

  it('sets the channel between steps when it is gone from the account', async () => {
    const { Disconnect } = await import('./social.abstract.ts');
    assert.deepEqual(
      await run(new Disconnect('youtube', '{}', '{}', 'Channel not found')),
      ['ch-100:Channel not found'],
    );
    assert.deepEqual(reads, []);
    assert.equal(marks['integration:profile-read:ch-100'], 24 * 60 * 60);
  });

  it('only tries again a day later on any other failure', async () => {
    assert.deepEqual(await run(new Error('quotaExceeded')), []);
    assert.equal(marks['integration:profile-read:ch-100'], 24 * 60 * 60);
  });
});

// A channel whose token cannot be refreshed fails again on every later
// attempt (an analytics poll, a post), and each one used to email its person.
// The flag is claimed: only the attempt that turns it on notifies.
describe('A failed refresh notifies once per disconnect', { skip: !canLoad }, () => {
  it('claims the flag only while it is off', async () => {
    const { IntegrationRepository } = await import(
      '../database/prisma/integrations/integration.repository.ts'
    );
    const calls: any[] = [];
    let flagged = false;
    // Over the one model it touches: constructing the repository builds its
    // storage, which these tests do not need.
    const repository = {
      _integration: {
        model: {
          integration: {
            updateMany: async (args: any) => {
              calls.push(args);
              const flips = args.where.refreshNeeded === false && !flagged;
              flagged = flagged || flips;
              return { count: flips ? 1 : 0 };
            },
          },
        },
      },
    };
    const claim = () =>
      IntegrationRepository.prototype.refreshNeeded.call(
        repository,
        'org-1',
        'ch-1',
      );

    assert.equal(await claim(), true);
    assert.equal(await claim(), false);
    assert.deepEqual(calls[0], {
      where: { id: 'ch-1', organizationId: 'org-1', refreshNeeded: false },
      data: { refreshNeeded: true },
    });
  });

  const failing = async (claims: boolean[]) => {
    const { RefreshIntegrationService } =
      await import('./refresh.integration.service.ts');
    const notified: string[] = [];
    const service = new RefreshIntegrationService(
      {
        getSocialIntegration: () => ({
          refreshToken: async () => {
            throw new Error('invalid_grant');
          },
          refreshErrorMessage: () => 'The token was revoked.',
        }),
      } as any,
      {
        // No other flow stored anything meanwhile.
        getIntegrationById: async () => null,
        refreshNeeded: async () => claims.shift() ?? false,
        informAboutRefreshError: async (
          _org: string,
          _integration: unknown,
          cause: string,
          reason: string,
        ) => {
          notified.push(`${cause}|${reason}`);
        },
      } as any,
      {} as any,
    );
    const channel = {
      id: 'ch-1',
      organizationId: 'org-1',
      providerIdentifier: 'youtube',
      refreshToken: 'refresh',
    } as any;
    return { service, channel, notified };
  };

  it('tells its person on the attempt that flags the channel, with the cause', async () => {
    const { service, channel, notified } = await failing([true]);
    assert.equal(await service.refresh(channel, 'analytics'), false);
    assert.deepEqual(notified, ['analytics|The token was revoked.']);
  });

  it('stays quiet on later attempts of a channel already flagged', async () => {
    const { service, channel, notified } = await failing([true, false, false]);
    await service.refresh(channel);
    await service.refresh(channel);
    await service.refresh(channel);
    assert.equal(notified.length, 1);
  });
});

// Two flows refreshing one channel at once: with a provider that issues a new
// refresh token every time, the platform takes the first and refuses the
// second. The second reads the row again and uses what the first stored.
describe('A refresh that lost a race to another', { skip: !canLoad }, () => {
  const future = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
  // What the caller holds: always a row read through Prisma, whose extension
  // decrypts the tokens (see prisma.service.ts).
  const held = {
    id: 'ch-1',
    organizationId: 'org-1',
    internalId: 'tt-1',
    providerIdentifier: 'tiktok',
    name: 'Creator',
    token: 'access-1',
    refreshToken: 'refresh-1',
  } as any;

  const race = async (reads: any[]) => {
    const { RefreshIntegrationService } =
      await import('./refresh.integration.service.ts');
    const log: string[] = [];
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => {
      fn();
      return 0;
    }) as any;
    try {
      const result = await new RefreshIntegrationService(
        {
          getSocialIntegration: () => ({
            refreshToken: async () => {
              throw new Error('invalid_grant');
            },
          }),
        } as any,
        {
          getIntegrationById: async () => {
            log.push('read');
            // the last row stays, as a database would keep answering it
            return reads.length > 1 ? reads.shift() : reads[0];
          },
          refreshNeeded: async () => {
            log.push('flag');
            return true;
          },
          informAboutRefreshError: async () => {
            log.push('notify');
          },
          createOrUpdateIntegration: async () => {
            log.push('store');
          },
        } as any,
        {} as any,
      ).refresh(held);
      return { result, log };
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  };

  it('uses the tokens the other flow stored, once they are there', async () => {
    const won = {
      ...held,
      token: 'access-2',
      refreshToken: 'refresh-2',
      tokenExpiration: future(),
      refreshNeeded: false,
      inBetweenSteps: false,
      deletedAt: null,
    };
    const { result, log } = await race([
      { ...won, token: held.token, refreshToken: held.refreshToken },
      won,
    ]);
    assert.equal((result as any).accessToken, 'access-2');
    assert.equal((result as any).refreshToken, 'refresh-2');
    assert.deepEqual(log, ['read', 'read', 'store']);
  });

  it('flags the channel when the row still holds the tokens that failed', async () => {
    const same = {
      ...held,
      tokenExpiration: future(),
      refreshNeeded: false,
      inBetweenSteps: false,
      deletedAt: null,
    };
    const { result, log } = await race([same]);
    assert.equal(result, false);
    assert.deepEqual(log, ['read', 'read', 'read', 'flag', 'notify']);
  });

  it('does not wait on a channel already flagged or removed', async () => {
    for (const stored of [
      { ...held, refreshNeeded: true },
      { ...held, deletedAt: new Date() },
      null,
    ]) {
      const { log } = await race([stored]);
      assert.deepEqual(log.slice(0, 2), ['read', 'flag']);
    }
  });

  it('compares decrypted tokens: the stored ciphertext differs on every write', async () => {
    process.env.JWT_SECRET ||= 'refresh-race-spec-secret';
    const { AuthService } = await import('@gitroom/helpers/auth/auth.service');
    const first = AuthService.encryptToken('refresh-1');
    const second = AuthService.encryptToken('refresh-1');
    // Comparing what the database holds would always read "changed", and
    // hand back the very tokens that just failed.
    assert.notEqual(first, second);
    assert.equal(AuthService.decryptToken(first), AuthService.decryptToken(second));
  });
});
