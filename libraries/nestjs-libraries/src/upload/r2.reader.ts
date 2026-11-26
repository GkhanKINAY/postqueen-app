import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { r2Endpoint } from '@gitroom/nestjs-libraries/upload/r2.endpoint';

/**
 * Reads objects back out of R2 so the application can serve media from its own
 * domain instead of handing out bucket URLs.
 *
 * Why that matters: several networks — Instagram, Facebook, Pinterest, TikTok
 * photo posts — do not accept the file from us, they fetch the address we give
 * them. A bucket's r2.dev address is rate limited and documented as unfit for
 * production, and it cannot be verified with the networks that require you to
 * prove you own the domain you are serving from. Serving through our own host
 * fixes both, and lets the bucket stay private.
 *
 * This reads over the S3 API, not r2.dev, so no rate limit applies here.
 */

let client: S3Client | undefined;

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: process.env.CLOUDFLARE_REGION || 'auto',
      endpoint: r2Endpoint(
        process.env.CLOUDFLARE_ACCOUNT_ID!,
        process.env.CLOUDFLARE_JURISDICTION
      ),
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY!,
        secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
      },
      // Fail a stuck read instead of letting the request hang with no answer.
      // requestTimeout only runs until the response headers arrive, so a long
      // video still streams for as long as it takes. Without
      // throwOnRequestTimeout it only logs a warning, and a store that took the
      // connection and then said nothing kept the request open for good.
      requestHandler: {
        connectionTimeout: 5000,
        requestTimeout: 15000,
        throwOnRequestTimeout: true,
      },
    });
  }

  return client;
}

export interface R2Head {
  contentType?: string;
  contentLength?: number;
  etag?: string;
}

export interface R2Object extends R2Head {
  body: Readable;
  // Set only when a `range` was asked for and the store answered with part of
  // the object. Its presence is what tells the caller to reply 206.
  contentRange?: string;
}

// Whether a failed read says nothing about the object: no HTTP answer at all
// (a timeout, a dropped connection, a socket pool with nothing free), our
// credentials refused (401, 403), throttling (429), or the store's own
// failure (5xx). Any other answer is about the object or the request for it
// and keeps its meaning: a missing key (NoSuchKey from GetObject, NotFound
// from HeadObject, which has no body to name it in) or any other refusal is
// a 404. A missing bucket is a 404 too, but it is this install's settings
// that are wrong, not the file that is gone.
const storeFailed = (err: any) => {
  if (err?.name === 'NoSuchKey' || err?.name === 'NotFound') {
    return false;
  }
  const status = err?.$metadata?.httpStatusCode;
  return (
    !status ||
    status === 401 ||
    status === 403 ||
    status === 429 ||
    status >= 500 ||
    err?.name === 'NoSuchBucket'
  );
};

// A store that failed says nothing about the object: it may well be there.
// Answering that as missing told the networks, and our own size reads, that
// the file was gone for good. Logged by name and status only, so nothing of
// the request it failed on is written out.
const reportUnavailable = (key: string, err: any) => {
  const status = err?.$metadata?.httpStatusCode;
  console.error(
    `[uploads] could not read ${key} from R2: ${err?.name || 'Error'}${
      status ? ` (status ${status})` : ''
    }`
  );
  return 'unavailable' as const;
};

/**
 * Returns null when the object is not there, rather than throwing — a missing
 * file is a 404, not a server error, and media URLs are public enough to be
 * probed. Returns 'unavailable' when the store could not be asked, which the
 * caller answers with a 503 to come back for.
 *
 * `range` is passed through verbatim as the S3 `Range` parameter, so the store
 * decides what it can satisfy rather than this doing arithmetic on a header it
 * did not parse. An unsatisfiable range is its own answer: the object exists,
 * so it is a 416 and not the 404 a null would produce.
 */
export async function readFromR2(
  key: string,
  range?: string
): Promise<R2Object | null | 'range-not-satisfiable' | 'unavailable'> {
  try {
    const object = await r2().send(
      new GetObjectCommand({
        Bucket: process.env.CLOUDFLARE_BUCKETNAME!,
        Key: key,
        ...(range ? { Range: range } : {}),
      })
    );

    return {
      body: object.Body as Readable,
      contentType: object.ContentType,
      // With a Range this is the length of the part, not of the object, which
      // is exactly what the response needs.
      contentLength: object.ContentLength,
      etag: object.ETag,
      contentRange: object.ContentRange,
    };
  } catch (err) {
    if ((err as { name?: string })?.name === 'InvalidRange') {
      return 'range-not-satisfiable';
    }

    if (storeFailed(err)) {
      return reportUnavailable(key, err);
    }

    return null;
  }
}

/**
 * What a HEAD answers with: the object's metadata, without opening its body.
 * A HEAD that went through readFromR2 pulled the whole object out of the store
 * for Express to throw away, and held one of the client's sockets while it
 * did, which for a large video is most of the read timeout. Same null and
 * 'unavailable' as readFromR2.
 */
export async function headFromR2(
  key: string
): Promise<R2Head | null | 'unavailable'> {
  try {
    const object = await r2().send(
      new HeadObjectCommand({
        Bucket: process.env.CLOUDFLARE_BUCKETNAME!,
        Key: key,
      })
    );

    return {
      contentType: object.ContentType,
      contentLength: object.ContentLength,
      etag: object.ETag,
    };
  } catch (err) {
    if (storeFailed(err)) {
      return reportUnavailable(key, err);
    }

    return null;
  }
}
