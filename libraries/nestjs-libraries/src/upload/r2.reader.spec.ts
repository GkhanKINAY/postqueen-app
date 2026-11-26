import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it, type TestContext } from 'node:test';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchBucket,
  NoSuchKey,
  NotFound,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { headFromR2, readFromR2 } from './r2.reader.ts';

// Each spec file runs in a process of its own, so these stay in this one.
process.env.CLOUDFLARE_ACCOUNT_ID = 'account';
process.env.CLOUDFLARE_ACCESS_KEY = 'access-key-marker';
process.env.CLOUDFLARE_SECRET_ACCESS_KEY = 'secret-key-marker';
process.env.CLOUDFLARE_BUCKETNAME = 'bucket';

/** Every command the reader hands the client, with the client answering `reply`. */
const store = (t: TestContext, reply: (command: unknown) => unknown) => {
  const sent: unknown[] = [];
  t.mock.method(S3Client.prototype, 'send', async (command: unknown) => {
    sent.push(command);
    return reply(command);
  });
  return sent;
};

const fails = (err: unknown) => () => {
  throw err;
};

/** What the reader wrote to the log while `run` ran. */
const logged = async (t: TestContext, run: () => Promise<unknown>) => {
  const lines: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  const value = await run();
  return { value, lines };
};

const missingKey = () =>
  new NoSuchKey({
    message: 'The specified key does not exist.',
    $metadata: { httpStatusCode: 404 },
  });
const throttled = () =>
  new S3ServiceException({
    name: 'SlowDown',
    $fault: 'server',
    message: 'Reduce your request rate.',
    $metadata: { httpStatusCode: 503 },
  });
const tooMany = () =>
  new S3ServiceException({
    name: 'TooManyRequests',
    $fault: 'client',
    message: 'Too many requests',
    $metadata: { httpStatusCode: 429 },
  });
const status = (name: string, httpStatusCode: number) => () =>
  new S3ServiceException({
    name,
    $fault: httpStatusCode >= 500 ? 'server' : 'client',
    message: name,
    $metadata: { httpStatusCode },
  });
const refusedCredentials = status('AccessDenied', 403);
const unsigned = status('Unauthorized', 401);
const badRequest = status('InvalidArgument', 400);
// What the SDK's HTTP handler rejects with when no response headers arrive
// within requestTimeout. It does so only with throwOnRequestTimeout set,
// which r2() sets; without it the handler logs a warning and keeps waiting.
// No HTTP answer, so no status.
const timedOut = () =>
  Object.assign(
    new Error(
      '@smithy/node-http-handler - [ERROR] a request has exceeded the configured 15000 ms requestTimeout.'
    ),
    { name: 'TimeoutError', code: 'ETIMEDOUT' }
  );

describe('readFromR2', () => {
  it('reads the object', async (t) => {
    const body = Readable.from(['twelve bytes']);
    const sent = store(t, () => ({
      Body: body,
      ContentType: 'video/mp4',
      ContentLength: 12,
      ETag: '"abc"',
    }));

    assert.deepEqual(await readFromR2('aB3xY9pQr7.mp4'), {
      body,
      contentType: 'video/mp4',
      contentLength: 12,
      etag: '"abc"',
      contentRange: undefined,
    });
    assert.equal(sent.length, 1);
    assert.ok(sent[0] instanceof GetObjectCommand);
    assert.deepEqual((sent[0] as GetObjectCommand).input, {
      Bucket: 'bucket',
      Key: 'aB3xY9pQr7.mp4',
    });
  });

  it('answers null for a key that is not there, and logs nothing', async (t) => {
    store(t, fails(missingKey()));
    const { value, lines } = await logged(t, () =>
      readFromR2('aB3xY9pQr7.mp4')
    );
    assert.equal(value, null);
    assert.deepEqual(lines, []);
  });

  it('keeps an unsatisfiable range its own answer', async (t) => {
    store(
      t,
      fails(
        Object.assign(new Error('The requested range is not satisfiable'), {
          name: 'InvalidRange',
          $metadata: { httpStatusCode: 416 },
        })
      )
    );
    assert.equal(
      await readFromR2('aB3xY9pQr7.mp4', 'bytes=99-'),
      'range-not-satisfiable'
    );
  });

  // The object may well be there: answering these as missing is what told
  // the networks, and our own size reads, that it was gone for good.
  for (const [name, err] of [
    ['a throttled store', throttled],
    ['too many requests', tooMany],
    ['credentials it refuses', refusedCredentials],
    ['a request it cannot authenticate', unsigned],
    ['a read that timed out', timedOut],
    [
      'a dropped connection',
      () => Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    ],
    [
      'a missing bucket',
      () =>
        new NoSuchBucket({
          message: 'The specified bucket does not exist',
          $metadata: { httpStatusCode: 404 },
        }),
    ],
  ] as const) {
    it(`answers unavailable, not missing, for ${name}`, async (t) => {
      store(t, fails(err()));
      const { value, lines } = await logged(t, () =>
        readFromR2('aB3xY9pQr7.mp4')
      );
      assert.equal(value, 'unavailable');
      assert.equal(lines.length, 1);
      assert.match(lines[0], /aB3xY9pQr7\.mp4/);
    });
  }

  // An answer about the request for this object keeps the meaning it had.
  it('answers null for any other refusal, and logs nothing', async (t) => {
    store(t, fails(badRequest()));
    const { value, lines } = await logged(t, () =>
      readFromR2('aB3xY9pQr7.mp4')
    );
    assert.equal(value, null);
    assert.deepEqual(lines, []);
  });

  it('logs the error by name and status, never the credentials', async (t) => {
    store(t, fails(throttled()));
    const { lines } = await logged(t, () => readFromR2('aB3xY9pQr7.mp4'));
    assert.equal(
      lines[0],
      '[uploads] could not read aB3xY9pQr7.mp4 from R2: SlowDown (status 503)'
    );
    assert.doesNotMatch(lines[0], /marker/);
  });

  it('logs a timeout by name alone', async (t) => {
    store(t, fails(timedOut()));
    const { lines } = await logged(t, () => readFromR2('aB3xY9pQr7.mp4'));
    assert.equal(
      lines[0],
      '[uploads] could not read aB3xY9pQr7.mp4 from R2: TimeoutError'
    );
  });
});

describe('the R2 client', () => {
  // A store that took the connection and then said nothing kept the read open
  // for good: requestTimeout alone only logs a warning. The handler's own
  // behaviour, a stall cut at the timeout and a long body left to stream, is
  // too slow for this suite and was checked against a fake slow store.
  it('fails a read whose answer does not start within the timeout', async (t) => {
    let handler: any;
    t.mock.method(S3Client.prototype, 'send', function (this: S3Client) {
      handler = this.config.requestHandler;
      throw missingKey();
    });
    await readFromR2('aB3xY9pQr7.mp4');
    const config = await handler.configProvider;
    assert.equal(config.requestTimeout, 15000);
    assert.equal(config.throwOnRequestTimeout, true);
  });
});

describe('headFromR2', () => {
  it('asks for the metadata only', async (t) => {
    const sent = store(t, () => ({
      ContentType: 'video/mp4',
      ContentLength: 104857600,
      ETag: '"abc"',
    }));

    assert.deepEqual(await headFromR2('aB3xY9pQr7.mp4'), {
      contentType: 'video/mp4',
      contentLength: 104857600,
      etag: '"abc"',
    });
    assert.equal(sent.length, 1);
    assert.ok(sent[0] instanceof HeadObjectCommand);
    assert.deepEqual((sent[0] as HeadObjectCommand).input, {
      Bucket: 'bucket',
      Key: 'aB3xY9pQr7.mp4',
    });
  });

  it('answers null for a key that is not there', async (t) => {
    // HeadObject has no body, so the SDK can only call it NotFound.
    store(
      t,
      fails(
        new NotFound({
          message: 'NotFound',
          $metadata: { httpStatusCode: 404 },
        })
      )
    );
    assert.equal(await headFromR2('aB3xY9pQr7.mp4'), null);
  });

  it('answers unavailable when the store fails, whatever the object', async (t) => {
    t.mock.method(console, 'error', () => undefined);
    for (const err of [throttled, tooMany, timedOut, refusedCredentials]) {
      store(t, fails(err()));
      assert.equal(await headFromR2('aB3xY9pQr7.mp4'), 'unavailable');
    }
  });

  it('answers null for any other refusal', async (t) => {
    store(t, fails(badRequest()));
    assert.equal(await headFromR2('aB3xY9pQr7.mp4'), null);
  });
});
