import { timer } from '@gitroom/helpers/utils/timer';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import {
  AuthTokenDetails,
  PendingCheckResponse,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { ApplicationFailure } from '@temporalio/activity';
import { analyticsFetchNeedsReconnect } from '@gitroom/nestjs-libraries/integrations/analytics-fetch.errors';
import {
  isReadTimeout,
  MEDIA_READ_TIMEOUT,
  ownUploadSize,
  readOrFetch,
} from '@gitroom/nestjs-libraries/integrations/read.or.fetch';
import { setHeartbeatDetails } from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';
import {
  getSsrfSafeAxios,
  getSsrfSafeDispatcher,
} from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import sharp from 'sharp';
import { createReadStream, statSync } from 'fs';
import { resolve, sep } from 'path';
import { Readable } from 'stream';

export const stripQuery = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (err) {
    return url.split('?')[0];
  }
};

export type ValidityMedia = {
  path: string;
  thumbnail?: string;
  alt?: string;
};

// Temporal serializes the whole ApplicationFailure (message + details) into the
// workflow history and ships it over gRPC, which has a hard frame limit (4MB by
// default). Provider error messages/bodies can be huge (full HTML error pages,
// base64 media echoed back, stack traces), so we cap every string that goes into
// the failure to keep the history small and avoid "GRPC Message too large".
const MAX_FAILURE_MESSAGE = 2_000;
const MAX_FAILURE_FIELD = 4_000;

export function truncateForTemporal(value: any, max: number): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = typeof value === 'string' ? value : safeStringify(value);
  if (str.length <= max) {
    return str;
  }

  return `${str.slice(0, max)}… [truncated ${str.length - max} chars]`;
}

// The user reads this in the calendar and in the failure email, so it is one
// short line with nothing in it that could be a credential: query strings,
// auth headers, and long token-shaped runs are dropped.
const MAX_PLATFORM_MESSAGE = 280;

function cleanPlatformMessage(text: string) {
  const line = text
    .trim()
    .split(/\r?\n/)[0]
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/[^\s"'<>]+/g, (url) => stripQuery(url))
    .replace(/\b(Bearer|Basic)\s+\S+/gi, '[hidden]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[hidden]')
    .replace(/\s+/g, ' ')
    .trim();

  return line.length > MAX_PLATFORM_MESSAGE
    ? `${line.slice(0, MAX_PLATFORM_MESSAGE - 1).trimEnd()}…`
    : line;
}

// A bare code like "invalid_request" or "PERMISSION_DENIED" tells the user
// nothing, so the status fallback reads better than echoing it.
const readable = (text: string) => {
  const rest = text.replace(/\[hidden\]/g, '').trim();
  return !!rest && !/^[a-z0-9_.]+$/i.test(rest);
};

/**
 * The reason a platform gave when it refused a request, cleaned up to show
 * the user, or '' when it gave none. JSON bodies only: an HTML error page or
 * a proxy's plain-text reply is not a reason anyone can act on.
 */
export function platformMessage(body: unknown): string {
  let parsed: any = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      return '';
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return '';
  }

  const text = (value: unknown) =>
    typeof value === 'string' ? cleanPlatformMessage(value) : '';

  // JSON:API errors (Tumblr's, for one) put the reason in `detail`.
  const errors = Array.isArray(parsed.errors)
    ? parsed.errors
        .map((e: any) => [text(e?.message), text(e?.detail)].find(readable))
        .filter(Boolean)
        .slice(0, 3)
        .join(' ')
    : '';

  return (
    [
      text(parsed.error_description),
      text(parsed.error?.message),
      errors,
      text(parsed.message),
      text(parsed.detail),
      text(parsed.error),
    ].find(readable) || ''
  );
}

// PostQueen's own failure lines, not a network's answer: the failure notice
// must not present them as "<network> said".
export const MEDIA_READ_FAILED =
  'We could not read the media for this post, so it was not published. Attach the media again, then schedule the post.';
export const MEDIA_READ_SLOW =
  'We could not read the media for this post in time, so it was not published. Try again in a few minutes.';
export const MEDIA_NOT_FOUND =
  'The media file for this post was not found, so it was not published. Attach the media again, then schedule the post.';
export const MEDIA_SIZE_UNKNOWN =
  'Could not determine the media size for upload';
export const REQUEST_NOT_COMPLETED =
  'PostQueen could not complete the request to the network, so the post was not published. Try again in a few minutes.';
export const OWN_FAILURE_MESSAGES = [
  MEDIA_READ_FAILED,
  MEDIA_READ_SLOW,
  MEDIA_NOT_FOUND,
  MEDIA_SIZE_UNKNOWN,
  REQUEST_NOT_COMPLETED,
];

/** What the user is told when the platform gave no reason of its own. */
export function statusMessage(status: number): string {
  // No HTTP answer at all: a dropped connection, or a step on PostQueen's
  // side such as reading an image, failed before the network replied.
  if (!status) {
    return REQUEST_NOT_COMPLETED;
  }
  if (status === 429) {
    return 'The network is limiting how many requests PostQueen can send, so the post was not published. Try again later.';
  }
  if (status >= 500) {
    return 'The network had a problem on its side, so the post was not published. Try again in a few minutes.';
  }
  if (status === 403) {
    return 'The network refused the post. Check that the connected account is still allowed to post there.';
  }
  if (status === 404) {
    return 'The network could not find where to publish. Check the post settings, or reconnect the channel in Channels.';
  }
  return 'The network refused the post without giving a reason. Check the text, media and settings, then try again.';
}

export class RefreshToken extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(
      truncateForTemporal(message, MAX_FAILURE_MESSAGE),
      'refresh_token',
      true,
      [
        {
          identifier,
          json: truncateForTemporal(json, MAX_FAILURE_FIELD),
          body: truncateForTemporal(body, MAX_FAILURE_FIELD),
        },
      ]
    );
  }
}

// A `disconnect` error means the platform will keep rejecting this channel no
// matter how many times the token is refreshed (e.g. TikTok's daily active
// user cap): the channel must be disconnected so the user re-connects it,
// possibly through another provider (see MIGRATE_PROVIDERS).
export class Disconnect extends ApplicationFailure {
  constructor(identifier: string, json: string, body: BodyInit, message = '') {
    super(
      truncateForTemporal(message, MAX_FAILURE_MESSAGE),
      'disconnect',
      true,
      [
        {
          identifier,
          json: truncateForTemporal(json, MAX_FAILURE_FIELD),
          body: truncateForTemporal(body, MAX_FAILURE_FIELD),
        },
      ]
    );
  }
}

// The platform already accepted the post (it is live) but a follow-up mutation
// on it failed (e.g. YouTube rejected the thumbnail after the upload): the post
// still ends in ERROR, yet its platform id / URL must survive so the user can
// reach the live post instead of re-publishing it. The post activity records
// them and rethrows as BadBody, like Disconnect.
export class PublishedWithError extends ApplicationFailure {
  constructor(
    identifier: string,
    public readonly postDbId: string,
    public readonly releaseId: string,
    public readonly releaseURL: string,
    message = ''
  ) {
    super(
      truncateForTemporal(message, MAX_FAILURE_MESSAGE),
      'published_with_error',
      true,
      [{ identifier, postDbId, releaseId, releaseURL }]
    );
  }
}

// What a media store answered when a ranged read did not come back as 206,
// for the failure's details.
export function rangeReadFailure(response: {
  status: number;
  statusText: string;
  ok: boolean;
}) {
  return JSON.stringify({
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
  });
}

// `unmapped` marks a refusal no handleErrors mapping explained, so the admin
// stats can still count the failures that once read "Unknown Error".
export class BadBody extends ApplicationFailure {
  constructor(
    identifier: string,
    json: string,
    body: BodyInit,
    message = '',
    unmapped = false
  ) {
    super(truncateForTemporal(message, MAX_FAILURE_MESSAGE), 'bad_body', true, [
      {
        identifier,
        json: truncateForTemporal(json, MAX_FAILURE_FIELD),
        body: truncateForTemporal(body, MAX_FAILURE_FIELD),
        ...(unmapped ? { unmapped: true } : {}),
      },
    ]);
  }
}

// Why no answer is ever coming, or '' when asking again may get one: fetch
// rejects with "fetch failed" and the reason as its cause. The SSRF guard
// refuses the address with "Blocked IP"; ENOTFOUND is a host name that does
// not exist.
const unreachable = (err: any): string =>
  err?.cause?.message === 'Blocked IP'
    ? 'Blocked IP'
    : err?.cause?.code === 'ENOTFOUND'
    ? 'ENOTFOUND'
    : '';

// The store could not answer this time: throttled (429), failing on its own
// side (5xx), or no answer at all (0). Our own uploads route answers 503 with
// Retry-After: 5 when its store times out or is throttled, so a media read
// waits that long and asks once more, the way readOrFetch and mediaChunk read
// a stalled file once more.
export const mediaStoreBusy = (status: number) =>
  !status || status === 429 || status >= 500;

// The post's failure line for a media read that did not come back. Each is
// final: a store still busy after the second ask fails the post with
// MEDIA_READ_SLOW rather than a retryable error, because the workflow would
// publish again at once, and when that ran out it would tell the user the
// post may already be live although nothing was sent.
const mediaReadFailure = (status: number) =>
  status === 404 || status === 410
    ? MEDIA_NOT_FOUND
    : mediaStoreBusy(status)
    ? MEDIA_READ_SLOW
    : MEDIA_READ_FAILED;

// A media file asked for with the SSRF-safe dispatcher, since the path is
// user-influenced, and identity encoding, so content-length matches the bytes
// a GET streams (fetch transparently decompresses encoded bodies). Resolves
// with a 2xx answer only:
// - a store that could not answer is asked once more (see mediaStoreBusy);
// - no answer because none can come (see unreachable) fails the post at once;
// - anything else fails it with the line that fits (see mediaReadFailure).
async function requestMedia(
  path: string,
  identifier: string,
  method: 'HEAD' | 'GET',
  retried = false
): Promise<Response> {
  let response: Response | undefined;
  try {
    response = await fetch(path, {
      method,
      headers: { 'accept-encoding': 'identity' },
      dispatcher: getSsrfSafeDispatcher(),
      // A HEAD that never answers counts as no answer, rather than holding the
      // activity until undici gives up on its own after five minutes. A GET
      // gets none: its body is streamed into the upload for as long as that
      // takes.
      ...(method === 'HEAD'
        ? { signal: AbortSignal.timeout(MEDIA_READ_TIMEOUT) }
        : {}),
    } as any);
  } catch (err) {
    const reason = unreachable(err);
    if (reason) {
      throw new BadBody(
        identifier,
        JSON.stringify({ path: stripQuery(path), reason }),
        '{}',
        MEDIA_READ_FAILED
      );
    }
    // no answer at all, `response` stays undefined
  }

  if (response?.ok) {
    return response;
  }

  await response?.body?.cancel().catch(() => {});
  const status = response?.status || 0;
  if (mediaStoreBusy(status) && !retried) {
    await timer(5000);
    return requestMedia(path, identifier, method, true);
  }

  throw new BadBody(
    identifier,
    JSON.stringify({ status, path: stripQuery(path) }),
    '{}',
    mediaReadFailure(status)
  );
}

/**
 * The size and type of a remote media file, from a HEAD, for the providers
 * that declare an upload's length before they stream it. A HEAD answers with
 * no length for our own local uploads when Next serves them, so their size is
 * read from disk instead (see ownUploadSize). Nothing has been sent to the
 * network yet when this runs. A refused HEAD fails the post as requestMedia
 * says; a 2xx without a usable length fails it with `unknownSize`, the
 * caller's own message.
 */
export async function mediaHead(
  path: string,
  identifier: string,
  unknownSize = MEDIA_SIZE_UNKNOWN
): Promise<{ size: number; type: string | null }> {
  const head = await requestMedia(path, identifier, 'HEAD');

  // A zero/NaN size would poison chunk-count math downstream.
  const size =
    ownUploadSize(path) || Number(head.headers.get('content-length'));
  if (!Number.isFinite(size) || size <= 0) {
    throw new BadBody(identifier, '{}', '{}', unknownSize);
  }

  return { size, type: head.headers.get('content-type') };
}

/**
 * The body of a remote media file, for the providers that stream it straight
 * into the network's upload instead of holding it in memory. Fails the post
 * as requestMedia says.
 */
export async function mediaGet(
  path: string,
  identifier: string
): Promise<ReadableStream<Uint8Array>> {
  const response = await requestMedia(path, identifier, 'GET');
  if (!response.body) {
    throw new BadBody(
      identifier,
      JSON.stringify({ status: response.status, path: stripQuery(path) }),
      '{}',
      MEDIA_READ_FAILED
    );
  }
  return response.body;
}

export class NotEnoughScopes {
  constructor(
    public message = 'Not enough scopes, when choosing a provider, please add all the scopes'
  ) {}
}

function safeStringify(obj: any) {
  const seen = new WeakSet();

  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

export abstract class SocialAbstract {
  abstract identifier: string;
  maxConcurrentJob = 1;

  public handleErrors(
    body: string,
    status: number
  ):
    | {
        type: 'refresh-token' | 'bad-body' | 'retry' | 'disconnect';
        value: string;
      }
    | undefined {
    return undefined;
  }

  /**
   * Analytics used to swallow every provider failure as `[]`, so a revoked
   * token and a quiet week were the same empty pane. Call this on the raw body
   * (or the thrown error) before treating an empty series as "no activity".
   * Auth, missing-scope and token errors throw RefreshToken so the analytics
   * endpoint can tell the frontend to reconnect rather than show an empty
   * period.
   */
  protected throwIfCannotFetch(errOrBody: unknown, status?: number): void {
    if (errOrBody == null) {
      return;
    }

    const thrown =
      errOrBody && typeof errOrBody === 'object'
        ? (errOrBody as Record<string, any>)
        : undefined;
    const response = thrown?.response;
    const httpStatus: number | undefined =
      status ??
      (typeof response?.status === 'number' ? response.status : undefined) ??
      (typeof thrown?.code === 'number' &&
      thrown.code >= 400 &&
      thrown.code < 600
        ? thrown.code
        : undefined) ??
      (typeof thrown?.status === 'number' &&
      thrown.status >= 400 &&
      thrown.status < 600
        ? thrown.status
        : undefined);

    const body =
      response?.data ??
      (httpStatus !== undefined && thrown?.data !== undefined
        ? thrown.data
        : errOrBody);

    let json = typeof body === 'string' ? body : safeStringify(body ?? {});
    if ((!json || json === '{}') && errOrBody instanceof Error) {
      json = errOrBody.message || '{}';
    }

    const envelope =
      typeof body === 'object' && body !== null ? (body as Record<string, any>) : thrown;
    const graphError = envelope?.error;
    const graphMessage = String(
      graphError?.message || (typeof graphError === 'string' ? graphError : '')
    );

    const handleError = this.handleErrors(json, httpStatus ?? 200);

    if (handleError?.type === 'disconnect') {
      throw new Disconnect(this.identifier, json, '{}', handleError.value);
    }

    if (
      analyticsFetchNeedsReconnect({
        json,
        httpStatus,
        handleErrorType: handleError?.type,
        graphError,
      })
    ) {
      throw new RefreshToken(
        this.identifier,
        json,
        '{}',
        handleError?.value || graphMessage
      );
    }
  }

  /**
   * When a provider is migrated to another one (MIGRATE_PROVIDERS env), the two
   * apps return different app-scoped ids, so a reconnect is matched to the
   * existing channel by profile instead. Override when a provider pair needs a
   * different matching rule.
   */
  public migrationMatch(
    auth: Pick<AuthTokenDetails, 'id' | 'username'>,
    integration: Integration
  ): boolean {
    return !!auth.username && auth.username === integration.profile;
  }

  /**
   * Server-side replacement for the old client-side `checkValidity`.
   * Validates the media attached to a post (and its comments) against the
   * provider rules. Returns `true` when valid, or an error message string.
   *
   * `posts` mirrors the client shape: the outer array is the main post followed
   * by each comment, the inner array is the media items for that entry.
   * `texts` has the same order and holds each entry's text as `post` /
   * `comment` will receive it in `message`, for rules a platform applies to
   * the words rather than the files: hashtag and link counts, byte lengths, a
   * shorter limit once media is attached.
   *
   * Note: video-duration validations that used to run in the browser are not
   * re-implemented here (no ffmpeg dependency). Image-dimension checks use sharp.
   */
  async checkValidity(
    posts: Array<ValidityMedia[]>,
    settings: any,
    additionalSettings: any[],
    texts: string[] = []
  ): Promise<string | true> {
    return true;
  }

  /**
   * Providers that return a `pending` PostResponse from `post` / `comment` must
   * override this with a single, read-only status check (no loops, no timers) -
   * the polling loop lives in the post workflow, where a retry is harmless.
   *
   * The defaults throw so a provider that returns `pending` without overriding
   * fails loudly on the first test post instead of silently completing with a
   * bogus releaseURL. They are unreachable for providers that never return
   * `pending`.
   */
  public async checkPostStatus(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    throw new BadBody(
      this.identifier,
      '{}',
      '{}',
      'checkPostStatus is not implemented for this provider'
    );
  }

  /** Runs the mutations left after `checkPostStatus` returns `ready`. Same contract as `checkPostStatus`. */
  public async finalizePost(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    throw new BadBody(
      this.identifier,
      '{}',
      '{}',
      'finalizePost is not implemented for this provider'
    );
  }

  // axios flavor of the SSRF-safe dispatcher that `this.fetch` applies - for
  // providers that need axios (form-data / stream uploads). Never call plain
  // axios with a user-influenced URL.
  protected getSsrfSafeAxios() {
    return getSsrfSafeAxios();
  }

  protected assetBoolean(value: boolean | string) {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value || false;
  }

  /**
   * Reads the pixel dimensions of an image via sharp (works for http or local
   * paths). They are the stored ones: an EXIF `orientation` of 5 or more means
   * the image shows rotated a quarter turn, with width and height swapped.
   */
  protected async getImageDimensions(
    path: string
  ): Promise<{ width: number; height: number; orientation?: number }> {
    // Stored media paths are relative (e.g. "uploads/x.png"); resolve them to a
    // fetchable URL the same way posts.service.updateMedia does.
    const url =
      path?.indexOf('http') === -1
        ? `${process.env.FRONTEND_URL}/${path}`
        : path;
    setHeartbeatDetails(`read media ${stripQuery(url)}`);
    const {
      width = 0,
      height = 0,
      orientation,
    } = await sharp(await this.readOrFetch(url)).metadata();
    return { width, height, orientation };
  }

  // Reads the whole media into memory (images the providers hand to sharp).
  // A read that stalls twice fails the post with BadBody rather than a
  // retryable error: repeating the publish would re-read the same media and
  // re-upload what was already sent while holding the provider's queue slot.
  // So does a media host that refuses the file (4xx): reading it again gets
  // the same answer, and its 401 is not the network asking for a reconnect.
  protected async readOrFetch(path: string): Promise<Buffer> {
    try {
      return await readOrFetch(
        path.indexOf('http') === 0 ? path : this.localMediaPath(path)
      );
    } catch (err: any) {
      const status = Number(err?.response?.status);
      if (status >= 400 && status < 500) {
        throw new BadBody(
          '',
          JSON.stringify({ status, path: stripQuery(path) }),
          Buffer.from('{}'),
          MEDIA_READ_FAILED
        );
      }
      if (!isReadTimeout(err)) {
        throw err;
      }
      throw new BadBody(
        '',
        JSON.stringify({ timeoutMs: MEDIA_READ_TIMEOUT, path: stripQuery(path) }),
        Buffer.from('{}'),
        MEDIA_READ_SLOW
      );
    }
  }

  // Resolves the total byte size of the media without loading it into memory:
  // a HEAD request for remote URLs (see mediaHead), statSync for local files
  // and for our own local uploads (see ownUploadSize).
  protected async mediaSize(
    path: string,
    identifier = '',
    unknownSize = MEDIA_SIZE_UNKNOWN
  ): Promise<number> {
    if (path.indexOf('http') === 0) {
      const own = ownUploadSize(path);
      if (own) {
        return own;
      }

      setHeartbeatDetails(`media size ${stripQuery(path)}`);
      return (await mediaHead(path, identifier, unknownSize)).size;
    }

    return statSync(this.localMediaPath(path, identifier)).size;
  }

  // Media that is not a remote URL is read from this worker's disk. The stored
  // path is user-influenced, so only a file inside UPLOAD_DIRECTORY is ever
  // opened. The path is the one updateMedia built, UPLOAD_DIRECTORY in front,
  // so it is resolved the way it is opened, from the working directory;
  // resolve() collapses any `..` first. A path outside the directory fails the
  // post for good: reading it again would be refused again.
  protected localMediaPath(path: string, identifier = '') {
    const base = process.env.UPLOAD_DIRECTORY
      ? resolve(process.env.UPLOAD_DIRECTORY)
      : '';
    const file = resolve(path);
    if (!base || !file.startsWith(base + sep)) {
      throw new BadBody(
        identifier,
        JSON.stringify({ path: stripQuery(path) }),
        Buffer.from('{}'),
        MEDIA_READ_FAILED
      );
    }
    return file;
  }

  // Reads a single [start, end] byte range into memory. Used by providers whose
  // chunked-upload APIs require a Buffer per segment: only one small chunk is
  // resident at a time, never the whole file.
  protected async mediaChunk(
    path: string,
    start: number,
    end: number,
    identifier = '',
    retried = false
  ): Promise<Buffer> {
    if (path.indexOf('http') === 0) {
      setHeartbeatDetails(
        `media chunk ${start}-${end} ${stripQuery(path)}`
      );
      try {
        const response = await fetch(path, {
          headers: {
            Range: `bytes=${start}-${end}`,
            'accept-encoding': 'identity',
          },
          dispatcher: getSsrfSafeDispatcher(),
          // The store can answer the headers and then stop mid-body. Without a
          // deadline that read never settles and the activity keeps its worker
          // slot until the process restarts: a startToCloseTimeout fails the
          // activity on the server but does not stop this function.
          signal: AbortSignal.timeout(MEDIA_READ_TIMEOUT),
        } as any);
        // Anything but 206 means the server ignored the Range header: buffering
        // response.body here would silently load the whole file into memory and
        // upload corrupted chunks.
        if (response.status !== 206) {
          await response.body?.cancel().catch(() => {});
          // the store could not answer this time: ask once more after the
          // wait its Retry-After names (see mediaStoreBusy)
          if (mediaStoreBusy(response.status) && !retried) {
            await timer(5000);
            return this.mediaChunk(path, start, end, identifier, true);
          }
          throw new BadBody(
            identifier,
            JSON.stringify({ status: response.status, start, end }),
            Buffer.from('{}'),
            mediaReadFailure(response.status)
          );
        }
        return Buffer.from(await response.arrayBuffer());
      } catch (err) {
        if (!isReadTimeout(err)) {
          throw err;
        }

        // A stall is transient and nothing has been sent to the platform for
        // this range yet, so read it once more before giving up.
        if (!retried) {
          return this.mediaChunk(path, start, end, identifier, true);
        }

        // BadBody rather than a retryable error, as in readOrFetch above. The
        // message is what the user is shown.
        throw new BadBody(
          identifier,
          JSON.stringify({ timeoutMs: MEDIA_READ_TIMEOUT, start, end }),
          Buffer.from('{}'),
          MEDIA_READ_SLOW
        );
      }
    }

    const file = this.localMediaPath(path, identifier);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      createReadStream(file, { start, end })
        .on('data', (chunk) => chunks.push(chunk as Buffer))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  }

  // Opens the media as a Node stream. The media path is user-influenced, so
  // remote URLs go through the same SSRF-safe dispatcher as every other
  // outbound request - never fetch these with plain axios/fetch.
  protected async mediaStream(
    path: string,
    identifier = ''
  ): Promise<Readable> {
    if (path.indexOf('http') !== 0) {
      return createReadStream(this.localMediaPath(path, identifier));
    }

    // identity encoding (see requestMedia) so the streamed byte count matches
    // the size mediaSize reported - a decompressed body would overflow any
    // declared length.
    return Readable.fromWeb((await mediaGet(path, identifier)) as any);
  }

  // Streamed request bodies can't be replayed by this.fetch's retry, so
  // providers wrap streamed uploads in a factory that rebuilds the request
  // (re-opening its source streams) on every attempt. Errors carrying a
  // `response` (axios errors, or a thrown { response: { status, data } })
  // go through the same retry and handleErrors classification rules as
  // this.fetch; anything else is rethrown untouched so Temporal keeps its
  // usual retry behavior.
  protected async runStreamedUpload<T>(
    func: () => Promise<T>,
    identifier = '',
    totalRetries = 0
  ): Promise<T> {
    try {
      return await func();
    } catch (err: any) {
      if (!err?.response) {
        throw err;
      }

      const status = err.response.status || 500;
      const data = err.response.data;
      // '|| {}' / "|| '{}'" match this.fetch, which never hands handleErrors
      // an empty string.
      const json =
        (typeof data === 'string' ? data : safeStringify(data || {})) || '{}';
      const handleError = this.handleErrors(json, status);

      if (
        totalRetries <= 2 &&
        (status === 429 ||
          (status === 500 && !handleError) ||
          handleError?.type === 'retry' ||
          (!handleError && /rate[ _-]?limit/i.test(json)))
      ) {
        await timer(5000);
        return this.runStreamedUpload(func, identifier, totalRetries + 1);
      }

      if (handleError?.type === 'disconnect') {
        throw new Disconnect(identifier, json, '{}', handleError?.value);
      }

      if (
        (status === 401 &&
          (handleError?.type === 'refresh-token' || !handleError)) ||
        handleError?.type === 'refresh-token'
      ) {
        throw new RefreshToken(identifier, json, '{}', handleError?.value);
      }

      throw new BadBody(
        identifier,
        json,
        '{}',
        handleError?.value || this.failureMessage(json, status),
        !handleError?.value
      );
    }
  }

  // What the user is told when no handleErrors mapping explains a refusal:
  // the platform's own reason, or what the status means. Not prefixed with
  // the network's name: the failure notice already reads "<network> said: ...",
  // the same as for a mapped message.
  protected failureMessage(body: unknown, status: number) {
    return platformMessage(body) || statusMessage(status);
  }

  public async mention(
    token: string,
    d: { query: string },
    id: string,
    integration: Integration
  ): Promise<
    | { id: string; label: string; image: string; doNotCache?: boolean }[]
    | { none: true }
  > {
    return { none: true };
  }

  async runInConcurrent<T>(
    func: (...args: any[]) => Promise<T>,
    ignoreConcurrency?: boolean
  ) {
    let globalErr = {};
    let value: any;
    try {
      value = await func();
    } catch (err: any) {
      // Already classified, by this.fetch or readOrFetch inside func.
      // Rewrapping it as BadBody lost both its message and its type, so a
      // token that only needed a refresh failed the post.
      if (err instanceof ApplicationFailure) {
        throw err;
      }

      const handle = this.handleErrors(safeStringify(err), 200);
      // SDK errors keep the platform's reply on `data` (twitter-api-v2) or
      // `response.data` (axios, gaxios)
      const status =
        Number(err?.response?.status || err?.code || err?.status) || 0;
      value = {
        err: true,
        unmapped: !handle?.value,
        ...(handle || {}),
        value:
          handle?.value ||
          this.failureMessage(err?.data ?? err?.response?.data, status),
      };
      globalErr = err;
    }

    if (value && value?.err && value?.value) {
      if (value.type === 'refresh-token') {
        throw new RefreshToken(
          '',
          safeStringify({}),
          {} as any,
          value.value || ''
        );
      }
      if (value.type === 'disconnect') {
        throw new Disconnect(
          '',
          safeStringify(globalErr),
          {} as any,
          value.value || ''
        );
      }
      throw new BadBody(
        '',
        safeStringify(globalErr),
        {} as any,
        value.value || '',
        value.unmapped
      );
    }

    return value;
  }

  async fetch(
    url: string,
    options: RequestInit = {},
    identifier = '',
    totalRetries = 0,
    ignoreConcurrency = false,
    message = ''
  ): Promise<Response> {
    // A platform that accepts the connection and then goes silent leaves the
    // activity with nothing logged until startToCloseTimeout. Record the call
    // first so the timeout failure names it. Query string is dropped - some
    // providers carry access_token there and details are stored by Temporal.
    setHeartbeatDetails(`fetch ${stripQuery(url)}`);

    const request = await fetch(url, {
      ...options,
      // @ts-ignore - undici-only option, not in the lib.dom RequestInit type
      dispatcher: (options as any).dispatcher ?? getSsrfSafeDispatcher(),
    });

    if (request.status === 200 || request.status === 201) {
      return request;
    }

    let json = '{}';
    try {
      json = await request.text();
    } catch (err) {
      json = '{}';
    }

    const handleError = this.handleErrors(json || '{}', request.status);

    // Once the retries are spent, the last response is classified like any
    // other: a mapped reason, a 401 or a disconnect on the final attempt
    // used to surface as "Unknown Error". A mapped refresh or disconnect
    // also wins over a body that merely mentions a rate limit.
    if (
      totalRetries <= 2 &&
      (request.status === 429 ||
        (request.status === 500 && !handleError) ||
        handleError?.type === 'retry' ||
        (!handleError && /rate[ _-]?limit/i.test(json)))
    ) {
      await timer(5000);
      return this.fetch(
        url,
        options,
        identifier,
        totalRetries + 1,
        ignoreConcurrency,
        handleError?.value || message
      );
    }

    if (handleError?.type === 'disconnect') {
      throw new Disconnect(
        identifier,
        json,
        options.body!,
        handleError?.value
      );
    }

    if (
      (request.status === 401 &&
        (handleError?.type === 'refresh-token' || !handleError)) ||
      handleError?.type === 'refresh-token'
    ) {
      throw new RefreshToken(
        identifier,
        json,
        options.body!,
        handleError?.value
      );
    }

    // `message` is the reason an earlier attempt was retried for
    throw new BadBody(
      identifier,
      json,
      options.body!,
      handleError?.value ||
        message ||
        this.failureMessage(json, request.status),
      !handleError?.value && !message
    );
  }

  checkScopes(required: string[], got: string | string[]) {
    if (Array.isArray(got)) {
      if (!required.every((scope) => got.includes(scope))) {
        throw new NotEnoughScopes();
      }

      return true;
    }

    const newGot = decodeURIComponent(got);

    const splitType = newGot.indexOf(',') > -1 ? ',' : ' ';
    const gotArray = newGot.split(splitType);
    if (!required.every((scope) => gotArray.includes(scope))) {
      throw new NotEnoughScopes();
    }

    return true;
  }
}
