import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { after, before, describe, it } from 'node:test';

// As in integration.credits.spec.ts: tsx follows tsconfig's mapping of
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
// The service builds its storage when constructed: keep it the local one.
const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
before(async () => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  if (canLoadService) {
    ({ IntegrationService } = await import('./integration.service.ts'));
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

describe('IntegrationService.clearExpiredProfiles', { skip: !canLoadService }, () => {
  it("gives removed channels the network's name once the provider's limit has passed, and leaves providers without one alone", async () => {
    const cleared: Array<{ identifier: string; label: string; before: Date }> = [];
    const service = new IntegrationService(
      {
        clearRemovedProfiles: async (identifier: string, label: string, before: Date) => {
          cleared.push({ identifier, label, before });
          return { count: 0 };
        },
      },
      {},
      {
        getAllowedSocialsIntegrations: () => ['linkedin', 'linkedin-page', 'x'],
        getSocialIntegration: (id: string) =>
          id === 'linkedin-page' ? { profileRetentionDays: 56 } : {},
        getSocialIntegrationName: () => 'LinkedIn Page',
      },
      {},
      {},
      {},
      {},
    );

    await service.clearExpiredProfiles();

    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].identifier, 'linkedin-page');
    assert.equal(cleared[0].label, 'LinkedIn Page');
    const days = (Date.now() - cleared[0].before.getTime()) / 86_400_000;
    assert.ok(Math.abs(days - 56) < 0.01, `cutoff is ${days} days ago`);
  });
});

// YouTube's policies: a removed channel's access is revoked at once and its
// data goes within 7 days; a channel whose token cannot be refreshed loses
// its data within 30. A provider says how long through
// removedDataRetentionDays and disconnectedDataRetentionDays.
describe('IntegrationService.eraseExpiredChannelData', { skip: !canLoadService }, () => {
  let calls: string[];
  let listed: Array<{ identifier: string; removedBefore?: Date; disconnectedBefore?: Date }>;

  const limited = (revoke = async (..._: unknown[]) => {
    calls.push('revoke');
  }) => ({
    removedDataRetentionDays: 1,
    disconnectedDataRetentionDays: 14,
    revokeAccess: revoke,
  });

  const build = (
    channels: any[],
    { shares = false, provider = limited() }: { shares?: boolean; provider?: any } = {}
  ) =>
    new IntegrationService(
      {
        markDisconnectedChannels: async (identifier: string) => {
          calls.push(`mark:${identifier}`);
        },
        listChannelsToErase: async (
          identifier: string,
          removedBefore?: Date,
          disconnectedBefore?: Date
        ) => {
          listed.push({ identifier, removedBefore, disconnectedBefore });
          return identifier === 'youtube' ? channels : [];
        },
        sharesAccessWithLiveChannel: async () => shares,
        eraseNetworkData: async (channel: any, label: string) => {
          calls.push(`erase:${channel.id}:${label}`);
          return { erased: true };
        },
        getIntegrationById: async (_: string, id: string) =>
          channels.find((channel) => channel.id === id),
        deleteChannel: async (_: string, id: string) => {
          calls.push(`delete:${id}`);
          return { id };
        },
      },
      {},
      {
        getAllowedSocialsIntegrations: () => ['youtube', 'linkedin-page', 'x'],
        getSocialIntegration: (id: string) =>
          id === 'youtube'
            ? provider
            : id === 'linkedin-page'
              ? { profileRetentionDays: 56 }
              : {},
        getSocialIntegrationName: (id: string) =>
          id === 'youtube' ? 'YouTube' : id,
      },
      {},
      {},
      {},
      {},
    );

  const channel = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    organizationId: 'org-1',
    providerIdentifier: 'youtube',
    internalId: `UC-${id}`,
    rootInternalId: 'google-1',
    token: 'access',
    refreshToken: 'refresh',
    deletedAt: null,
    inBetweenSteps: false,
    refreshNeeded: true,
    _count: { posts: 3 },
    ...extra,
  });

  const reset = () => {
    calls = [];
    listed = [];
  };

  it('stamps and lists only the providers with a limit, with their cutoffs', async () => {
    reset();
    await build([]).eraseExpiredChannelData();
    assert.deepEqual(calls, ['mark:youtube']);
    assert.equal(listed.length, 1);
    const days = (date?: Date) => (Date.now() - date!.getTime()) / 86_400_000;
    assert.ok(Math.abs(days(listed[0].removedBefore) - 1) < 0.01);
    assert.ok(Math.abs(days(listed[0].disconnectedBefore) - 14) < 0.01);
  });

  it("revokes a removed channel's access before erasing it, with the network's name", async () => {
    reset();
    await build([channel('gone', { deletedAt: new Date() })]).eraseExpiredChannelData();
    assert.deepEqual(calls, ['mark:youtube', 'revoke', 'erase:gone:YouTube']);
  });

  it('never revokes an access another live channel signs in with', async () => {
    reset();
    await build([channel('gone', { deletedAt: new Date() })], {
      shares: true,
    }).eraseExpiredChannelData();
    assert.deepEqual(calls, ['mark:youtube', 'erase:gone:YouTube']);
  });

  it('erases a removed channel even when the revoke fails', async () => {
    reset();
    await build([channel('gone', { deletedAt: new Date() })], {
      provider: limited(async () => {
        throw new Error('Google did not revoke the access (500)');
      }),
    }).eraseExpiredChannelData();
    assert.deepEqual(calls, ['mark:youtube', 'erase:gone:YouTube']);
  });

  it('erases a channel waiting for a reconnect without revoking, and keeps it', async () => {
    reset();
    await build([channel('waiting')]).eraseExpiredChannelData();
    assert.deepEqual(calls, ['mark:youtube', 'erase:waiting:YouTube']);
  });

  it('removes a setup never finished and without posts, through the removal', async () => {
    reset();
    await build([
      channel('setup', {
        internalId: 'google-1',
        inBetweenSteps: true,
        refreshNeeded: false,
        _count: { posts: 0 },
      }),
    ]).eraseExpiredChannelData();
    assert.deepEqual(calls, ['mark:youtube', 'revoke', 'delete:setup']);
  });

  it('erases in place a channel between steps that has posts', async () => {
    reset();
    await build([
      channel('moved', { inBetweenSteps: true, refreshNeeded: false }),
    ]).eraseExpiredChannelData();
    assert.deepEqual(calls, ['mark:youtube', 'erase:moved:YouTube']);
  });

  it('handles at most 50 channels in one run', async () => {
    reset();
    await build(
      Array.from({ length: 60 }, (_, i) => channel(`c${i}`))
    ).eraseExpiredChannelData();
    assert.equal(calls.filter((call) => call.startsWith('erase:')).length, 50);
  });
});

describe('IntegrationService.deleteChannel', { skip: !canLoadService }, () => {
  const build = (
    row: any,
    calls: string[],
    { shares = false, revoke }: { shares?: boolean; revoke?: () => Promise<void> } = {}
  ) =>
    new IntegrationService(
      {
        getIntegrationById: async () => row,
        getIntegrationsList: async () => [row],
        sharesAccessWithLiveChannel: async (_: unknown, otherOrganizationsOnly: boolean) => {
          calls.push(`shares:${otherOrganizationsOnly}`);
          return shares;
        },
        deleteChannel: async () => {
          calls.push('delete');
          return { id: row?.id };
        },
      },
      {},
      {
        getSocialIntegration: () => ({
          revokeAccess:
            revoke ||
            (async (token: string, refreshToken?: string) => {
              calls.push(`revoke:${token}:${refreshToken}`);
            }),
        }),
      },
      {},
      {},
      {},
      {},
    );

  const live = {
    id: 'ch-1',
    organizationId: 'org-1',
    providerIdentifier: 'youtube',
    token: 'access',
    refreshToken: 'refresh',
    deletedAt: null,
  };

  it("revokes a live channel's access with its own tokens before they are replaced", async () => {
    const calls: string[] = [];
    await build(live, calls).deleteChannel('org-1', 'ch-1');
    assert.deepEqual(calls, ['shares:false', 'revoke:access:refresh', 'delete']);
  });

  it('removes the channel without revoking when the access is shared, or the row is already removed', async () => {
    const shared: string[] = [];
    await build(live, shared, { shares: true }).deleteChannel('org-1', 'ch-1');
    assert.deepEqual(shared, ['shares:false', 'delete']);

    const again: string[] = [];
    await build({ ...live, deletedAt: new Date() }, again).deleteChannel('org-1', 'ch-1');
    assert.deepEqual(again, ['delete']);
  });

  it('removes the channel when the revoke fails', async () => {
    const calls: string[] = [];
    await build(live, calls, {
      revoke: async () => {
        throw new Error('Google did not revoke the access (no answer)');
      },
    }).deleteChannel('org-1', 'ch-1');
    assert.deepEqual(calls, ['shares:false', 'delete']);
  });

  it('counts only other workspaces as sharing when the whole account goes', async () => {
    const calls: string[] = [];
    await build(live, calls).revokeAccountChannels('org-1');
    assert.deepEqual(calls, ['shares:true', 'revoke:access:refresh']);
  });
});

describe('IntegrationService.createOrUpdateIntegration picture', { skip: !canLoadService }, () => {
  it('keeps a picture already in our storage instead of copying it again', async () => {
    const stored: Array<string | undefined> = [];
    const uploads: string[] = [];
    const service = new IntegrationService(
      {
        createOrUpdateIntegration: async (...args: any[]) => {
          stored.push(args[4]);
          return { id: 'ch-1' };
        },
      },
      {},
      {},
      {},
      {},
      {},
      {},
    );
    service.storage = {
      isOwnFile: (url: string) => url.startsWith('https://uploads.postqueen.test/'),
      uploadSimple: async (url: string) => {
        uploads.push(url);
        return 'https://uploads.postqueen.test/new.png';
      },
    };

    const save = (picture: string) =>
      service.createOrUpdateIntegration(
        undefined,
        false,
        'org-1',
        'Channel',
        picture,
        'social',
        'UC-1',
        'youtube',
        'token'
      );
    await save('https://uploads.postqueen.test/old.png');
    await save('https://yt3.ggpht.com/avatar.jpg');

    assert.deepEqual(uploads, ['https://yt3.ggpht.com/avatar.jpg']);
    assert.deepEqual(stored, [
      'https://uploads.postqueen.test/old.png',
      'https://uploads.postqueen.test/new.png',
    ]);
  });
});
