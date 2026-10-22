import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { google } from 'googleapis';
import { YoutubeProvider } from './youtube.provider.ts';
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
  const provider = new YoutubeProvider();
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
    const provider = new YoutubeProvider();
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
    const provider = new YoutubeProvider();
    assert.equal(provider.analyticsRetentionDays, 29);
    assert.equal(provider.removedDataRetentionDays, 1);
    // A weekly read finds a dead token within 7 days; 7 + 14 stays inside 30.
    assert.ok(provider.profileRetentionDays - 1 + provider.disconnectedDataRetentionDays < 30);
  });
});
