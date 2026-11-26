import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, describe, it, type TestContext } from 'node:test';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import {
  BadBody,
  MEDIA_NOT_FOUND,
  mediaHead,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { UploadsController } from './uploads.controller.ts';

const KEY = 'aB3xY9pQr7.mp4';
const BYTES = 'twelve bytes';

// The S3 client answers from here, so nothing reaches a bucket. Records which
// commands the controller sent.
type Reply = (command: unknown) => unknown;
const store = (t: TestContext, reply: Reply) => {
  const sent: string[] = [];
  t.mock.method(S3Client.prototype, 'send', async (command: unknown) => {
    sent.push((command as object).constructor.name);
    return reply(command);
  });
  return sent;
};

const stored: Reply = (command) =>
  command instanceof GetObjectCommand
    ? {
        Body: Readable.from([Buffer.from(BYTES)]),
        ContentType: 'video/mp4',
        ContentLength: BYTES.length,
        ETag: '"v1"',
      }
    : { ContentType: 'video/mp4', ContentLength: BYTES.length, ETag: '"v1"' };

const fails =
  (err: () => unknown): Reply =>
  () => {
    throw err();
  };

const missing = fails(
  () => new NoSuchKey({ message: 'no key', $metadata: { httpStatusCode: 404 } })
);
const headMissing = fails(
  () =>
    new NotFound({ message: 'NotFound', $metadata: { httpStatusCode: 404 } })
);
const throttled = fails(
  () =>
    new S3ServiceException({
      name: 'SlowDown',
      $fault: 'server',
      message: 'Reduce your request rate.',
      $metadata: { httpStatusCode: 503 },
    })
);
// What the SDK's HTTP handler rejects with when no response headers arrive
// within requestTimeout (see r2.reader.spec.ts).
const timedOut = fails(() =>
  Object.assign(
    new Error(
      '@smithy/node-http-handler - [ERROR] a request has exceeded the configured 15000 ms requestTimeout.'
    ),
    { name: 'TimeoutError', code: 'ETIMEDOUT' }
  )
);

// The headers a client sizes, caches and trusts the file by.
const SHARED = [
  'content-type',
  'content-length',
  'etag',
  'accept-ranges',
  'cache-control',
  'x-content-type-options',
  'content-security-policy',
];
const shared = (res: Response) =>
  Object.fromEntries(SHARED.map((name) => [name, res.headers.get(name)]));

describe('uploads route', () => {
  const env = {
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_BUCKETNAME: process.env.CLOUDFLARE_BUCKETNAME,
    DISABLE_SSRF_PROTECTION: process.env.DISABLE_SSRF_PROTECTION,
  };
  let app: INestApplication;
  let base: string;

  before(async () => {
    process.env.STORAGE_PROVIDER = 'cloudflare';
    process.env.CLOUDFLARE_ACCOUNT_ID ||= 'account';
    process.env.CLOUDFLARE_BUCKETNAME ||= 'bucket';

    @Module({ controllers: [UploadsController] })
    class TestModule {}

    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/uploads`;
  });

  after(async () => {
    await app.close();
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  const quiet = (t: TestContext) =>
    t.mock.method(console, 'error', () => undefined);

  describe('HEAD', () => {
    it('answers what a GET would, from the metadata alone', async (t) => {
      const sent = store(t, stored);
      const head = await fetch(`${base}/${KEY}`, { method: 'HEAD' });
      const get = await fetch(`${base}/${KEY}`);

      assert.equal(head.status, 200);
      assert.equal(await get.text(), BYTES);
      assert.deepEqual(shared(head), shared(get));
      assert.equal(head.headers.get('content-length'), String(BYTES.length));
      assert.equal(head.headers.get('etag'), '"v1"');
      // the HEAD never opened the object, the GET did
      assert.deepEqual(sent, [HeadObjectCommand.name, GetObjectCommand.name]);
    });

    it('ignores a Range, as HTTP has it for anything but a GET', async (t) => {
      const sent = store(t, stored);
      const head = await fetch(`${base}/${KEY}`, {
        method: 'HEAD',
        headers: { Range: 'bytes=0-3' },
      });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('content-length'), String(BYTES.length));
      assert.equal(head.headers.get('content-range'), null);
      assert.deepEqual(sent, [HeadObjectCommand.name]);
    });

    it('answers 304 to a client that has this version', async (t) => {
      store(t, stored);
      const head = await fetch(`${base}/${KEY}`, {
        method: 'HEAD',
        headers: { 'If-None-Match': '"v1"' },
      });
      assert.equal(head.status, 304);
      assert.equal(head.headers.get('etag'), '"v1"');
    });

    it('answers 404 for an object that is not there', async (t) => {
      store(t, headMissing);
      const head = await fetch(`${base}/${KEY}`, { method: 'HEAD' });
      assert.equal(head.status, 404);
      assert.equal(head.headers.get('retry-after'), null);
    });

    it('answers 503 to come back for when the store cannot be asked', async (t) => {
      quiet(t);
      for (const reply of [throttled, timedOut]) {
        store(t, reply);
        const head = await fetch(`${base}/${KEY}`, { method: 'HEAD' });
        assert.equal(head.status, 503);
        assert.equal(head.headers.get('retry-after'), '5');
        assert.equal(head.headers.get('cache-control'), 'no-store');
        assert.equal(head.headers.get('content-length'), null);
      }
    });

    it('refuses a key storage never writes without asking the store', async (t) => {
      const sent = store(t, stored);
      for (const key of ['backup.sql', 'a.mp4.sql', '..%2Fsecret.png']) {
        const head = await fetch(`${base}/${key}`, { method: 'HEAD' });
        assert.equal(head.status, 404, key);
      }
      assert.deepEqual(sent, []);
    });
  });

  describe('GET', () => {
    it('streams the object', async (t) => {
      store(t, stored);
      const res = await fetch(`${base}/${KEY}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'video/mp4');
      assert.equal(await res.text(), BYTES);
    });

    it('answers a part with 206', async (t) => {
      const sent = store(t, () => ({
        Body: Readable.from([Buffer.from('twel')]),
        ContentType: 'video/mp4',
        ContentLength: 4,
        ContentRange: `bytes 0-3/${BYTES.length}`,
        ETag: '"v1"',
      }));
      const res = await fetch(`${base}/${KEY}`, {
        headers: { Range: 'bytes=0-3' },
      });
      assert.equal(res.status, 206);
      assert.equal(
        res.headers.get('content-range'),
        `bytes 0-3/${BYTES.length}`
      );
      assert.equal(await res.text(), 'twel');
      assert.deepEqual(sent, [GetObjectCommand.name]);
    });

    it('answers 404 for an object that is not there', async (t) => {
      store(t, missing);
      const res = await fetch(`${base}/${KEY}`);
      assert.equal(res.status, 404);
    });

    it('answers 503 to come back for when the store cannot be asked', async (t) => {
      quiet(t);
      for (const reply of [throttled, timedOut]) {
        store(t, reply);
        const res = await fetch(`${base}/${KEY}`);
        assert.equal(res.status, 503);
        assert.equal(res.headers.get('retry-after'), '5');
        assert.equal(res.headers.get('cache-control'), 'no-store');
      }
    });
  });

  // The whole chain a video post runs before it uploads: a provider sizes the
  // file with a HEAD of its stored URL.
  describe('sizing a post video through it', () => {
    before(() => {
      // the route listens on loopback, which the guard refuses
      process.env.DISABLE_SSRF_PROTECTION = 'true';
    });

    it('reads the size from the HEAD', async (t) => {
      store(t, stored);
      assert.deepEqual(await mediaHead(`${base}/${KEY}`, 'network'), {
        size: BYTES.length,
        type: 'video/mp4',
      });
    });

    it('fails the post for good when the file is gone', async (t) => {
      store(t, headMissing);
      await assert.rejects(mediaHead(`${base}/${KEY}`, 'network'), (err) => {
        assert.ok(err instanceof BadBody);
        assert.equal(err.message, MEDIA_NOT_FOUND);
        return true;
      });
    });

    // What failed the posts this fixes: a read that timed out once. The
    // route says come back in 5 seconds, and the size read does.
    it('waits out a slow store and reads the size on the second ask', async (t) => {
      quiet(t);
      let asked = 0;
      const sent = store(t, (command) => {
        if (++asked === 1) {
          return timedOut(command);
        }
        return stored(command);
      });
      assert.deepEqual(await mediaHead(`${base}/${KEY}`, 'network'), {
        size: BYTES.length,
        type: 'video/mp4',
      });
      assert.deepEqual(sent, [HeadObjectCommand.name, HeadObjectCommand.name]);
    });
  });
});
