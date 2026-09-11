import { existsSync, readFileSync } from 'fs';
import { resolve, sep } from 'path';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

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
const ownUpload = (url: string) => {
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
 */
export const readOrFetch = async (path: string) => {
  if (path.indexOf('http') === 0) {
    const own = ownUpload(path);
    if (own && existsSync(own)) {
      return readFileSync(own);
    }

    return (
      await getSsrfSafeAxios()({
        url: path,
        method: 'GET',
        responseType: 'arraybuffer',
      })
    ).data;
  }

  const file = insideUploads(path);
  if (!file) {
    throw new Error('Refusing to read a media file outside UPLOAD_DIRECTORY');
  }
  return readFileSync(file);
};
