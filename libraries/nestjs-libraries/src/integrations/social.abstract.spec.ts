import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, describe, it } from 'node:test';
import {
  BadBody,
  platformMessage,
  RefreshToken,
  SocialAbstract,
  statusMessage,
} from './social.abstract.ts';

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
