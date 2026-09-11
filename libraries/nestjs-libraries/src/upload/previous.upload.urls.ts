import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'fs';
import { resolve, sep } from 'path';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const normalize = (url: string) => url.trim().replace(/\/+$/, '');

/**
 * Moves local uploads to a new FRONTEND_URL.
 *
 * Local storage saves each file's full URL — FRONTEND_URL + /uploads/... — and
 * that URL is copied on into posts, drafts and channel avatars. Change
 * FRONTEND_URL (a new domain, http to https, another port) and every one of
 * them still points at the old address, although the file is still on disk and
 * the new address serves it. Posts carrying it then fail to publish, because
 * the networks fetch media by URL.
 *
 * PREVIOUS_FRONTEND_URLS names the addresses the instance used to run under.
 * On boot, each one's `/uploads/` prefix is replaced by the current
 * FRONTEND_URL's in every column such a URL is stored in. Only that prefix is
 * replaced, so an ordinary link to the old site is left alone, and Cloudflare
 * R2 URLs never match. Once rewritten nothing matches any more, so leaving the
 * variable set costs a scan per boot and nothing else.
 *
 * Before touching anything it checks that the old URLs really are this
 * instance's files: at least one of the newest has to exist under
 * UPLOAD_DIRECTORY. When none does (the volume is mounted somewhere else, the
 * address has a typo) rewriting would only trade one broken URL for another, so
 * that address is logged and skipped.
 *
 * Never fails the boot. A failure is logged and the app starts exactly as it
 * would have without the variable.
 */
@Injectable()
export class PreviousUploadUrls implements OnModuleInit {
  constructor(private _prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const previous = (process.env.PREVIOUS_FRONTEND_URLS || '')
      .split(',')
      .map(normalize)
      .filter(Boolean);

    if (!previous.length) {
      return;
    }

    try {
      await this.move(previous);
    } catch (err) {
      console.error(
        '[uploads] could not move stored upload URLs to FRONTEND_URL; they are unchanged',
        err
      );
    }
  }

  private async move(previous: string[]) {
    const current = normalize(process.env.FRONTEND_URL || '');
    const directory = process.env.UPLOAD_DIRECTORY;
    if (!current || !directory) {
      console.warn(
        '[uploads] PREVIOUS_FRONTEND_URLS is set but FRONTEND_URL or UPLOAD_DIRECTORY is not; nothing moved'
      );
      return;
    }

    const base = resolve(directory);
    const to = `${current}/uploads/`;

    for (const old of previous) {
      const from = `${old}/uploads/`;

      // An address without a scheme could sit inside the new one ("a.com" in
      // "https://a.com"), and then every boot would rewrite the rewritten URLs
      // again, one more prefix each time.
      if (!/^https?:\/\/[^/]+/.test(old) || to.includes(from)) {
        if (old !== current) {
          console.warn(
            `[uploads] skipped "${old}": give the full address it ran under, for example https://old.example.com`
          );
        }
        continue;
      }

      const samples = await this.newest(from);
      if (!samples.length) {
        console.log(`[uploads] nothing is stored under ${from}`);
        continue;
      }

      if (!samples.some((url) => this.existsOnDisk(url, from, base))) {
        console.warn(
          `[uploads] skipped ${old}: none of its newest files exist under ${base}. Check that the uploads volume is mounted there.`
        );
        continue;
      }

      const [path, thumbnail, image, settings, picture, content] =
        await this.rewrite(from, to);

      console.log(
        `[uploads] moved ${old} to ${current}: Media.path ${path}, Media.thumbnail ${thumbnail}, Post.image ${image}, Post.settings ${settings}, Integration.picture ${picture}, Sets.content ${content}`
      );
    }
  }

  // The newest URLs stored under the old address: media library first, channel
  // avatars too, since an instance can have avatars and no media.
  private async newest(from: string) {
    const media = await this._prisma.$queryRaw<{ url: string }[]>`
      SELECT "path" AS url FROM "Media"
      WHERE strpos("path", ${from}) = 1
      ORDER BY "createdAt" DESC LIMIT 5`;
    const avatars = await this._prisma.$queryRaw<{ url: string }[]>`
      SELECT "picture" AS url FROM "Integration"
      WHERE strpos("picture", ${from}) = 1
      ORDER BY "updatedAt" DESC NULLS LAST LIMIT 5`;
    return [...media, ...avatars].map((row) => row.url);
  }

  // Confined to UPLOAD_DIRECTORY the same way the frontend's /uploads route
  // is: resolve() collapses any `..`, so a stored URL cannot point outside it.
  private existsOnDisk(url: string, from: string, base: string) {
    const relative = url.slice(from.length).split(/[?#]/)[0];
    const file = resolve(base, relative);
    if (file === base || !file.startsWith(base + sep)) {
      return false;
    }
    return existsSync(file);
  }

  // Every column a local upload URL is stored in. Post.image, Post.settings and
  // Sets.content are JSON text; JSON.stringify leaves `/` unescaped, so the
  // URLs appear in them verbatim and a text replace is exact.
  private rewrite(from: string, to: string) {
    const db = this._prisma;
    return db.$transaction([
      db.$executeRaw`UPDATE "Media" SET "path" = replace("path", ${from}, ${to}) WHERE strpos("path", ${from}) > 0`,
      db.$executeRaw`UPDATE "Media" SET "thumbnail" = replace("thumbnail", ${from}, ${to}) WHERE strpos("thumbnail", ${from}) > 0`,
      db.$executeRaw`UPDATE "Post" SET "image" = replace("image", ${from}, ${to}) WHERE strpos("image", ${from}) > 0`,
      db.$executeRaw`UPDATE "Post" SET "settings" = replace("settings", ${from}, ${to}) WHERE strpos("settings", ${from}) > 0`,
      db.$executeRaw`UPDATE "Integration" SET "picture" = replace("picture", ${from}, ${to}) WHERE strpos("picture", ${from}) > 0`,
      db.$executeRaw`UPDATE "Sets" SET "content" = replace("content", ${from}, ${to}) WHERE strpos("content", ${from}) > 0`,
    ]);
  }
}

@Module({
  providers: [PreviousUploadUrls],
})
export class PreviousUploadUrlsModule {}
