import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

/**
 * Routes that accept a file. They are rate limited for a different reason than
 * the posting endpoint: not to ration a paid resource, but because each request
 * can carry up to the maximum upload size, and an authenticated account with no
 * limit at all could hold a server's worth of disk and bandwidth open.
 *
 * Matched against `req.path`, never `req.url`. `req.url` carries the query
 * string, and these were substring tests, so `POST /auth/login?x=/public/v1/posts`
 * entered the throttler — a route with no AuthMiddleware, where `getTracker`
 * below then read `.id` off an undefined `req.org` and answered 500. Anyone
 * could trigger it, unauthenticated, at will. `permissions.guard.ts` had the
 * identical bug and reads `request.path` now.
 */
const UPLOAD_ROUTES = [
  '/media/upload-server',
  '/media/upload-simple',
  '/public/v1/upload',
];

const isUpload = (path: string) =>
  UPLOAD_ROUTES.some((r) => path.startsWith(r));

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const { path, method } = context.switchToHttp().getRequest<Request>();
    if (
      method === 'POST' &&
      (path.startsWith('/public/v1/posts') || isUpload(path))
    ) {
      return super.canActivate(context);
    }

    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    // Separate counters per concern, so a burst of uploads cannot exhaust the
    // allowance for publishing posts, or the other way round.
    const bucket = isUpload(req.path)
      ? 'uploads'
      : req.path.indexOf('/posts') > -1
      ? 'posts'
      : 'other';

    // Every route the guard above lets through sits behind AuthMiddleware, so
    // `req.org` is always there today and the fallback never runs. It exists so
    // that adding an unauthenticated route to that list is a rate limit that
    // keys on something else, rather than a 500.
    //
    // The class name notwithstanding, this has never read a forwarded IP and
    // still does not: nothing calls `app.set('trust proxy')`, and turning that
    // on so `req.ips` populates would also let a client pick its own
    // X-Forwarded-For, which is a worse bucket than the socket address.
    const org = req.org?.id;

    return (org || 'ip:' + req.ip) + '_' + bucket;
  }
}
