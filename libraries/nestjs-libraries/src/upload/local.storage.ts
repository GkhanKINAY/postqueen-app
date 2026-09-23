import { IUploadProvider } from './upload.interface';
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  promises as fsp,
  renameSync,
  writeFileSync,
} from 'fs';
import { Readable } from 'stream';
import { detectUploadType } from '@gitroom/nestjs-libraries/upload/uploaded.file';
import { ownUploadPath } from '@gitroom/nestjs-libraries/integrations/read.or.fetch';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { parseDataUrl } from '@gitroom/nestjs-libraries/upload/data.url';
import { fileTypeFromBuffer } from 'file-type';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

/**
 * Stored files are served from a public directory and the filename is the only
 * thing guarding them, so it has to be unguessable.
 *
 * Both call sites built it from `Math.round(Math.random() * 16)`, which is
 * weaker than the 32 characters suggest on two counts: V8's Math.random is
 * xorshift128+, whose state can be recovered from a run of outputs, and
 * rounding rather than flooring makes 0 and f appear half as often as the other
 * fourteen digits. `makeId` is the CSPRNG-backed generator already used for API
 * keys and OAuth secrets, over a 62-character alphabet.
 */
const uploadFilename = () => makeId(32);

const LOCAL_STORAGE_ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  // Accepted only to be converted: the normalizer turns it into an mp4 and
  // the original is removed. Nothing ever serves a .mov.
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);
export class LocalStorage implements IUploadProvider {
  constructor(private uploadDirectory: string) {}

  async uploadSimple(path: string) {
    const dataUrl = path.startsWith('data:') ? parseDataUrl(path) : null;

    let body: Buffer;
    if (dataUrl) {
      body = dataUrl.buffer;
    } else {
      if (!(await isSafePublicHttpsUrl(path))) {
        throw new Error('Unsafe URL');
      }
      const loadImage = await fetch(path, {
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });
      body = Buffer.from(await loadImage.arrayBuffer());
    }

    // Never trust the claimed mime/extension (data URL header, remote
    // content-type, or URL path): sniff the real type from the bytes and
    // only accept the allow-list, otherwise an attacker could write an
    // arbitrary file (e.g. .html/.svg with embedded script) into the
    // publicly served uploads directory on the app's own origin.
    const detected = await fileTypeFromBuffer(body);
    if (!detected || !LOCAL_STORAGE_ALLOWED_MIME.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }
    const findExtension = detected.ext;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const randomName = uploadFilename();

    const filePath = `${dir}/${randomName}.${findExtension}`;
    const publicPath = `${innerPath}/${randomName}.${findExtension}`;
    // Logic to save the file to the filesystem goes here
    writeFileSync(filePath, body);

    return process.env.FRONTEND_URL + '/uploads' + publicPath;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      const detected = await detectUploadType(file);
      if (!detected || !LOCAL_STORAGE_ALLOWED_MIME.has(detected.mime)) {
        throw new Error('Unsupported file type.');
      }
      const safeExt = `.${detected.ext}`;
      const safeMime = detected.mime;

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      const innerPath = `/${year}/${month}/${day}`;
      const dir = `${this.uploadDirectory}${innerPath}`;
      mkdirSync(dir, { recursive: true });

      const randomName = uploadFilename();

      const filePath = `${dir}/${randomName}${safeExt}`;
      const publicPath = `${innerPath}/${randomName}${safeExt}`;

      if (file.buffer) {
        writeFileSync(filePath, file.buffer);
      } else {
        // A spooled upload is already on disk, so move it instead of reading it
        // back through memory — the reason it was spooled in the first place.
        // rename fails across filesystems, which is likely enough when the temp
        // dir is a tmpfs and the upload dir is a mount.
        try {
          renameSync(file.path, filePath);
        } catch {
          copyFileSync(file.path, filePath);
        }
      }

      return {
        filename: `${randomName}${safeExt}`,
        path: process.env.FRONTEND_URL + '/uploads' + publicPath,
        mimetype: safeMime,
        originalname: `${randomName}${safeExt}`,
      };
    } catch (err) {
      console.error('Error uploading file to Local Storage:', err);
      throw err;
    }
  }

  // Both take the public URL the row carries and map it back inside
  // UPLOAD_DIRECTORY, the way readOrFetch does; anything else is refused.
  async readFile(path: string): Promise<Readable> {
    const file = ownUploadPath(path);
    if (!file) {
      throw new Error('Not a file of this storage');
    }
    return createReadStream(file);
  }

  async removeFile(path: string): Promise<void> {
    const file = ownUploadPath(path);
    if (!file) {
      throw new Error('Not a file of this storage');
    }
    await fsp.rm(file, { force: true });
  }

  // The same mapping: a URL under FRONTEND_URL/uploads that stays inside
  // UPLOAD_DIRECTORY.
  isOwnFile(path: string) {
    return !!ownUploadPath(path);
  }
}
