import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it, type TestContext } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { google } from 'googleapis';
import { YoutubeProvider } from './youtube.provider.ts';
import {
  BadBody,
  Disconnect,
  MEDIA_READ_SLOW,
  NotEnoughScopes,
} from '../social.abstract.ts';
import {
  getYoutubeTagsLength,
  YoutubeSettingsDto,
  YOUTUBE_TAGS_TOO_LONG,
} from '../../dtos/posts/providers-settings/youtube.settings.dto.ts';

const provider = new YoutubeProvider();
const video = [[{ path: 'https://cdn.test/clip.mp4' }]];
const check = (description?: string) =>
  provider.checkValidity(
    video,
    {},
    [],
    description === undefined ? undefined : [description]
  );

describe('YouTube description', () => {
  it('is measured in bytes, not characters', async () => {
    assert.equal(await check('a'.repeat(5000)), true);
    assert.match(String(await check('a'.repeat(5001))), /at most 5,000 bytes/);
    // 2,000 Cyrillic letters are 2,000 characters but 4,000 bytes: fine.
    assert.equal(await check('д'.repeat(2000)), true);
    // 2,501 of them are 5,002 bytes, under 5,000 characters and still refused.
    assert.match(String(await check('д'.repeat(2501))), /at most 5,000 bytes/);
    // An emoji is 4 bytes.
    assert.match(String(await check('🎬'.repeat(1251))), /at most 5,000 bytes/);
  });

  it('may not contain < or >', async () => {
    assert.equal(
      await check('Step 1 -> step 2'),
      'YouTube descriptions cannot contain < or >'
    );
    assert.equal(await check('a < b'), 'YouTube descriptions cannot contain < or >');
    assert.equal(await check('Plain text, no angle brackets.'), true);
  });

  it('keeps the one-video rule and still works without text', async () => {
    assert.equal(await check(), true);
    assert.equal(
      await provider.checkValidity([[{ path: 'https://cdn.test/a.jpg' }]], {}, []),
      'Item must be a video'
    );
  });
});

describe('YoutubeSettingsDto title', () => {
  const errors = (title: string) =>
    validate(
      plainToInstance(YoutubeSettingsDto, { title, type: 'public' }) as object,
      { skipMissingProperties: false }
    );

  it('refuses < and >', async () => {
    const [error] = await errors('Before -> after');
    assert.equal(error.property, 'title');
    assert.ok(
      Object.values(error.constraints || {}).includes(
        'YouTube titles cannot contain < or >'
      )
    );
  });

  it('accepts any other text, accents and emoji included', async () => {
    assert.equal((await errors('Ça marche 🎬 — part 2')).length, 0);
  });

  // YouTube's own limits, 1 to 100 characters: the Required Minimum
  // Functionality allows no stricter one.
  it('accepts a one-character title, never an empty one', async () => {
    assert.equal((await errors('A')).length, 0);
    assert.equal((await errors('')).length, 1);
    assert.equal((await errors('a'.repeat(100))).length, 0);
    assert.equal((await errors('a'.repeat(101))).length, 1);
  });
});

describe('YouTube altered or synthetic content', () => {
  // The status a video's upload session is started with.
  const uploadStatus = async (settings: Record<string, unknown>) => {
    const youtube = new YoutubeProvider();
    let body: any;
    (youtube as any).mediaSize = async () => 1000;
    (youtube as any).fetch = async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response('', {
        headers: { location: 'https://upload.test/session' },
      });
    };
    await youtube.postPending(
      'channel',
      'token',
      [
        {
          id: 'p',
          message: 'Video description',
          settings: { title: 'A video', type: 'public', ...settings },
          media: [{ path: 'https://cdn.test/clip.mp4' }],
        },
      ] as any,
      {} as any
    );
    return body.status;
  };

  it('leaves a video without the setting exactly as before', async () => {
    const before = {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false,
    };
    assert.deepEqual(await uploadStatus({}), before);
    assert.deepEqual(await uploadStatus({ made_with_ai: false }), before);
    assert.deepEqual(
      await uploadStatus({ selfDeclaredMadeForKids: 'yes' }),
      { privacyStatus: 'public', selfDeclaredMadeForKids: true }
    );
  });

  it('discloses it when the box is ticked', async () => {
    for (const made_with_ai of [true, 'true']) {
      assert.deepEqual(await uploadStatus({ made_with_ai }), {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
      });
    }
  });

  it('takes the setting as optional, and only as a yes or no', async () => {
    const errors = (settings: Record<string, unknown>) =>
      validate(
        plainToInstance(YoutubeSettingsDto, {
          title: 'A video',
          type: 'public',
          ...settings,
        }) as object,
        { skipMissingProperties: false }
      );
    assert.equal((await errors({})).length, 0);
    assert.equal((await errors({ made_with_ai: true })).length, 0);
    assert.equal((await errors({ made_with_ai: 'yes' })).length, 1);
  });
});

describe('YouTube scopes', () => {
  const g = (s: string) => `https://www.googleapis.com/auth/${s}`;

  it('asks for what PostQueen uses, plus force-ssl for editing and comments', () => {
    assert.deepEqual(provider.scopes, [
      g('userinfo.profile'),
      g('userinfo.email'),
      g('youtube.force-ssl'),
      g('youtube.readonly'),
      g('youtube.upload'),
      g('yt-analytics.readonly'),
    ]);
  });

  it('still accepts channels connected with the older, broader scopes', () => {
    const before = [...provider.scopes, g('youtube'), g('youtubepartner')];
    assert.equal(provider.checkScopes(provider.scopes, before), true);
    assert.equal(provider.checkScopes(provider.scopes, before.join(' ')), true);
  });

  it('refuses a grant without the upload scope', () => {
    const missing = provider.scopes.filter((s) => s !== g('youtube.upload'));
    assert.throws(() => provider.checkScopes(provider.scopes, missing));
  });
});

describe('YouTube comments', () => {
  const withComments = (settings: object, ...comments: object[][]) =>
    provider.checkValidity(
      [[{ path: 'https://cdn.test/clip.mp4' }], ...comments] as any,
      settings,
      [],
      ['Video description', ...comments.map(() => 'A comment')]
    );

  it('takes a text comment on a normal video', async () => {
    assert.equal(await withComments({ selfDeclaredMadeForKids: 'no' }, []), true);
  });

  it('refuses one on a video made for kids, where YouTube turns comments off', async () => {
    assert.match(
      String(await withComments({ selfDeclaredMadeForKids: 'yes' }, [])),
      /turns comments off on videos made for kids/
    );
    assert.equal(await withComments({ selfDeclaredMadeForKids: 'yes' }), true);
  });

  it('refuses one on a private video, where YouTube allows no comments', async () => {
    assert.match(
      String(await withComments({ type: 'private' }, [])),
      /does not allow comments on private videos/
    );
    assert.equal(await withComments({ type: 'unlisted' }, []), true);
  });

  it('refuses media in a comment', async () => {
    assert.equal(
      await withComments({}, [{ path: 'https://cdn.test/a.jpg' }]),
      'YouTube comments cannot contain media'
    );
  });

  it('posts each comment as a top-level comment on the video', async () => {
    const calls: any[] = [];
    const real = google.youtube;
    (google as any).youtube = () => ({
      commentThreads: {
        insert: async (args: any) => {
          calls.push(args);
          return { data: { id: 'Ugx-thread' } };
        },
      },
    });
    try {
      const [result] = await provider.comment(
        'internal-id',
        'VIDEO123',
        'previous-comment',
        'token',
        [{ id: 'comment-row', message: 'First!', settings: {} } as any],
        {} as any
      );
      assert.deepEqual(calls[0], {
        part: ['snippet'],
        requestBody: {
          snippet: {
            videoId: 'VIDEO123',
            topLevelComment: { snippet: { textOriginal: 'First!' } },
          },
        },
      });
      assert.deepEqual(result, {
        id: 'comment-row',
        postId: 'Ugx-thread',
        releaseURL: 'https://www.youtube.com/watch?v=VIDEO123&lc=Ugx-thread',
        status: 'success',
      });
    } finally {
      (google as any).youtube = real;
    }
  });

  it('explains a comment refused because comments are off', () => {
    assert.equal(
      provider.handleErrors('{"reason":"commentsDisabled"}')?.value,
      'Comments are turned off for this video on YouTube.'
    );
  });

  it('reads only Google\'s answer, not the comment text, when a comment fails', async () => {
    const real = google.youtube;
    (google as any).youtube = () => ({
      commentThreads: {
        insert: async () => {
          throw Object.assign(new Error('Request failed'), {
            config: { data: 'Unauthorized words in my comment' },
            response: { status: 403, data: { error: { errors: [{ reason: 'commentsDisabled' }] } } },
          });
        },
      },
    });
    try {
      await assert.rejects(
        provider.comment('i', 'VIDEO123', undefined, 'token', [{ id: 'c', message: 'Unauthorized words in my comment', settings: {} } as any], {} as any),
        (err: any) => err.type === 'bad_body' && /Comments are turned off/.test(err.message)
      );
    } finally {
      (google as any).youtube = real;
    }
  });
});

describe('YouTube errors', () => {
  const reason = (r: string, extra = '') =>
    provider.handleErrors(
      JSON.stringify({
        error: { errors: [{ reason: r, domain: `youtube.${extra || 'video'}` }] },
      })
    );

  it('says the video was uploaded when YouTube cannot read the thumbnail', () => {
    const answer = reason('invalidImage', 'thumbnail');
    assert.equal(answer?.type, 'bad-body');
    assert.match(String(answer?.value), /^Your video was uploaded to YouTube, but YouTube could not read the thumbnail/);
  });

  it('names the thumbnail rate limit before the general one', () => {
    assert.match(
      String(reason('uploadRateLimitExceeded', 'thumbnail')?.value),
      /set too many thumbnails recently/
    );
    assert.match(
      String(reason('rateLimitExceeded')?.value),
      /sending requests too quickly/
    );
  });

  it('names the daily upload cap, which shares the rateLimitExceeded reason', () => {
    for (const body of [
      '{"error":{"message":"Quota exceeded for quota metric \'Video Uploads\' and limit \'Video Uploads per day\'","errors":[{"reason":"rateLimitExceeded"}],"details":[{"metadata":{"quota_limit":"defaultVideoInsertPerDayPerProject"}}]}}',
      '{"error":{"message":"limit \'Video Uploads per day\'","errors":[{"reason":"rateLimitExceeded"}]}}',
    ]) {
      const answer = provider.handleErrors(body);
      assert.equal(answer?.type, 'bad-body');
      assert.match(String(answer?.value), /daily YouTube upload limit, so nothing was uploaded/);
    }
  });

  it('does not promise nothing was uploaded when the API units run out', () => {
    const answer = reason('quotaExceeded', 'quota');
    assert.equal(answer?.type, 'bad-body');
    assert.match(String(answer?.value), /daily YouTube limit/);
    assert.doesNotMatch(String(answer?.value), /nothing was uploaded/);
  });

  it('keeps the type of the title, permission and signup errors', () => {
    assert.deepEqual(reason('invalidTitle'), {
      type: 'bad-body',
      value:
        'YouTube refused the title, so nothing was uploaded. Use 1 to 100 characters without < or >.',
    });
    assert.equal(reason('insufficientPermissions')?.type, 'bad-body');
    assert.match(String(reason('insufficientPermissions')?.value), /Reconnect the channel/);
    assert.equal(reason('youtubeSignupRequired')?.type, 'bad-body');
    assert.match(String(reason('youtubeSignupRequired')?.value), /no YouTube channel yet/);
  });

  it('explains the tag limit with the same words as the composer', () => {
    assert.equal(reason('invalidTags')?.value, YOUTUBE_TAGS_TOO_LONG);
  });
});

describe('YoutubeSettingsDto tags', () => {
  const tags = (...labels: string[]) => labels.map((label) => ({ value: label, label }));
  const errors = (list: { value: string; label: string }[]) =>
    validate(
      plainToInstance(YoutubeSettingsDto, {
        title: 'A title',
        type: 'public',
        tags: list,
      }) as object,
      { skipMissingProperties: false }
    );

  it('counts the comma between two tags', () => {
    // 5 tags of 99 characters and the 4 commas between them: 499
    assert.equal(getYoutubeTagsLength(tags(...Array(5).fill('a'.repeat(99)))), 499);
    assert.equal(getYoutubeTagsLength(tags('one')), 3);
    assert.equal(getYoutubeTagsLength([]), 0);
  });

  it('adds the quotes YouTube puts around a tag with a space', () => {
    assert.equal(getYoutubeTagsLength(tags('two words', 'x')), 9 + 2 + 1 + 1);
  });

  it('accepts exactly 500 and refuses 501 with the new message', async () => {
    const fits = tags('a'.repeat(249), 'b'.repeat(250)); // 249 + 1 + 250
    assert.equal((await errors(fits)).length, 0);
    const [error] = await errors(tags('a'.repeat(250), 'b'.repeat(250)));
    assert.equal(error.property, 'tags');
    assert.ok(Object.values(error.constraints || {}).includes(YOUTUBE_TAGS_TOO_LONG));
  });

  it('still reads a stored tag without a label', () => {
    assert.equal(getYoutubeTagsLength([{ value: 'x' } as any, ...tags('ab')]), 3);
  });
});

// YouTube's policies (III.D.2.3.1): removing a channel revokes the token at
// Google right away.
describe('YouTube access revoke', () => {
  const withRevoke = async (
    revoke: (token: string) => Promise<unknown>,
    run: () => Promise<void>
  ) => {
    const proto = (google.auth.OAuth2 as any).prototype;
    const real = proto.revokeToken;
    proto.revokeToken = revoke;
    try {
      await run();
    } finally {
      proto.revokeToken = real;
    }
  };

  it('revokes the refresh token, which ends the whole grant, or else the access token', async () => {
    const revoked: string[] = [];
    await withRevoke(
      async (token) => revoked.push(token),
      async () => {
        await provider.revokeAccess('access', 'refresh');
        await provider.revokeAccess('access');
      }
    );
    assert.deepEqual(revoked, ['refresh', 'access']);
  });

  it('counts a token Google no longer knows as revoked', async () => {
    await withRevoke(
      async () => {
        throw Object.assign(new Error('invalid_token'), {
          response: { status: 400 },
        });
      },
      () => provider.revokeAccess('access', 'refresh')
    );
  });

  it('fails with the status only, never the token in the request URL', async () => {
    await withRevoke(
      async () => {
        throw Object.assign(
          new Error(
            'Request failed: https://oauth2.googleapis.com/revoke?token=refresh'
          ),
          {
            response: { status: 503 },
            config: {
              url: 'https://oauth2.googleapis.com/revoke?token=refresh',
            },
          }
        );
      },
      async () => {
        await assert.rejects(provider.revokeAccess('access', 'refresh'), (err: Error) => {
          assert.equal(err.message, 'Google did not revoke the access (503)');
          assert.ok(!JSON.stringify(err).includes('refresh'));
          return true;
        });
      }
    );
  });
});

describe('YouTube channel profile read', () => {
  it('reads the channel the hourly run names with { page }, as the picker does with { id }', async () => {
    const asked: string[][] = [];
    const real = google.youtube;
    (google as any).youtube = () => ({
      channels: {
        list: async ({ id }: { id: string[] }) => {
          asked.push(id);
          return {
            data: {
              items: [
                {
                  id: id[0],
                  snippet: {
                    title: 'PostQueen',
                    customUrl: '@postqueen',
                    thumbnails: {},
                  },
                },
              ],
            },
          };
        },
      },
    });
    try {
      const page = await provider.fetchPageInformation('token', {
        page: 'UC-page',
      });
      const picked = await provider.fetchPageInformation('token', {
        id: 'UC-id',
      });
      assert.deepEqual(asked, [['UC-page'], ['UC-id']]);
      assert.equal(page.id, 'UC-page');
      assert.equal(page.name, 'PostQueen');
      assert.equal(page.username, '@postqueen');
      assert.equal(picked.id, 'UC-id');
    } finally {
      (google as any).youtube = real;
    }
  });

  it('keeps what PostQueen holds within YouTube\'s limits', () => {
    assert.equal(provider.analyticsRetentionDays, 29);
    assert.equal(provider.removedDataRetentionDays, 1);
    // A weekly read finds a dead token within 7 days; 7 + 14 stays inside 30.
    assert.ok(provider.profileRetentionDays - 1 + provider.disconnectedDataRetentionDays < 30);
  });

  it('says Disconnect only when the channel is gone from the account, not when the read fails', async () => {
    const real = google.youtube;
    try {
      (google as any).youtube = () => ({
        channels: { list: async () => ({ data: { items: [{ id: 'UC-other' }] } }) },
      });
      await assert.rejects(
        provider.reConnect('google-1', 'UC-gone', 'token'),
        (err: Error) => err instanceof Disconnect && err.message === 'Channel not found'
      );

      (google as any).youtube = () => ({
        channels: {
          list: async () => {
            throw Object.assign(new Error('quotaExceeded'), { status: 403 });
          },
        },
      });
      await assert.rejects(
        provider.reConnect('google-1', 'UC-gone', 'token'),
        (err: Error) => !(err instanceof Disconnect)
      );
    } finally {
      (google as any).youtube = real;
    }
  });
});

describe('YouTube channel listing for the picker', () => {
  const listing = async (list: () => Promise<unknown>) => {
    const real = google.youtube;
    (google as any).youtube = () => ({ channels: { list } });
    try {
      return await provider.pages('token');
    } finally {
      (google as any).youtube = real;
    }
  };

  it('lists the channels of the account', async () => {
    const channels = await listing(async () => ({
      data: {
        items: [
          {
            id: 'UC-1',
            snippet: { title: 'PostQueen', customUrl: '@postqueen', thumbnails: {} },
            statistics: { subscriberCount: '12' },
          },
        ],
      },
    }));

    assert.equal(channels.length, 1);
    assert.equal(channels[0].id, 'UC-1');
    assert.equal(channels[0].name, 'PostQueen');
    assert.equal(channels[0].username, '@postqueen');
  });

  it('says so when the Google account has no YouTube channel', async () => {
    await assert.rejects(
      listing(async () => ({ data: {} })),
      (err: unknown) =>
        err instanceof NotEnoughScopes &&
        /has no YouTube channel/.test(err.message)
    );
  });

  it('passes a failed read on instead of answering an empty list', async () => {
    await assert.rejects(
      listing(async () => {
        throw Object.assign(new Error('quotaExceeded'), { status: 403 });
      }),
      /quotaExceeded/
    );
  });
});

// finalizePost reads the video back one ranged chunk at a time. A store that
// could not answer is asked once more 5 seconds later, then the batch goes
// back to the workflow as pending; only a refused range fails the post.
describe('YouTube chunk reads', () => {
  // Answers the reads in turn, the last answer for good; a 0 is no answer.
  const read = async (t: TestContext, ...statuses: number[]) => {
    const realFetch = globalThis.fetch;
    let count = 0;
    globalThis.fetch = (async () => {
      const status = statuses[Math.min(count++, statuses.length - 1)];
      if (!status) {
        throw new TypeError('fetch failed');
      }
      return new Response(status === 206 ? 'chunk' : null, { status });
    }) as any;
    t.mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const done = (new YoutubeProvider() as any)
        .youtubeChunkStream('https://cdn.test/clip.mp4', 0, 4)
        .then(
          (value: unknown) => ({ value }),
          (err: unknown) => ({ err })
        );
      let outcome: { value?: any; err?: unknown } | undefined;
      done.then((o: any) => (outcome = o));
      while (outcome === undefined) {
        await new Promise((resolve) => setImmediate(resolve));
        t.mock.timers.tick(5000);
      }
      return { ...outcome, count };
    } finally {
      globalThis.fetch = realFetch;
    }
  };

  it('asks once more when the store could not answer, and streams that', async (t) => {
    for (const first of [503, 429, 0]) {
      const { value, count } = await read(t, first, 206);
      assert.equal(await new Response(value).text(), 'chunk', String(first));
      assert.equal(count, 2);
      t.mock.timers.reset();
    }
  });

  it('says busy when the store still cannot answer', async (t) => {
    for (const status of [503, 500, 429, 0]) {
      const { value, count } = await read(t, status);
      assert.equal(value, 'busy', String(status));
      assert.equal(count, 2);
      t.mock.timers.reset();
    }
  });

  it('fails the post when the store refuses the range or the file', async (t) => {
    for (const status of [200, 404]) {
      const { err, count } = await read(t, status);
      assert.ok(err instanceof BadBody, String(status));
      assert.equal(count, 1);
      t.mock.timers.reset();
    }
  });
});

// A busy store hands the batch back to the workflow, the way a spent batch
// budget does, and fails the post only after about ten minutes of it.
describe('YouTube upload batches on a busy store', () => {
  const pendingData = {
    uploadUri: 'https://upload.test/session',
    videoSize: 10,
    path: 'https://cdn.test/clip.mp4',
    uploadedBytes: 0,
    thumbnail: '',
  };

  const batch = async (chunk: unknown, data: Record<string, unknown>) => {
    const youtube = new YoutubeProvider() as any;
    youtube.probeUploadSession = async () => ({ uploadedBytes: 4 });
    youtube.youtubeChunkStream = async () => chunk;
    const realFetch = globalThis.fetch;
    // Google keeps the bytes and asks for more, without saying how many
    globalThis.fetch = (async () => new Response(null, { status: 308 })) as any;
    try {
      return await youtube.finalizePost(
        'token',
        { ...pendingData, ...data },
        {} as any
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  };

  it('hands the batch back with one more busy batch counted', async () => {
    assert.deepEqual(await batch('busy', {}), {
      status: 'pending',
      pendingData: { ...pendingData, uploadedBytes: 4, storeBusy: 1 },
    });
    assert.equal(
      (await batch('busy', { storeBusy: 13 })).pendingData.storeBusy,
      14
    );
  });

  it('fails the post on the fifteenth busy batch in a row', async () => {
    await assert.rejects(batch('busy', { storeBusy: 14 }), (err) => {
      assert.ok(err instanceof BadBody);
      assert.equal(err.message, MEDIA_READ_SLOW);
      return true;
    });
  });

  it('starts counting again after a batch that read the media', async () => {
    const { status, pendingData: data } = await batch(
      Readable.from(['chunk']),
      { storeBusy: 9 }
    );
    assert.equal(status, 'pending');
    assert.equal(data.storeBusy, 0);
  });
});
