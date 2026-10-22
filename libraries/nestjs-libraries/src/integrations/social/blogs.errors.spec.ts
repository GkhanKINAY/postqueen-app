import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { afterEach, describe, it } from 'node:test';
import { AxiosError } from 'axios';
import { WordpressProvider } from './wordpress.provider.ts';
import { DribbbleProvider } from './dribbble.provider.ts';
import { DevToProvider } from './dev.to.provider.ts';
import { BadBody, RefreshToken } from '../social.abstract.ts';
import { getSsrfSafeAxios } from '../../dtos/webhooks/ssrf.safe.dispatcher.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

// What a WordPress site with WP_DEBUG_DISPLAY on prints before the JSON.
const PHP_NOTICE =
  '<br />\n<b>Notice</b>:  Undefined index: cover in <b>/var/www/wp-content/plugins/seo/seo.php</b> on line <b>12</b><br />\n';

const wordpressToken = Buffer.from(
  JSON.stringify({ domain: 'https://blog.test', username: 'ada', password: 'pw' })
).toString('base64');

const wordpressPost = (settings: Record<string, any> = {}) =>
  [
    {
      id: 'post',
      message: '<p>Hello</p>',
      settings: { title: 'Hello world', type: 'posts', ...settings },
      media: [],
    },
  ] as any;

// Answers each this.fetch call in turn and records what was asked. The cover
// image is read through readOrFetch, which answers with a few bytes.
class ScriptedWordpress extends WordpressProvider {
  calls: Array<{ url: string; init: RequestInit }> = [];
  reads: string[] = [];

  // `cover: null` reads the cover for real, through SocialAbstract.
  constructor(
    private readonly answers: Array<Response | string>,
    private readonly cover: (() => Promise<Buffer>) | null = async () =>
      Buffer.from('png')
  ) {
    super();
  }

  override async fetch(url: string, init: RequestInit = {}) {
    this.calls.push({ url, init });
    const answer = this.answers.shift()!;
    return typeof answer === 'string'
      ? new Response(answer, { status: 201 })
      : answer;
  }

  protected override async readOrFetch(path: string) {
    this.reads.push(path);
    return this.cover ? this.cover() : super.readOrFetch(path);
  }
}

describe('WordPress reads its answer tolerantly', () => {
  it('returns the post when a PHP notice is printed before the JSON', async () => {
    const provider = new ScriptedWordpress([
      `${PHP_NOTICE}{"id":42,"link":"https://blog.test/hello-world/"}`,
    ]);
    const [result] = await provider.post('id', wordpressToken, wordpressPost(), {} as any);
    assert.equal(result.postId, '42');
    assert.equal(result.releaseURL, 'https://blog.test/hello-world/');
    assert.equal(result.status, 'completed');
  });

  it('also reads output printed after the JSON', async () => {
    const provider = new ScriptedWordpress([
      '{"id":7,"link":"https://blog.test/?p=7"}\n<!-- cached by a plugin -->',
    ]);
    const [result] = await provider.post('id', wordpressToken, wordpressPost(), {} as any);
    assert.equal(result.postId, '7');
  });

  it('fails as BadBody, never a plain error, when the answer has no post id', async () => {
    for (const answer of ['<html>Maintenance</html>', '{"id":', '']) {
      const provider = new ScriptedWordpress([answer]);
      await assert.rejects(
        provider.post('id', wordpressToken, wordpressPost(), {} as any),
        (err: any) => {
          assert.ok(err instanceof BadBody, answer);
          assert.equal(
            err.message,
            'WordPress may have published the post, but its answer could not be read. Check your site before posting again.'
          );
          return true;
        }
      );
    }
  });

  it('reads the cover upload answer the same way and sends its id', async () => {
    const provider = new ScriptedWordpress([
      `${PHP_NOTICE}{"id":901}`,
      '{"id":42,"link":"https://blog.test/hello-world/"}',
    ]);
    await provider.post(
      'id',
      wordpressToken,
      wordpressPost({ main_image: { id: 'm', path: 'https://cdn.test/cover.png' } }),
      {} as any
    );
    const [media, post] = provider.calls;
    assert.equal(media.url, 'https://blog.test/wp-json/wp/v2/media');
    assert.equal((media.init.headers as any)['Content-Type'], 'image/png');
    assert.equal(JSON.parse(String(post.init.body)).featured_media, 901);
  });

  it('does not create the post when the cover upload answer cannot be read', async () => {
    const provider = new ScriptedWordpress(['<html>Error</html>']);
    await assert.rejects(
      provider.post(
        'id',
        wordpressToken,
        wordpressPost({ main_image: { id: 'm', path: 'https://cdn.test/cover.png' } }),
        {} as any
      ),
      (err: any) => err instanceof BadBody && /cover image/.test(err.message)
    );
    assert.equal(provider.calls.length, 1);
  });

  it('reads the cover with readOrFetch, so a media host 401 is not a WordPress reconnect', async () => {
    // The media host answers 401, as readOrFetch's axios reports it.
    const http = getSsrfSafeAxios();
    const adapter = http.defaults.adapter;
    http.defaults.adapter = async (config) => {
      throw new AxiosError(
        'Request failed with status code 401',
        AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config } as any
      );
    };
    try {
      const provider = new ScriptedWordpress([], null);
      await assert.rejects(
        provider.post(
          'id',
          wordpressToken,
          wordpressPost({ main_image: { id: 'm', path: 'https://cdn.test/cover.png' } }),
          {} as any
        ),
        (err: any) =>
          err instanceof BadBody &&
          /could not read the media for this post/.test(err.message)
      );
      assert.deepEqual(provider.reads, ['https://cdn.test/cover.png']);
      assert.equal(provider.calls.length, 0);
    } finally {
      http.defaults.adapter = adapter;
    }
  });
});

describe('WordPress refusals', () => {
  const provider = new WordpressProvider();

  it('says the login was not seen on a 401 rest_cannot_* answer', () => {
    const body = JSON.stringify({
      code: 'rest_cannot_create',
      message: 'Sorry, you are not allowed to create posts as this user.',
      data: { status: 401 },
    });
    assert.deepEqual(provider.handleErrors(body, 401), {
      type: 'bad-body',
      value:
        'WordPress did not see the login. A security plugin or server setting may be removing the Authorization header.',
    });
  });

  it("passes WordPress's own reason on, with the role hint, for posts and media", () => {
    assert.deepEqual(
      provider.handleErrors(
        JSON.stringify({
          code: 'rest_cannot_publish',
          message: 'Sorry, you are not allowed to publish posts in this post type.',
        }),
        403
      ),
      {
        type: 'bad-body',
        value:
          'WordPress refused: Sorry, you are not allowed to publish posts in this post type. Check that the connected user has the Author or Editor role.',
      }
    );
    assert.equal(
      provider.handleErrors(
        `${PHP_NOTICE}{"code":"rest_cannot_create","message":"Sorry, you are not allowed to upload files"}`,
        403
      )?.value,
      'WordPress refused: Sorry, you are not allowed to upload files. Check that the connected user has the Author or Editor role.'
    );
    assert.equal(
      provider.handleErrors('{"code":"rest_cannot_create"}', 403)?.value,
      'WordPress refused the post. Check that the connected user has the Author or Editor role.'
    );
  });

  it('leaves other answers to the shared rules', () => {
    assert.equal(
      provider.handleErrors('{"code":"rest_invalid_param","message":"Invalid parameter(s): tags"}', 400),
      undefined
    );
    assert.equal(provider.handleErrors('{"code":"incorrect_password"}', 401), undefined);
    assert.equal(provider.handleErrors('<html>rest_cannot_create</html>', 403), undefined);
  });

  it('fails a 401 rest_cannot_create publish as BadBody, not as a reconnect', async () => {
    globalThis.fetch = (async () =>
      json(
        {
          code: 'rest_cannot_create',
          message: 'Sorry, you are not allowed to create posts as this user.',
          data: { status: 401 },
        },
        401
      )) as typeof fetch;
    await assert.rejects(
      new WordpressProvider().post('id', wordpressToken, wordpressPost(), {} as any),
      (err: any) =>
        err instanceof BadBody && /did not see the login/.test(err.message)
    );
  });
});

// Records the Dribbble POST and answers it with `answer` (or throws it).
const dribbble = (answer: () => Promise<any>) => {
  const provider = new DribbbleProvider();
  (provider as any).mediaStream = async () => Readable.from(['x']);
  (provider as any).mediaSize = async () => 1;
  (provider as any).getSsrfSafeAxios = () => ({ post: answer });
  return provider;
};

const shot = [
  {
    id: 'post',
    message: 'Description',
    settings: { title: 'Shot' },
    media: [{ type: 'image', path: 'https://cdn.test/shot.png' }],
  },
] as any;

const refusal = (status: number, data: unknown) => async () => {
  throw Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });
};

describe('Dribbble errors', () => {
  const provider = new DribbbleProvider();

  it('asks for a reconnect on a 401', () => {
    assert.deepEqual(provider.handleErrors('{"message":"Bad credentials."}', 401), {
      type: 'refresh-token',
      value: 'Reconnect Dribbble in Channels, then schedule the post again.',
    });
  });

  it('gives the reasons of a 422 instead of "Validation failed."', () => {
    const body = JSON.stringify({
      message: 'Validation failed.',
      errors: [
        { attribute: 'image', message: 'Image must be exactly 400x300 or 800x600.' },
        { attribute: 'title', message: "Title can't be blank." },
      ],
    });
    assert.deepEqual(provider.handleErrors(body, 422), {
      type: 'bad-body',
      value: "Image must be exactly 400x300 or 800x600. Title can't be blank.",
    });
    assert.equal(
      provider.handleErrors('{"message":"Validation failed."}', 422)?.value,
      'Validation failed.'
    );
  });

  it("uses Dribbble's message, or the status, for other refusals", () => {
    assert.equal(
      provider.handleErrors('{"message":"You must be a member to upload."}', 403)?.value,
      'You must be a member to upload.'
    );
    assert.equal(
      provider.handleErrors('<html>Forbidden</html>', 403)?.value,
      'Dribbble rejected the shot with status 403.'
    );
  });

  it('leaves 429 and 5xx to the shared retry', () => {
    assert.equal(provider.handleErrors('{"message":"API rate limit exceeded."}', 429), undefined);
    assert.equal(provider.handleErrors('{}', 500), undefined);
    assert.equal(provider.handleErrors('{}', 503), undefined);
  });

  it('fails a publish with the 422 reasons, through runStreamedUpload', async () => {
    const post = dribbble(
      refusal(422, {
        message: 'Validation failed.',
        errors: [{ attribute: 'image', message: 'Image is too large.' }],
      })
    );
    await assert.rejects(
      post.post('id', 'token', shot),
      (err: any) => err instanceof BadBody && err.message === 'Image is too large.'
    );
  });

  it('turns a 401 on publish into a reconnect', async () => {
    await assert.rejects(
      dribbble(refusal(401, { message: 'Bad credentials.' })).post('id', 'token', shot),
      (err: any) => err instanceof RefreshToken
    );
  });

  it('never reads a media host refusal as a Dribbble reconnect', async () => {
    globalThis.fetch = (async () => new Response('', { status: 401 })) as typeof fetch;
    const provider = new DribbbleProvider();
    (provider as any).getSsrfSafeAxios = () => ({
      post: async () => assert.fail('Dribbble was called'),
    });
    await assert.rejects(
      provider.post('id', 'token', shot),
      (err: any) => err instanceof BadBody && !(err instanceof RefreshToken)
    );
  });

  it('reads the shot id from Location, and does not throw without one', async () => {
    const [published] = await dribbble(async () => ({
      headers: { location: 'https://api.dribbble.com/v2/shots/123' },
    })).post('id', 'token', shot);
    assert.equal(published.postId, '123');
    assert.equal(published.releaseURL, 'https://dribbble.com/shots/123');

    const [missing] = await dribbble(async () => ({ headers: {} })).post(
      'id',
      'token',
      shot
    );
    assert.equal(missing.postId, '');
  });
});

class MeasuredDribbble extends DribbbleProvider {
  constructor(
    private readonly size: { width: number; height: number },
    private readonly bytes: () => Promise<number> = async () => 1024
  ) {
    super();
  }

  protected override async getImageDimensions() {
    return this.size;
  }

  protected override async mediaSize() {
    return this.bytes();
  }
}

const one = (path: string) => [[{ path }]];

describe('Dribbble media rules', () => {
  const fits = new MeasuredDribbble({ width: 800, height: 600 });

  it('takes one GIF, JPG or PNG of 400 x 300 or 800 x 600', async () => {
    for (const ext of ['gif', 'jpg', 'jpeg', 'png', 'PNG']) {
      assert.equal(await fits.checkValidity(one(`https://cdn.test/a.${ext}`)), true, ext);
    }
    assert.equal(
      await new MeasuredDribbble({ width: 400, height: 300 }).checkValidity(
        one('https://cdn.test/a.png')
      ),
      true
    );
  });

  it('needs exactly one image', async () => {
    for (const items of [[[]], [[{ path: 'https://cdn.test/a.png' }, { path: 'https://cdn.test/b.png' }]]]) {
      assert.equal(
        await fits.checkValidity(items),
        'Dribbble needs exactly one image for a shot.'
      );
    }
  });

  it('refuses videos by their extension, not by "mp4" anywhere in the path', async () => {
    for (const ext of ['mp4', 'mov', 'webm']) {
      assert.equal(
        await fits.checkValidity(one(`https://cdn.test/a.${ext}?x=1`)),
        'Dribbble does not accept videos. Attach one GIF, JPG or PNG image.',
        ext
      );
    }
    assert.equal(await fits.checkValidity(one('https://cdn.test/mp4/mp4-cover.png')), true);
  });

  it('refuses other picture formats', async () => {
    assert.equal(
      await fits.checkValidity(one('https://cdn.test/a.webp')),
      'Dribbble does not accept this file type. Attach one GIF, JPG or PNG image.'
    );
  });

  it('refuses images over 8 MB, and leaves an unknown size to Dribbble', async () => {
    assert.equal(
      await new MeasuredDribbble({ width: 800, height: 600 }, async () => 8 * 1024 * 1024 + 1).checkValidity(
        one('https://cdn.test/a.png')
      ),
      'Dribbble accepts images up to 8 MB.'
    );
    assert.equal(
      await new MeasuredDribbble({ width: 800, height: 600 }, async () => 8 * 1024 * 1024).checkValidity(
        one('https://cdn.test/a.png')
      ),
      true
    );
    assert.equal(
      await new MeasuredDribbble({ width: 800, height: 600 }, async () => {
        throw new Error('HEAD failed');
      }).checkValidity(one('https://cdn.test/a.png')),
      true
    );
  });

  it('names the size it measured', async () => {
    assert.equal(
      await new MeasuredDribbble({ width: 1024, height: 768 }).checkValidity(
        one('https://cdn.test/a.png')
      ),
      'Dribbble needs an image of exactly 400 x 300 or 800 x 600 pixels. This one is 1024 x 768.'
    );
  });
});

describe('Dev.to canonical URL', () => {
  it('says what to change', () => {
    assert.deepEqual(
      new DevToProvider().handleErrors(
        '{"error":"Canonical url has already been taken","status":422}'
      ),
      {
        type: 'bad-body',
        value:
          'Dev.to already has an article with this canonical URL. Change or remove it in the post settings, then try again.',
      }
    );
  });
});
