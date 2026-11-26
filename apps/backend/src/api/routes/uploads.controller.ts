import { Controller, Get, Head, Headers, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  headFromR2,
  R2Head,
  readFromR2,
} from '@gitroom/nestjs-libraries/upload/r2.reader';

/**
 * Serves media from our own domain rather than from the storage bucket.
 *
 * Deliberately unauthenticated, and registered outside `authenticatedController`
 * for that reason: these URLs are handed to Instagram, TikTok and the rest,
 * whose servers fetch them with no session. What it does not do is let anyone
 * roam the bucket — storage only ever emits keys shaped like "aB3xY9pQr7.png",
 * and anything else is refused before a request is made.
 *
 * Only used with `STORAGE_PROVIDER=cloudflare`. Local storage already serves its
 * own files through the frontend.
 */
@ApiTags('Media')
@Controller('/uploads')
export class UploadsController {
  // Keys as produced by CloudflareStorage: makeId(10) plus an extension. No
  // slashes, no traversal, no query — nothing that could address another object.
  //
  // The extension is part of the check, not decoration. An install may keep
  // more than media in its bucket — backups, exports, anything — and this
  // endpoint is public by necessity. Without the suffix list it would happily
  // hand back a `.sql` sitting next to the images, and the only thing standing
  // in the way would be nobody knowing its name. The list mirrors the types
  // CloudflareStorage will actually store.
  private static readonly KEY =
    /^[A-Za-z0-9_-]{1,120}\.(jpe?g|png|gif|webp|avif|bmp|tiff?|mp4|mp3|m4a|wav|ogg)$/i;

  private servable(key: string) {
    return (
      process.env.STORAGE_PROVIDER === 'cloudflare' &&
      UploadsController.KEY.test(key)
    );
  }

  // The store could not be asked, which says nothing about the object. A 404
  // here was read as "the file is gone" by the networks fetching it and by our
  // own size reads, which then failed the post for good. A 503 tells them to
  // come back, and must not be cached in place of the file.
  private answerUnavailable(res: Response) {
    res.setHeader('Retry-After', '5');
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).end();
  }

  // The headers a GET and a HEAD of the same object share. Returns false when
  // they already answered the request: a 304 for a client that has this one.
  private writeHeaders(res: Response, object: R2Head, ifNoneMatch?: string) {
    // Stored objects are immutable — every upload gets a fresh random name and
    // nothing ever overwrites one — so this can be cached hard. It is what
    // keeps a social network re-fetching the same image from costing us a read
    // every time.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (object.etag) {
      res.setHeader('ETag', object.etag);

      if (ifNoneMatch === object.etag) {
        res.status(304).end();
        return false;
      }
    }

    res.setHeader(
      'Content-Type',
      object.contentType || 'application/octet-stream'
    );
    // Same hardening the image's nginx applies to locally served uploads: never
    // let the browser second-guess the type, and make sure that whatever comes
    // back cannot execute if it somehow is not what it claims to be.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'none'; script-src 'none'; frame-ancestors 'none'; sandbox"
    );
    if (object.contentLength) {
      res.setHeader('Content-Length', String(object.contentLength));
    }

    // Advertised even on a whole-object response, so a client knows it may ask
    // for a part next time instead of pulling the file again to seek in it.
    res.setHeader('Accept-Ranges', 'bytes');
    return true;
  }

  // Before the GET, and it has to stay there: Express hands a HEAD to the
  // first route that answers GET for the path unless a HEAD route comes
  // first. Through the GET, a HEAD read the whole object out of the store for
  // Express to throw away. Providers size a video with a HEAD before they
  // upload it, so that was a full extra read of every video, holding one of
  // the store client's sockets while it ran. A Range is ignored, as HTTP
  // requires for anything but a GET.
  @Head('/:key')
  async head(
    @Param('key') key: string,
    @Res() res: Response,
    @Headers('if-none-match') ifNoneMatch?: string
  ) {
    if (!this.servable(key)) {
      res.status(404).end();
      return;
    }

    const object = await headFromR2(key);
    if (object === 'unavailable') {
      this.answerUnavailable(res);
      return;
    }
    if (!object) {
      res.status(404).end();
      return;
    }

    if (this.writeHeaders(res, object, ifNoneMatch)) {
      res.end();
    }
  }

  @Get('/:key')
  async serve(
    @Param('key') key: string,
    @Res() res: Response,
    @Headers('if-none-match') ifNoneMatch?: string,
    @Headers('range') range?: string
  ) {
    if (!this.servable(key)) {
      res.status(404).end();
      return;
    }

    // Range is not a nicety here. Video upload to TikTok and YouTube reads the
    // file back through this endpoint one chunk at a time and refuses anything
    // but a 206, because a store that answers a ranged request with the whole
    // object would corrupt the upload at that offset. Without this, posting a
    // video failed for every account on cloudflare storage with "the media
    // storage did not return the requested byte range". It is also what lets a
    // browser seek within a video instead of downloading all of it first.
    const object = await readFromR2(key, range);
    if (object === 'range-not-satisfiable') {
      res.status(416).end();
      return;
    }
    if (object === 'unavailable') {
      this.answerUnavailable(res);
      return;
    }
    if (!object) {
      res.status(404).end();
      return;
    }

    // The body holds one of the S3 client's pooled sockets until it is read to
    // the end or destroyed. A 304, or a viewer that leaves mid-download, did
    // neither, and once the pool ran dry every read queued forever, so every
    // image on the site stopped loading until the backend restarted.
    res.on('close', () => object.body.destroy());

    if (!this.writeHeaders(res, object, ifNoneMatch)) {
      return;
    }

    if (object.contentRange) {
      res.setHeader('Content-Range', object.contentRange);
      res.status(206);
    }

    object.body.on('error', () => res.destroy());
    object.body.pipe(res);
  }
}
