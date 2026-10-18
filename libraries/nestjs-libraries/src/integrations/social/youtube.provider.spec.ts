import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { google } from 'googleapis';
import { YoutubeProvider } from './youtube.provider.ts';
import { YoutubeSettingsDto } from '../../dtos/posts/providers-settings/youtube.settings.dto.ts';

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
