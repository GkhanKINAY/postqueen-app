import {
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerRequest,
} from '@nestjs/throttler';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { catchError, Observable } from 'rxjs';
import { RefundableThrottlerStorage } from '@gitroom/nestjs-libraries/throttler/throttler.storage';

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

/**
 * Hourly allowance for UPLOAD_ROUTES, per organization, kept apart from
 * API_LIMIT. API_LIMIT rations public-API posting and the shipped compose file
 * sets it to 30; the uploader has no file-count cap, so while uploads shared
 * that number, choosing 40 files in the media library failed the last ten.
 * UPLOAD_LIMIT, 300 unless set, still bounds what one account can push through
 * the upload routes in an hour.
 */
const uploadLimit = () => {
  const limit = Number(process.env.UPLOAD_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? limit : 300;
};

// A counter a request was counted in, kept on it as `req.throttlerHits`.
type ThrottlerHit = { key: string; throttlerName: string };

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

  // The module configures a single throttler, sized by API_LIMIT. Uploads
  // already count in their own bucket (getTracker below); this gives that
  // bucket its own ceiling.
  protected override async handleRequest(
    requestProps: ThrottlerRequest
  ): Promise<boolean> {
    const { context, throttler, getTracker, generateKey } = requestProps;
    const { req } = this.getRequestResponse(context);
    const allowed = await super.handleRequest(
      isUpload(req.path)
        ? { ...requestProps, limit: uploadLimit() }
        : requestProps
    );

    // Counted, not refused (that throws above). Note the key it was counted
    // under, built the way super.handleRequest built it, so that
    // ThrottlerRefundInterceptor can give the hit back.
    const hit: ThrottlerHit = {
      key: generateKey(
        context,
        await getTracker(req, context),
        throttler.name!
      ),
      throttlerName: throttler.name!,
    };
    req.throttlerHits = [...(req.throttlerHits || []), hit];
    return allowed;
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
    // `req.ip` is the client (TRUSTED_PROXIES in user/client.ip.ts): Express
    // resolves it past our own proxies only, so a header the client writes
    // does not move it.
    const org = req.org?.id;

    return (org || 'ip:' + req.ip) + '_' + bucket;
  }
}

// A request refused for what it sent: the DTO, the service's own validation.
// Not 401 or 403 (who is asking), and not 429 (the limit itself).
const REFUNDED_STATUSES: number[] = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNPROCESSABLE_ENTITY,
];

/**
 * Gives a request its hits back when it is answered 400 or 422.
 *
 * Guards run before pipes and the handler, so ThrottlerBehindProxyGuard has
 * already counted a POST /public/v1/posts by the time its body turns out to be
 * invalid. The allowance rations posts, and an API client or AI agent that
 * sent a few malformed calls used it up without posting anything. A refund
 * that fails is logged, and the request still gets its own answer.
 */
@Injectable()
export class ThrottlerRefundInterceptor implements NestInterceptor {
  private readonly _logger = new Logger(ThrottlerRefundInterceptor.name);

  constructor(
    @InjectThrottlerStorage()
    private readonly _storage: RefundableThrottlerStorage
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError(async (err) => {
        if (
          err instanceof HttpException &&
          REFUNDED_STATUSES.includes(err.getStatus())
        ) {
          await this.refund(context.switchToHttp().getRequest());
        }
        throw err;
      })
    );
  }

  private async refund(req: Record<string, any>) {
    const hits: ThrottlerHit[] = req.throttlerHits || [];
    for (const { key, throttlerName } of hits) {
      try {
        await this._storage.decrement(key, throttlerName);
      } catch (err) {
        this._logger.warn(
          `Could not give a rate limit hit back: ${(err as Error)?.message}`
        );
      }
    }
  }
}

/**
 * From here on the request keeps its hits, whatever it answers. For a handler
 * that can still be refused after it has written something: a request that
 * saved one post and was then refused for the next has spent its allowance.
 */
export const spendThrottlerHits = (req: Record<string, any>) => {
  delete req.throttlerHits;
};

// Route-level guard for public endpoints, keyed by the client address rather
// than the org the global guard expects.
//
// That address is `req.ip`, which Express resolves with `trust proxy` set to
// TRUSTED_PROXIES (user/client.ip.ts). Neither end of X-Forwarded-For will do
// on its own. The first entry is whatever the client sent (upstream's version
// keyed on it), so a fresh header meant a fresh bucket. The last entry is our
// own container nginx's peer, the Docker gateway, the same for every request
// in production, so keying on it made each limit one bucket for everybody.
@Injectable()
export class ThrottlerRealIpGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    return req.ip;
  }
}
