import { CloudflareStorage } from './cloudflare.storage';
import { IUploadProvider } from './upload.interface';
import { LocalStorage } from './local.storage';

export class UploadFactory {
  static createStorage(): IUploadProvider {
    const storageProvider = process.env.STORAGE_PROVIDER || 'local';

    switch (storageProvider) {
      case 'local':
        // Refuse rather than trust the `!`. Unset, LocalStorage builds paths
        // from the string "undefined" and `mkdirSync(..., {recursive: true})`
        // cheerfully creates `./undefined/2026/08/09` next to the process: the
        // upload reports success, a Media row is written, and every read then
        // 500s because the serving route calls `resolve(undefined)`. Silent on
        // the way in, broken on the way out. `.env.example` ships
        // STORAGE_PROVIDER="local" active with UPLOAD_DIRECTORY commented out,
        // so this is the default state of a copied env file.
        if (!process.env.UPLOAD_DIRECTORY) {
          throw new Error(
            'STORAGE_PROVIDER is "local" but UPLOAD_DIRECTORY is not set. ' +
              'Set it to a writable absolute path, or switch STORAGE_PROVIDER to "cloudflare".'
          );
        }
        return new LocalStorage(process.env.UPLOAD_DIRECTORY);
      case 'cloudflare':
        return new CloudflareStorage(
          process.env.CLOUDFLARE_ACCOUNT_ID!,
          process.env.CLOUDFLARE_ACCESS_KEY!,
          process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
          process.env.CLOUDFLARE_REGION!,
          process.env.CLOUDFLARE_BUCKETNAME!,
          process.env.CLOUDFLARE_BUCKET_URL!,
          process.env.CLOUDFLARE_JURISDICTION
        );
      default:
        throw new Error(`Invalid storage type ${storageProvider}`);
    }
  }
}
