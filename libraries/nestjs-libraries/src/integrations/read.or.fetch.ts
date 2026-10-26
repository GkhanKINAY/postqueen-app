import { existsSync, readFileSync } from 'fs';
import { resolve, sep } from 'path';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

// Media reads answer headers in well under a second and the chunk sizes the
// providers ask for finish in under two, with the slowest healthy read
// measured at about eleven, so two minutes is only ever reached by a stalled
// transfer.
export const MEDIA_READ_TIMEOUT = 120_000;

// AbortSignal.timeout rejects with a TimeoutError, which undici may surface
// directly or wrap as the cause of the fetch rejection, and axios reports as a
// canceled request.
export const isReadTimeout = (err: any) =>
  err?.name === 'TimeoutError' ||
  err?.cause?.name === 'TimeoutError' ||
  err?.code === 'ERR_CANCELED';

// A path under UPLOAD_DIRECTORY, or null. resolve() collapses any `..`, the same
// confinement the frontend's /uploads route applies.
const insideUploads = (path: string) => {
  if (!process.env.UPLOAD_DIRECTORY) {
    return null;
  }
  const base = resolve(process.env.UPLOAD_DIRECTORY);
  const file = resolve(base, path);
  return file !== base && file.startsWith(base + sep) ? file : null;
};

// This instance's own local-storage URL (FRONTEND_URL + /uploads/...) as the
// file it names on disk.
export const ownUploadPath = (url: string) => {
  const origin = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  const prefix = `${origin}/uploads/`;
  if (!origin || !url.startsWith(prefix)) {
    return null;
  }
  return insideUploads(url.slice(prefix.length).split(/[?#]/)[0]);
};

/**
 * The bytes of a media file that providers upload themselves (X, LinkedIn, and
 * image dimensions).
 *
 * The path is the one stored with the post, so it can name any host. Remote
 * URLs therefore go through the SSRF-guarded client like every other outbound
 * request, and local paths are only read inside UPLOAD_DIRECTORY.
 *
 * Our own local uploads are read from disk when the file is there. That avoids
 * a round trip to ourselves, and it keeps working when FRONTEND_URL is a
 * private address, which the guard would otherwise refuse. When the disk does
 * not have it (a worker without the volume) it is fetched like any other URL.
 *
 * A remote read that answers its headers and then stalls is abandoned after
 * MEDIA_READ_TIMEOUT and tried once more; a second stall rejects with an error
 * isReadTimeout recognises.
 */
export const readOrFetch = async (
  path: string,
  retried = false
): Promise<Buffer> => {
  if (path.indexOf('http') === 0) {
    const own = ownUploadPath(path);
    if (own && existsSync(own)) {
      return readFileSync(own);
    }

    try {
      return (
        await getSsrfSafeAxios()({
          url: path,
          method: 'GET',
          responseType: 'arraybuffer',
          // without a deadline a stalled body never settles and holds the
          // activity's worker slot until the process restarts
          signal: AbortSignal.timeout(MEDIA_READ_TIMEOUT),
        })
      ).data;
    } catch (err) {
      if (!retried && isReadTimeout(err)) {
        return readOrFetch(path, true);
      }
      throw err;
    }
  }

  const file = insideUploads(path);
  if (!file) {
    throw new Error('Refusing to read a media file outside UPLOAD_DIRECTORY');
  }
  return readFileSync(file);
};
