import 'reflect-metadata';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  after,
  afterEach,
  beforeEach,
  describe,
  it,
  type TestContext,
} from 'node:test';
import {
  BadBody,
  MEDIA_NOT_FOUND,
  MEDIA_READ_FAILED,
  MEDIA_READ_SLOW,
  MEDIA_SIZE_UNKNOWN,
  mediaGet,
  mediaHead,
  OWN_FAILURE_MESSAGES,
  platformMessage,
  RefreshToken,
  SocialAbstract,
  statusMessage,
} from './social.abstract.ts';
import { ownUploadSize } from './read.or.fetch.ts';

const realFetch = globalThis.fetch;

class Network extends SocialAbstract {
  identifier = 'network';
  name = 'Network';

  override handleErrors(body: string) {
    if (body.includes('token expired')) {
      return { type: 'refresh-token' as const, value: '' };
    }
    if (body.includes('text_too_long')) {
      return {
        type: 'bad-body' as const,
        value: 'Network accepts up to 500 characters. Shorten the text.',
      };
    }
    return undefined;
  }
}

// Answers every request with the same response and counts them.
const answer = (body: string, status: number) => {
  const calls = { count: 0 };
  globalThis.fetch = (async () => {
    calls.count++;
    return new Response(body, { status });
  }) as typeof fetch;
  return calls;
};

const details = (err: unknown) => (err as BadBody).details?.[0] as any;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('platformMessage', () => {
  it('takes the first readable field, in order', () => {
    assert.equal(
      platformMessage(
        JSON.stringify({
          error_description: 'The access token has been revoked.',
          error: { message: 'Not this one.' },
        })
      ),
      'The access token has been revoked.'
    );
    assert.equal(
      platformMessage(JSON.stringify({ error: { message: 'Media is too big.' } })),
      'Media is too big.'
    );
    assert.equal(
      platformMessage(JSON.stringify({ detail: 'Duplicate content.' })),
      'Duplicate content.'
    );
    assert.equal(
      platformMessage(JSON.stringify({ error: 'The board was archived.' })),
      'The board was archived.'
    );
  });

  it('joins up to three errors', () => {
    assert.equal(
      platformMessage(
        JSON.stringify({
          errors: [
            { message: 'Title is missing.' },
            { message: 'Tags are invalid.' },
            { message: 'Image is too small.' },
            { message: 'Never shown.' },
          ],
        })
      ),
      'Title is missing. Tags are invalid. Image is too small.'
    );
  });

  it('reads the detail of a JSON:API error', () => {
    assert.equal(
      platformMessage(
        JSON.stringify({
          errors: [
            { title: 'Bad Request', code: 8001, detail: 'Posts cannot be empty.' },
          ],
        })
      ),
      'Posts cannot be empty.'
    );
    assert.equal(
      platformMessage(
        JSON.stringify({ errors: [{ title: 'Bad Request', code: 8001 }] })
      ),
      ''
    );
  });

  it('skips bare codes', () => {
    assert.equal(
      platformMessage(
        JSON.stringify({
          error: 'invalid_request',
          message: 'The text is too long.',
        })
      ),
      'The text is too long.'
    );
    assert.equal(platformMessage(JSON.stringify({ error: 'PERMISSION_DENIED' })), '');
    assert.equal(platformMessage(JSON.stringify({ message: 'Forbidden' })), '');
  });

  it('ignores anything that is not JSON', () => {
    assert.equal(
      platformMessage('<html><body><h1>502 Bad Gateway</h1></body></html>'),
      ''
    );
    assert.equal(platformMessage('upstream connect error'), '');
    assert.equal(platformMessage(''), '');
    assert.equal(platformMessage('"a bare string"'), '');
  });

  it('keeps one clean line with nothing that could be a credential', () => {
    const token = 'a'.repeat(40);
    const said = platformMessage(
      JSON.stringify({
        message: `<b>Upload</b> refused for Bearer abc.def and ${token}, see https://api.network.test/v2/media?access_token=secret&x=1\n    at Object.<anonymous> (/srv/app.js:1:1)`,
      })
    );
    assert.equal(
      said,
      'Upload refused for [hidden] and [hidden], see https://api.network.test/v2/media'
    );
    assert.equal(
      platformMessage(JSON.stringify({ message: 'Authorization: Basic dXNlcjpwYXNz' })),
      'Authorization: [hidden]'
    );
  });

  it('caps the message at 280 characters', () => {
    const said = platformMessage(
      JSON.stringify({ message: 'This sentence repeats. '.repeat(40) })
    );
    assert.equal(said.length, 280);
    assert.ok(said.endsWith('…'));
  });
});

describe('runInConcurrent', () => {
  it('rethrows an error that is already classified, unchanged', async () => {
    const provider = new Network();
    for (const thrown of [
      new BadBody('network', '{}', '{}', 'Network could not read the video.'),
      new RefreshToken('network', '{}', '{}', ''),
    ]) {
      await assert.rejects(
        provider.runInConcurrent(async () => {
          throw thrown;
        }),
        (err) => err === thrown
      );
    }
  });

  it('passes on the reason an SDK error carries, without naming the network', async () => {
    const provider = new Network();
    await assert.rejects(
      provider.runInConcurrent(async () => {
        throw Object.assign(new Error('Request failed with code 403'), {
          code: 403,
          data: { title: 'Forbidden', detail: 'You cannot post duplicate content.' },
        });
      }),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.equal(err.message, 'You cannot post duplicate content.');
        assert.equal(details(err).unmapped, true);
        return true;
      }
    );
  });

  it('falls back on the status, never "Unknown Error"', async () => {
    const provider = new Network();
    await assert.rejects(
      provider.runInConcurrent(async () => {
        throw Object.assign(new Error('socket hang up'), {
          response: { status: 503, data: '<html>busy</html>' },
        });
      }),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.equal(err.message, statusMessage(503));
        return true;
      }
    );
  });

  it('does not blame the network for an error that never reached it', async () => {
    const provider = new Network();
    for (const thrown of [
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
      new Error('Input buffer contains unsupported image format'),
    ]) {
      await assert.rejects(
        provider.runInConcurrent(async () => {
          throw thrown;
        }),
        (err) => {
          assert.ok(err instanceof BadBody);
          assert.equal(err.message, statusMessage(0));
          assert.match(err.message, /^PostQueen could not complete the request/);
          return true;
        }
      );
    }
  });
});

describe('fetch', () => {
  it('classifies the last attempt instead of failing it blindly', async () => {
    const provider = new Network();

    answer('{}', 401);
    await assert.rejects(
      provider.fetch('https://api.network.test/post', {}, 'network', 3),
      (err) => err instanceof RefreshToken
    );

    answer(JSON.stringify({ code: 'text_too_long' }), 500);
    await assert.rejects(
      provider.fetch('https://api.network.test/post', {}, 'network', 3),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.equal(
          err.message,
          'Network accepts up to 500 characters. Shorten the text.'
        );
        assert.equal(details(err).unmapped, undefined);
        return true;
      }
    );

    answer('', 429);
    await assert.rejects(
      provider.fetch('https://api.network.test/post', {}, 'network', 3),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.equal(err.message, statusMessage(429));
        assert.equal(details(err).unmapped, true);
        return true;
      }
    );
  });

  it("shows the network's own reason when no mapping matches", async () => {
    const provider = new Network();
    answer(JSON.stringify({ error: { message: 'The link is not allowed.' } }), 400);
    await assert.rejects(
      provider.fetch('https://api.network.test/post'),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.equal(err.message, 'The link is not allowed.');
        assert.equal(details(err).unmapped, true);
        return true;
      }
    );
  });

  it('lets a mapped refresh win over a body that mentions a rate limit', async () => {
    const provider = new Network();
    const calls = answer(
      JSON.stringify({ message: 'Rate limit check skipped: token expired' }),
      400
    );
    await assert.rejects(
      provider.fetch('https://api.network.test/post'),
      (err) => err instanceof RefreshToken
    );
    assert.equal(calls.count, 1);
  });

  it('retries an unmapped rate limit whatever its case', async (t) => {
    const provider = new Network();
    const calls = answer(
      JSON.stringify({ message: 'API rate limit exceeded.' }),
      403
    );
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let failure: unknown;
    const done = provider
      .fetch('https://api.network.test/post', {}, 'network', 2)
      .catch((err) => (failure = err));
    while (failure === undefined) {
      await new Promise((resolve) => setImmediate(resolve));
      t.mock.timers.tick(5000);
    }
    await done;
    assert.equal(calls.count, 2);
    assert.ok(failure instanceof BadBody);
    assert.equal(
      (failure as BadBody).message,
      'API rate limit exceeded.'
    );
  });
});

describe('local media reads', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;
  const root = mkdtempSync(join(tmpdir(), 'pq-media-'));
  const dir = join(root, 'uploads');
  const outside = join(root, 'outside.txt');
  mkdirSync(dir);
  writeFileSync(join(dir, 'a.mp4'), 'twelve bytes');
  writeFileSync(outside, 'secret');

  afterEach(() => {
    process.env.UPLOAD_DIRECTORY = uploadDirectory;
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  const read = (network: any, method: string, path: string) =>
    method === 'mediaChunk'
      ? network.mediaChunk(path, 0, 3, 'network')
      : network[method](path, 'network');

  for (const method of ['mediaSize', 'mediaChunk', 'mediaStream']) {
    it(`${method} opens a file of the upload directory`, async () => {
      process.env.UPLOAD_DIRECTORY = dir;
      const value = await read(new Network(), method, join(dir, 'a.mp4'));
      if (method === 'mediaSize') {
        assert.equal(value, 12);
      } else if (method === 'mediaStream') {
        const chunks: Buffer[] = [];
        for await (const chunk of value) {
          chunks.push(chunk);
        }
        assert.equal(Buffer.concat(chunks).toString(), 'twelve bytes');
      } else {
        assert.equal(value.toString(), 'twel');
      }
    });

    it(`${method} refuses a file outside it, as a post failure`, async () => {
      process.env.UPLOAD_DIRECTORY = dir;
      for (const path of [outside, join(dir, '..', 'outside.txt'), '/etc/passwd']) {
        await assert.rejects(read(new Network(), method, path), (err) => {
          assert.ok(err instanceof BadBody);
          return true;
        });
      }
    });
  }

  it('refuses a local whole-file read outside it, as a post failure', async () => {
    process.env.UPLOAD_DIRECTORY = dir;
    await assert.rejects((new Network() as any).readOrFetch(outside), BadBody);
    assert.equal(
      (await (new Network() as any).readOrFetch(join(dir, 'a.mp4'))).toString(),
      'twelve bytes'
    );
  });

  it('refuses every local read when no upload directory is set', async () => {
    delete process.env.UPLOAD_DIRECTORY;
    await assert.rejects(
      new Network().mediaSize(join(dir, 'a.mp4'), 'network'),
      BadBody
    );
  });
});

// Next sends no Content-Length on a route handler's response (HEAD included),
// so when it serves /uploads itself a HEAD cannot size our own media.
describe('size of our own uploads', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;
  const frontendUrl = process.env.FRONTEND_URL;
  const root = mkdtempSync(join(tmpdir(), 'pq-own-'));
  const dir = join(root, 'uploads');
  mkdirSync(join(dir, '2026', '11'), { recursive: true });
  writeFileSync(join(dir, '2026', '11', 'a.mp4'), 'twelve bytes');
  writeFileSync(join(root, 'outside.txt'), 'secret');
  const own = 'http://localhost:4200/uploads/2026/11/a.mp4';

  // Answers a HEAD with this Content-Length and records the requests.
  const head = (length: string) => {
    const calls: { url: string; method?: string }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return new Response(null, { headers: { 'content-length': length } });
    }) as typeof fetch;
    return calls;
  };

  beforeEach(() => {
    process.env.UPLOAD_DIRECTORY = dir;
    process.env.FRONTEND_URL = 'http://localhost:4200/';
  });
  afterEach(() => {
    process.env.UPLOAD_DIRECTORY = uploadDirectory;
    process.env.FRONTEND_URL = frontendUrl;
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('reads it from disk, with no request', async () => {
    const calls = head('99');
    assert.equal(await new Network().mediaSize(own, 'network'), 12);
    assert.equal(await new Network().mediaSize(`${own}?v=2`, 'network'), 12);
    assert.equal(ownUploadSize(own), 12);
    assert.equal(calls.length, 0);
  });

  it('asks with a HEAD for any other URL, as before', async () => {
    const calls = head('34');
    const url = 'https://cdn.example.com/uploads/2026/11/a.mp4';
    assert.equal(await new Network().mediaSize(url, 'network'), 34);
    assert.deepEqual(calls, [{ url, method: 'HEAD' }]);
    assert.equal(ownUploadSize(url), null);
  });

  it('asks with a HEAD when this worker does not have the file', async () => {
    const calls = head('34');
    const missing = 'http://localhost:4200/uploads/2026/11/b.mp4';
    assert.equal(await new Network().mediaSize(missing, 'network'), 34);
    assert.equal(calls.length, 1);
  });

  it('never reads a path that leaves the upload directory', async () => {
    head('34');
    for (const url of [
      'http://localhost:4200/uploads/../outside.txt',
      'http://localhost:4200/uploads/2026/../../outside.txt',
      'http://localhost:4200/uploads/2026/11',
    ]) {
      assert.equal(ownUploadSize(url), null, url);
      assert.equal(await new Network().mediaSize(url, 'network'), 34, url);
    }
  });

  it('reads nothing from disk without an upload directory', () => {
    delete process.env.UPLOAD_DIRECTORY;
    assert.equal(ownUploadSize(own), null);
  });
});

// Runs `read` with the 5 second wait between the two asks skipped. The
// test enables the mocked setTimeout first.
const settled = async (t: TestContext, read: () => Promise<unknown>) => {
  let outcome: { value?: unknown; err?: unknown } | undefined;
  const done = read().then(
    (value) => (outcome = { value }),
    (err) => (outcome = { err })
  );
  while (outcome === undefined) {
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(5000);
  }
  await done;
  return outcome;
};

// What a refused HEAD means decides how the post fails. Nothing has been
// sent to the network when it runs.
describe('sizing remote media', () => {
  const url = 'https://cdn.example.com/aB3xY9pQr7.mp4';

  // Answers every request with this status and these headers.
  const head = (status: number, headers: Record<string, string> = {}) => {
    const calls: { url: string; method?: string }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method });
      return new Response(null, { status, headers });
    }) as typeof fetch;
    return calls;
  };

  const failsFor = (message: string) => (err: unknown) => {
    assert.ok(err instanceof BadBody);
    assert.equal(err.message, message);
    return true;
  };

  it('reads the size and type from a HEAD', async () => {
    const calls = head(200, {
      'content-length': '104857600',
      'content-type': 'video/mp4',
    });
    assert.deepEqual(await mediaHead(url, 'network'), {
      size: 104857600,
      type: 'video/mp4',
    });
    assert.deepEqual(calls, [{ url, method: 'HEAD' }]);
  });

  it('fails the post for good when the file is gone', async () => {
    for (const status of [404, 410]) {
      head(status, { 'content-length': '9' });
      await assert.rejects(
        mediaHead(url, 'network'),
        failsFor(MEDIA_NOT_FOUND)
      );
      await assert.rejects(
        new Network().mediaSize(url, 'network'),
        failsFor(MEDIA_NOT_FOUND)
      );
    }
    assert.ok(OWN_FAILURE_MESSAGES.includes(MEDIA_NOT_FOUND));
  });

  it('fails it for good when the host refuses the file', async () => {
    head(403, { 'content-length': '9' });
    await assert.rejects(
      new Network().mediaSize(url, 'network'),
      failsFor(MEDIA_READ_FAILED)
    );
  });

  it('asks once more when the store cannot answer, and takes that answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls: number[] = [];
    globalThis.fetch = (async () => {
      calls.push(calls.length);
      return calls.length === 1
        ? new Response(null, { status: 503, headers: { 'retry-after': '5' } })
        : new Response(null, { headers: { 'content-length': '34' } });
    }) as typeof fetch;
    const { value } = await settled(t, () =>
      new Network().mediaSize(url, 'network')
    );
    assert.equal(value, 34);
    assert.equal(calls.length, 2);
  });

  it('says the read was slow, never that the file is gone, when it still cannot', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (const status of [429, 500, 502, 503]) {
      const calls = head(status, { 'retry-after': '5' });
      const { err } = await settled(t, () =>
        new Network().mediaSize(url, 'network')
      );
      assert.ok(err instanceof BadBody, String(status));
      assert.equal(err.message, MEDIA_READ_SLOW);
      assert.equal(details(err).json, JSON.stringify({ status, path: url }));
      assert.equal(calls.length, 2);
    }
  });

  it('does the same when nothing answers', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let count = 0;
    globalThis.fetch = (async () => {
      count++;
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const { err } = await settled(t, () =>
      new Network().mediaSize(url, 'network')
    );
    assert.ok(err instanceof BadBody);
    assert.equal(err.message, MEDIA_READ_SLOW);
    assert.equal(count, 2);
  });

  it('fails at once when no answer can ever come', async () => {
    for (const cause of [
      new Error('Blocked IP'),
      Object.assign(new Error('getaddrinfo ENOTFOUND cdn.example.com'), {
        code: 'ENOTFOUND',
      }),
    ]) {
      let count = 0;
      globalThis.fetch = (async () => {
        count++;
        throw new TypeError('fetch failed', { cause });
      }) as typeof fetch;
      // no mocked timers: a wait would hold this test for 5 seconds
      await assert.rejects(
        new Network().mediaSize(url, 'network'),
        failsFor(MEDIA_READ_FAILED)
      );
      assert.equal(count, 1);
    }
  });

  it('asks once more for any other missing answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let count = 0;
    globalThis.fetch = (async () => {
      count++;
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        }),
      });
    }) as typeof fetch;
    const { err } = await settled(t, () => mediaHead(url, 'network'));
    assert.ok(err instanceof BadBody);
    assert.equal(err.message, MEDIA_READ_SLOW);
    assert.equal(count, 2);
  });

  it('gives a HEAD a deadline, and counts missing it as no answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const signals: (AbortSignal | undefined)[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      // what fetch rejects with when AbortSignal.timeout runs out
      throw new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError'
      );
    }) as typeof fetch;
    const { err } = await settled(t, () => mediaHead(url, 'network'));
    assert.ok(err instanceof BadBody);
    assert.equal(err.message, MEDIA_READ_SLOW);
    assert.equal(signals.length, 2);
    // a fresh deadline for each ask
    assert.ok(signals.every((signal) => signal instanceof AbortSignal));
    assert.notEqual(signals[0], signals[1]);
  });

  it("keeps the caller's message for an answer without a size", async () => {
    for (const headers of [{}, { 'content-length': '0' }]) {
      head(200, headers);
      await assert.rejects(
        new Network().mediaSize(url, 'network'),
        failsFor(MEDIA_SIZE_UNKNOWN)
      );
      await assert.rejects(
        new Network().mediaSize(url, 'network', 'No video size'),
        failsFor('No video size')
      );
    }
  });
});

// The reads after the size read: the whole file streamed into an upload, or
// one ranged chunk of it. Same answers as the size read.
describe('reading remote media', () => {
  const url = 'https://cdn.example.com/aB3xY9pQr7.mp4';

  // Answers the requests in turn with these statuses, the last one for good.
  const store = (...statuses: number[]) => {
    const asked: (string | undefined)[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const status = statuses[Math.min(asked.length, statuses.length - 1)];
      asked.push((init?.headers as Record<string, string>)?.Range);
      return new Response(status < 300 ? 'twelve bytes' : null, { status });
    }) as typeof fetch;
    return asked;
  };

  const text = async (stream: Readable) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString();
  };

  it('streams the file, asking once more when the store could not answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const asked = store(503, 200);
    const { value } = await settled(t, () =>
      (new Network() as any).mediaStream(url, 'network')
    );
    assert.equal(await text(value as Readable), 'twelve bytes');
    assert.equal(asked.length, 2);
  });

  it('fails the post when the store stays busy, or does not have the file', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (const [status, message, asks] of [
      [503, MEDIA_READ_SLOW, 2],
      [429, MEDIA_READ_SLOW, 2],
      [404, MEDIA_NOT_FOUND, 1],
      [403, MEDIA_READ_FAILED, 1],
    ] as const) {
      const asked = store(status);
      const { err } = await settled(t, () => mediaGet(url, 'network'));
      assert.ok(err instanceof BadBody, String(status));
      assert.equal(err.message, message);
      assert.equal(asked.length, asks);
    }
  });

  it('reads a chunk again when the store could not answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const asked = store(503, 206);
    const { value } = await settled(t, () =>
      (new Network() as any).mediaChunk(url, 0, 11, 'network')
    );
    assert.equal(String(value), 'twelve bytes');
    assert.deepEqual(asked, ['bytes=0-11', 'bytes=0-11']);
  });

  it('fails a chunk the store will not give', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (const [status, message, asks] of [
      [503, MEDIA_READ_SLOW, 2],
      [404, MEDIA_NOT_FOUND, 1],
      // a store that ignores the Range would corrupt the upload at this offset
      [200, MEDIA_READ_FAILED, 1],
    ] as const) {
      const asked = store(status);
      const { err } = await settled(t, () =>
        (new Network() as any).mediaChunk(url, 0, 11, 'network')
      );
      assert.ok(err instanceof BadBody, String(status));
      assert.equal(err.message, message);
      assert.equal(asked.length, asks);
    }
  });

  // These stream the file into their upload themselves.
  it('is how Skool, Whop and Bluesky read the file they upload', () => {
    for (const name of ['skool', 'whop', 'bluesky']) {
      const source = readFileSync(
        fileURLToPath(new URL(`./social/${name}.provider.ts`, import.meta.url)),
        'utf8'
      );
      assert.match(source, /await mediaGet\(/, name);
      assert.match(source, /await mediaHead\(/, name);
      assert.doesNotMatch(source, /method: 'HEAD'/, name);
    }
  });
});
