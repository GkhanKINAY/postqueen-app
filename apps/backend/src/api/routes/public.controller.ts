import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThrottlerRealIpGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { ClientIp } from '@gitroom/nestjs-libraries/user/client.ip';
import { UserAgent } from '@gitroom/nestjs-libraries/user/user.agent';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { Request, Response } from 'express';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { AgentGraphInsertService } from '@gitroom/nestjs-libraries/agent/agent.graph.insert.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import {
  AnyTier,
  normalizeTier,
  pricing,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { OnlyURL } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { areCookiesSecured } from '@gitroom/helpers/utils/cookies.secured';
import { PlatformCallbacksService } from '@gitroom/nestjs-libraries/database/prisma/platform-callbacks/platform-callbacks.service';
import { CreatePublicCommentDto } from '@gitroom/nestjs-libraries/dtos/comments/add.comment.dto';
import { AbuseGuardService } from '@gitroom/nestjs-libraries/services/abuse-guard.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { EmailUnsubscribeDto } from '@gitroom/nestjs-libraries/dtos/users/email.unsubscribe.dto';

const pump = promisify(pipeline);

@ApiTags('Public')
@Controller('/public')
export class PublicController {
  constructor(
    private _trackService: TrackService,
    private _agentGraphInsertService: AgentGraphInsertService,
    private _postsService: PostsService,
    private _subscriptionService: SubscriptionService,
    private _platformCallbacksService: PlatformCallbacksService,
    private _abuseGuardService: AbuseGuardService,
    private _usersService: UsersService
  ) {}
  @Post('/agent')
  async createAgent(@Body() body: { text: string; apiKey: string }) {
    if (
      !body.apiKey ||
      !process.env.AGENT_API_KEY ||
      body.apiKey !== process.env.AGENT_API_KEY
    ) {
      return;
    }
    return this._agentGraphInsertService.newPost(body.text);
  }

  /**
   * The `/p/:id` share page. Unauthenticated by design — the id is the only
   * credential — so what it returns has to be chosen, not spread.
   *
   * It used to `...p` every scalar column on Post: `settings` (the per-provider
   * JSON, which carries the subreddit, the board, the "post as" identity),
   * `error`, `releaseId`, `organizationId`, `submittedForOrganizationId`. The
   * integration object right below was already picked field by field for
   * exactly this reason; the post itself was not.
   *
   * It shows a post in every state, drafts and scheduled posts included, as
   * upstream's does: this is where a team shows a client a post before it goes
   * out, and takes the client's comments on it (owner, 2026-09-25). From
   * 2026-08-09 to then it showed published posts only, because post ids are
   * cuid v1, whose randomness is `Math.random()` behind a predictable
   * timestamp: not brute-forceable over HTTP, but not a random token either.
   * The page asks crawlers not to index a post that is not published yet.
   */
  @Get(`/posts/:id`)
  async getPreview(@Param('id') id: string) {
    return (await this._postsService.getPostsRecursively(id, true)).map(
      (p) => ({
        id: p.id,
        content: p.content,
        publishDate: p.publishDate,
        releaseURL: p.releaseURL,
        state: p.state,
        image: p.image,
        ...(p.integration
          ? {
              integration: {
                id: p.integration.id,
                name: p.integration.name,
                picture: p.integration.picture,
                providerIdentifier: p.integration.providerIdentifier,
                profile: p.integration.profile,
              },
            }
          : {}),
      })
    );
  }

  // The `/data-deletion/:code` status page a platform's data deletion answer
  // links to. The random code is the only credential, so this answers with
  // the status alone.
  @Get(`/platform-deletion/:code`)
  getPlatformDeletionStatus(@Param('code') code: string) {
    return this._platformCallbacksService.deletionStatus(code);
  }

  // What the unsubscribe link in a notification email would switch off, for
  // the page it opens. The signed token is the only credential.
  @Get('/emails/unsubscribe')
  getEmailUnsubscribe(@Query() query: EmailUnsubscribeDto) {
    return this._usersService.emailUnsubscribeKind(query.token);
  }

  // Switches it off: the page's button, and the one-click unsubscribe
  // mailboxes send from the List-Unsubscribe header (RFC 8058), which posts
  // `List-Unsubscribe=One-Click` with no cookies. Never on GET, so a link
  // scanner opening the email cannot turn anything off.
  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @HttpCode(200)
  @Post('/emails/unsubscribe')
  emailUnsubscribe(@Query() query: EmailUnsubscribeDto) {
    return this._usersService.emailUnsubscribe(query.token);
  }

  @Get(`/posts/:id/comments`)
  async getComments(@Param('id') postId: string) {
    return this._postsService.getComments(postId);
  }

  // Anyone holding the link can write here, signed in or not, so it is capped
  // per client address, like the public Farcaster signer route.
  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post(`/posts/:id/comments`)
  async createComment(
    @Param('id') postId: string,
    @Body() body: CreatePublicCommentDto,
    @ClientIp() ip: string
  ) {
    // Turnstile, when TURNSTILE_SECRET is set, like the passwordless login.
    const decision = await this._abuseGuardService.challenge({
      action: 'preview_comment',
      ip,
      captchaToken: body.captchaToken,
    });
    if (!decision.allow) {
      throw new BadRequestException('Captcha verification failed');
    }

    return this._postsService.createPublicComment(postId, body, null);
  }

  @Post('/t')
  async trackEvent(
    @Res() res: Response,
    @Req() req: Request,
    @ClientIp() ip: string,
    @UserAgent() userAgent: string,
    @Body()
    body: { fbclid?: string; tt: TrackEnum; additional: Record<string, any> }
  ) {
    const uniqueId = req?.cookies?.track || makeId(10);
    const fbclid = req?.cookies?.fbclid || body.fbclid;
    await this._trackService.track(
      uniqueId,
      ip,
      userAgent,
      body.tt,
      body.additional,
      fbclid
    );
    if (!req.cookies.track) {
      res.cookie('track', uniqueId, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(areCookiesSecured()
          ? {
              secure: true,
              httpOnly: true,
            }
          : {}),
        sameSite: 'none',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });
    }

    if (body.fbclid && !req.cookies.fbclid) {
      res.cookie('fbclid', body.fbclid, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(areCookiesSecured()
          ? {
              secure: true,
              httpOnly: true,
            }
          : {}),
        sameSite: 'none',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });
    }

    res.status(200).json({
      track: uniqueId,
    });
  }

  /**
   * Reseller hook, in the same family as `/enterprise/*` and gated the same way.
   *
   * It is unauthenticated and it is destructive: `modifySubscriptionByOrg`
   * disables the organization's channels, locks out its non-superadmin members
   * and terminates its autopost workflows. Authorizing that on "signed with
   * `JWT_SECRET`" is not enough — every token this app issues, including the
   * session cookie, is signed with that key and declares no purpose. It now
   * requires `ENTERPRISE_SECRET`, so a token minted for anything else cannot
   * reach it, and an install without that variable refuses the route.
   */
  @Post('/modify-subscription')
  async modifySubscription(@Body('params') params: string) {
    try {
      const load = AuthService.verifyJWTWithSecret(
        params,
        process.env.ENTERPRISE_SECRET
      ) as {
        orgId: string;
        billing: AnyTier;
      } | null;

      // A reseller signing the pre-rename AGENCY key gets the same plan.
      const billing = normalizeTier(load?.billing);
      if (!load || !load.orgId || !billing || !pricing[billing]) {
        return { success: false };
      }

      const totalChannels = pricing[billing].channel || 0;

      await this._subscriptionService.modifySubscriptionByOrg(
        load.orgId,
        totalChannels,
        billing
      );

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }


  @Get('/stream')
  async streamFile(
    @Query() query: OnlyURL,
    @Res() res: Response,
    @Req() req: Request
  ) {
    const { url } = query;
    if (!url.endsWith('mp4')) {
      return res.status(400).send('Invalid video URL');
    }

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('aborted', onClose);
    res.on('close', onClose);

    // Manually follow redirects so every hop is re-validated against
    // the SSRF blocklist (see GHSA-34w8-5j2v-h6ww). `fetch` defaults to
    // `redirect: 'follow'`, which bypasses the DTO-level URL check.
    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let r: globalThis.Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isSafePublicHttpsUrl(currentUrl))) {
        return res.status(400).send('Blocked URL');
      }

      r = await fetch(currentUrl, {
        signal: ac.signal,
        redirect: 'manual',
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });

      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get('location');
        if (!location) {
          return res.status(502).send('Redirect without Location');
        }
        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          return res.status(400).send('Invalid redirect target');
        }
        continue;
      }

      break;
    }

    if (!r) {
      return res.status(502).send('No upstream response');
    }

    if (r.status >= 300 && r.status < 400) {
      return res.status(508).send('Too many redirects');
    }

    if (!r.ok && r.status !== 206) {
      res.status(r.status);
      throw new Error(`Upstream error: ${r.statusText}`);
    }

    // This answers on the app's own origin, so whatever it serves is read as
    // ours: only a video type goes out. Anything else (a CDN's
    // application/octet-stream, or a page that merely ends in "mp4") is sent as
    // video/mp4, which a player still plays and nothing ever executes.
    const remoteType = (r.headers.get('content-type') || '').toLowerCase();
    res.setHeader(
      'Content-Type',
      remoteType.startsWith('video/') ? remoteType : 'video/mp4'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const contentRange = r.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const len = r.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const acceptRanges = r.headers.get('accept-ranges') ?? 'bytes';
    res.setHeader('Accept-Ranges', acceptRanges);

    if (r.status === 206) res.status(206); // Partial Content for range responses

    try {
      await pump(Readable.fromWeb(r.body as any), res);
    } catch (err) {}
  }
}
