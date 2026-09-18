import {
  Logger,
  HttpStatus,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
  Body,
  HttpException,
} from '@nestjs/common';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
  copilotRuntimeNestEndpoint,
} from '@copilotkit/runtime';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import {
  CopilotSurface,
  MastraService,
} from '@gitroom/nestjs-libraries/chat/mastra.service';
import { CopilotChannel } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { ThreadStateDto } from '@gitroom/nestjs-libraries/dtos/copilot/thread.state.dto';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

export type ChannelsContext = {
  organization: string;
  ui: string;
  surface: CopilotSurface;
  /** JSON of CopilotChannel[]: the channels selected in the app. */
  channels: string;
  timezone: string;
  locale: string;
};

/**
 * What the app sends as CopilotKit `properties.pq`. It arrives on the AG-UI
 * request as `forwardedProps` (the v1 `variables.properties` path the old
 * code read no longer exists on the single-route runtime).
 */
type CopilotProperties = {
  surface?: CopilotSurface;
  channels?: CopilotChannel[];
  timezone?: string;
  locale?: string;
};

const readProperties = (req: Request): CopilotProperties => {
  const pq = req?.body?.body?.forwardedProps?.pq;
  return pq && typeof pq === 'object' ? pq : {};
};

const shortString = (value: unknown, max = 64) =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** Only the fields the prompt prints; the app sends nothing else, but the wire is the wire. */
const channelsFromProperties = (channels: unknown): CopilotChannel[] =>
  Array.isArray(channels)
    ? channels
        .filter((c) => c && typeof c === 'object' && typeof c.id === 'string')
        .slice(0, 100)
        .map((c) => ({
          id: shortString(c.id),
          platform: shortString(c.platform),
          name: shortString(c.name, 80),
          handle: shortString(c.handle),
          format: shortString(c.format, 16),
          customer: shortString(c.customer, 80),
        }))
    : [];

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService
  ) {}
  // The only route in this controller that carried no policy, so a FREE org
  // got a working OpenAI runtime and we got the bill. Added together with the
  // tier condition on the three <CopilotKit> mounts: CopilotKit talks GraphQL
  // through its own urql client, which does not go through the customFetch
  // wrapper that turns a 402 into the Payment Required dialog, so a 402 here
  // surfaces as an unhandled CombinedError. Nobody who cannot pass this should
  // be mounting the provider in the first place.
  @Post('/chat')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  chatAgent(@Req() req: Request, @Res() res: Response) {
    if (
      process.env.OPENAI_API_KEY === undefined ||
      process.env.OPENAI_API_KEY === ''
    ) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        msg: 'AI features are not configured on this installation.',
      });
      return;
    }

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      runtime: new CopilotRuntime(),
      serviceAdapter: new OpenAIAdapter({
        model: 'gpt-4.1',
      }),
      cors: this.runtimeCors(),
    });

    this.streamUnbuffered(res);
    return copilotRuntimeHandler(req, res);
  }

  // The runtime streams its reply as server-sent events. nginx (prod,
  // var/docker/nginx.conf) buffers proxied responses by default and this
  // header is how a response opts out; the gzip side is handled in main.ts.
  // Set before the handler runs: the Node adapter copies its own headers on
  // top and pipes without flushing, so anything set later is too late.
  private streamUnbuffered(res: Response) {
    res.setHeader('X-Accel-Buffering', 'no');
  }

  // The runtime answers with its own CORS headers, copied over the ones Nest
  // already set: `Access-Control-Allow-Origin: *` next to credentials, which
  // every browser refuses. Behind nginx the app is same-origin and never
  // noticed; a frontend on another origin (local dev) got "Failed to fetch"
  // on every message. Same allowlist as the Nest CORS config in main.ts.
  private runtimeCors() {
    const allowed = new Set(
      [
        process.env.FRONTEND_URL,
        'http://localhost:6274',
        process.env.MAIN_URL,
      ].filter((origin): origin is string => !!origin)
    );
    return {
      origin: (origin: string) => (allowed.has(origin) ? origin : undefined),
      credentials: true,
    };
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    if (
      process.env.OPENAI_API_KEY === undefined ||
      process.env.OPENAI_API_KEY === ''
    ) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        msg: 'AI features are not configured on this installation.',
      });
      return;
    }
    const properties = readProperties(req);
    const surface: CopilotSurface =
      properties.surface === 'composer' ? 'composer' : 'agent';

    // A thread id is client-minted, so a run or a connect can name any id.
    // Runs create the thread under this organization's resource; a connect
    // replays from it. Either way an id that already belongs to another
    // organization is refused here, before the runtime sees it.
    const threadId = req?.body?.body?.threadId;
    if (
      typeof threadId === 'string' &&
      (await this._mastraService.threadOwnedBy(organization.id, threadId)) ===
        undefined
    ) {
      res.status(HttpStatus.FORBIDDEN).json({ msg: 'Not your thread.' });
      return;
    }

    const mastra = await this._mastraService.mastra();
    const requestContext = new RequestContext<ChannelsContext>();
    requestContext.set('organization', JSON.stringify(organization));
    requestContext.set('ui', 'true');
    requestContext.set('surface', surface);
    requestContext.set(
      'channels',
      JSON.stringify(channelsFromProperties(properties.channels))
    );
    requestContext.set('timezone', shortString(properties.timezone));
    requestContext.set('locale', shortString(properties.locale, 16));

    const agents = MastraAgent.getLocalAgents({
      resourceId: this._mastraService.resourceId(organization.id, surface),
      mastra,
      requestContext: requestContext as any,
    });

    const runtime = new CopilotRuntime({
      agents,
      runner: await this._mastraService.threadRunner(organization.id),
    });

    // The Nest integration, not the Next.js App Router one this used to call.
    // That was always the wrong endpoint for a Nest controller and only worked
    // because its `handleRequest` happened to accept `(req, res)`; in 1.66 it
    // takes a single App Router `Request` and returns a `Response`. The Nest
    // export is the same runtime behind a handler shaped for this framework.
    const copilotRuntimeHandler = copilotRuntimeNestEndpoint({
      endpoint: '/copilot/agent',
      runtime,
      // properties: req.body.variables.properties,
      serviceAdapter: new OpenAIAdapter({
        model: 'gpt-4.1',
      }),
      cors: this.runtimeCors(),
    });

    this.streamUnbuffered(res);
    return copilotRuntimeHandler(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postqueen').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      Logger.warn(`Could not recall messages for thread ${threadId}: ${err}`);
      return { messages: [] };
    }
  }

  // The UI state that lives beside a thread's transcript (selected channels,
  // what happened to each Post Preview card). Kept in the thread's metadata,
  // so it survives a reload and a backend restart like the messages do.
  @Get('/:thread/state')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  getThreadState(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ) {
    return this._mastraService.getThreadState(organization.id, threadId);
  }

  @Post('/:thread/state')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async saveThreadState(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string,
    @Body() body: ThreadStateDto
  ) {
    // Only the two fields the app keeps; the global ValidationPipe does not
    // whitelist, and this is merged straight into stored metadata.
    const patch: Record<string, unknown> = {};
    if (body.channels !== undefined) {
      patch.channels = body.channels;
    }
    if (body.cards !== undefined) {
      patch.cards = body.cards;
    }
    const saved = await this._mastraService.saveThreadState(
      organization.id,
      threadId,
      body.surface === 'composer' ? 'composer' : 'agent',
      patch
    );
    if (!saved) {
      throw new HttpException('Not your thread.', HttpStatus.FORBIDDEN);
    }
    return saved;
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postqueen').getMemory();
    const list = await memory.listThreads({
      filter: { resourceId: organization.id },
      perPage: 100000,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }
}
