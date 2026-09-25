import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostMetricsService } from '@gitroom/nestjs-libraries/database/prisma/analytics/post-metrics.service';
import { GetAnalyticsPostsDto } from '@gitroom/nestjs-libraries/dtos/analytics/get.analytics.posts.dto';
import {
  discardTempFile,
  spooledFileInterceptor,
} from '@gitroom/nestjs-libraries/upload/uploaded.file';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { ChangePostStatusDto } from '@gitroom/nestjs-libraries/dtos/posts/change.post.status.dto';
import { UpdateReleaseIdDto } from '@gitroom/nestjs-libraries/dtos/posts/update.release.id.dto';
import { UpdatePostSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/update.post.settings.dto';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { UploadDto } from '@gitroom/nestjs-libraries/dtos/media/upload.dto';
import { ClippingDto } from '@gitroom/nestjs-libraries/dtos/clipping/clipping.dto';
import { ClippingService } from '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { GetNotificationsDto } from '@gitroom/nestjs-libraries/dtos/notifications/get.notifications.dto';
import * as Sentry from '@sentry/nestjs';
import {
  socialIntegrationList,
  IntegrationManager,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { PostValidationException } from '@gitroom/backend/api/routes/posts.validation.exception';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { SuperAdminGuard } from '@gitroom/backend/services/auth/super.admin.guard';
import { GetOrgActivityDto } from '@gitroom/nestjs-libraries/dtos/analytics/get.org.activity.dto';
import dayjs from 'dayjs';

@ApiTags('Public API')
@Controller('/public/v1')
export class PublicIntegrationsController {
  private storage = UploadFactory.createStorage();

  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _postMetricsService: PostMetricsService,
    private _mediaService: MediaService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _adminStatsService: AdminStatsService,
    private _organizationService: OrganizationService,
    private _clippingService: ClippingService
  ) {}

  @Post('/upload')
  @UseInterceptors(spooledFileInterceptor())
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (!file) {
      throw new HttpException({ msg: 'No file provided' }, 400);
    }

    try {
      const getFile = await this.storage.uploadFile(file);
      return await this._mediaService.saveUploadedFile(
        org.id,
        getFile.originalname,
        getFile.path
      );
    } finally {
      await discardTempFile(file);
    }
  }

  // A video answers the two upload routes with `status: "processing"`; it is
  // ready to put on a post once this says so (a few seconds to a few minutes).
  @Get('/media/:id/status')
  async mediaStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.getMediaStatus(org.id, id);
  }

  @Post('/upload-from-url')
  async uploadsFromUrl(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UploadDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    try {
      return await this._mediaService.uploadFromUrl(org.id, body.url);
    } catch (err) {
      // Validation failures keep this route's { msg } error shape
      if (err instanceof BadRequestException) {
        throw new HttpException({ msg: err.message }, 400);
      }
      throw err;
    }
  }

  @Get('/find-slot/:id')
  async findSlotIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return { date: await this._postsService.findFreeDateTime(org.id, id) };
  }

  @Get('/posts')
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPostsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const posts = await this._postsService.getPosts(org.id, query);
    return {
      posts,
      // comments,
    };
  }

  @Post('/posts')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createPost(
    @GetOrgFromRequest() org: Organization,
    @Body() rawBody: any
  ) {
    Sentry.metrics.count('public_api-request', 1);

    // Always true. Passing `schedule` in is what makes the settings schema run
    // for drafts as well, which is deliberate and documented: a draft you
    // promote later should already be valid. The left half of the old
    // `rawBody?.type === 'draft' || true` could never change the result.
    const body = await this._postsService.mapTypeToPost(rawBody, org.id, true);

    // Which means the DTO validated `schedule`, not what the caller sent, so
    // the caller's own value has to be checked here before it is put back. It
    // decides the stored state and whether a publishing workflow starts.
    const POST_TYPES = ['draft', 'schedule', 'now', 'update'];
    if (rawBody?.type !== undefined && !POST_TYPES.includes(rawBody.type)) {
      throw new HttpException(
        { msg: `type must be one of: ${POST_TYPES.join(', ')}` },
        400
      );
    }
    body.type = rawBody.type;

    if (
      process.env.RESTRICT_UPLOAD_DOMAINS &&
      body.posts.some((p) =>
        p.value.some((a) =>
          a.image.some(
            (i) => i.path.indexOf(process.env.RESTRICT_UPLOAD_DOMAINS) === -1
          )
        )
      )
    ) {
      throw new HttpException(
        {
          msg: `All media must be uploaded through our upload API route and contain the domain: ${process.env.RESTRICT_UPLOAD_DOMAINS}`,
        },
        400
      );
    }

    // Server-side validation — same rules as the dashboard, surfaced as a
    // readable 400 (see PostValidationExceptionFilter).
    const validation = await this._postsService.validatePosts(
      org.id,
      body.posts
    );

    const fail = (item: (typeof validation)[number], error: string) => {
      throw new PostValidationException({
        provider: item.identifier,
        name: item.name,
        error,
      });
    };

    for (const item of validation) {
      if (item.emptyContent) {
        fail(
          item,
          'Your post should have at least one character or one image.'
        );
      }
    }

    if (body.type !== 'draft') {
      for (const item of validation) {
        if (!item.valid) {
          fail(item, item.settingsError || 'Please fix your settings');
        }
        if (item.errors !== true) {
          fail(item, item.errors as string);
        }
        if (item.tooLong) {
          fail(item, 'post is too long, please fix it');
        }
      }
    }

    const allowedCreationMethods = ['CLI', 'API'] as const;
    const creationMethod = allowedCreationMethods.includes(
      rawBody.creationMethod
    )
      ? (rawBody.creationMethod as 'CLI' | 'API')
      : 'API';

    return this._postsService.createPost(org.id, body, creationMethod);
  }

  @Delete('/posts/:id')
  async deletePost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const getPostById = await this._postsService.getPost(org.id, id);
    return this._postsService.deletePost(org.id, getPostById.group);
  }

  @Delete('/posts/group/:group')
  deletePostByGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.deletePost(org.id, group);
  }

  @Get('/is-connected')
  async getActiveIntegrations(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return { connected: true };
  }

  @Get('/groups')
  async listGroups(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return (await this._integrationService.customers(org.id)).map(
      (customer) => ({
        id: customer.id,
        name: customer.name,
      })
    );
  }

  @Get('/integrations')
  async listIntegration(
    @GetOrgFromRequest() org: Organization,
    @Query('group') group?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return (await this._integrationService.getIntegrationsList(org.id))
      .filter((integration) => !group || integration.customer?.id === group)
      .map((integration) => ({
        id: integration.id,
        name: integration.name,
        identifier: integration.providerIdentifier,
        picture: integration.picture,
        disabled: integration.disabled,
        profile: integration.profile,
        customer: integration.customer
          ? {
              id: integration.customer.id,
              name: integration.customer.name,
            }
          : undefined,
      }));
  }

  @Get('/social/:integration')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getIntegrationUrl(
    @Param('integration') integration: string,
    @Query('refresh') refresh: string,
    @GetOrgFromRequest() org: Organization
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (
      !this._integrationManager
        .getAllowedSocialsIntegrations()
        .includes(integration)
    ) {
      throw new HttpException({ msg: 'Integration not allowed' }, 400);
    }

    // A provider migrated via MIGRATE_PROVIDERS reconnects through its target
    // provider's OAuth: the callback lands on the target and the channel is
    // migrated in place (see migrateIntegration).
    const migrateTo = refresh
      ? this._integrationManager.getMigrationTarget(integration)
      : undefined;

    const integrationProvider = this._integrationManager.getSocialIntegration(
      migrateTo || integration
    );

    if (integrationProvider.externalUrl) {
      throw new HttpException(
        {
          msg: 'This integration requires an external URL and is not supported via the public API',
        },
        400
      );
    }

    try {
      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl();

      if (refresh) {
        await ioRedis.set(`refresh:${state}`, refresh, 'EX', 3600);
      }

      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(`login:${state}`, codeVerifier, 'EX', 3600);

      return { url };
    } catch (err) {
      throw new HttpException({ msg: 'Failed to generate auth URL' }, 500);
    }
  }

  // Read-only support endpoints, for an organization whose every privileged
  // member is a platform superuser (SuperAdminGuard). They answer for the
  // calling organization only: upstream reaches other organizations with an
  // x-postiz-org header on the public API, which this fork does not take -
  // see docs/upstream-sync.md
  @Get('/debug/posts/:id')
  @UseGuards(SuperAdminGuard)
  async getPostTimeline(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const timeline = await this._postsService.getPostTimeline(id, org.id);

    if (!timeline) {
      throw new HttpException({ msg: 'Post not found' }, 404);
    }

    return timeline;
  }

  @Get('/debug/account')
  @UseGuards(SuperAdminGuard)
  async getAccountOverview(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    const account = await this._organizationService.getAccountOverview(org.id);

    if (!account) {
      throw new HttpException({ msg: 'Organization not found' }, 404);
    }

    return account;
  }

  @Get('/debug/channels')
  @UseGuards(SuperAdminGuard)
  async getChannelHealth(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return this._integrationService.getChannelHealth(org.id);
  }

  @Get('/debug/activity')
  @UseGuards(SuperAdminGuard)
  async getOrgActivity(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetOrgActivityDto
  ) {
    Sentry.metrics.count('public_api-request', 1);

    const from = query.from ? dayjs(query.from) : dayjs().subtract(30, 'day');
    const to = query.to ? dayjs(query.to) : dayjs();

    return this._adminStatsService.getOrgActivity({
      organizationId: org.id,
      from: from.startOf('day').toDate(),
      to: to.endOf('day').toDate(),
    });
  }

  @Get('/notifications')
  async getNotifications(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetNotificationsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._notificationService.getNotificationsPaginated(
      org.id,
      query.page ?? 0
    );
  }

  @Post('/generate-video')
  generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: VideoDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.generateVideo(org, body);
  }

  @Post('/video/function')
  videoFunction(@Body() body: VideoFunctionDto) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.videoFunction(
      body.identifier,
      body.functionName,
      body.params
    );
  }

  @Post('/clipping')
  startClipping(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ClippingDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._clippingService.startClipping(org, body);
  }

  @Get('/clipping')
  getClippings(
    @GetOrgFromRequest() org: Organization,
    @Query('page') page: number
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._clippingService.getClippings(org.id, page);
  }

  @Get('/clipping/:id')
  getClipping(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    Sentry.metrics.count('public_api-request', 1);
    return this._clippingService.getClipping(org.id, id);
  }

  @Delete('/integrations/:id')
  async deleteChannel(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    // An unknown id reached Prisma's update and answered 500. A channel that
    // is already deleted is not found either.
    if (
      !(await this._integrationService.getIntegrationByIdNotDeleted(org.id, id))
    ) {
      throw new HttpException({ msg: 'Channel not found' }, 404);
    }
    const isTherePosts = await this._integrationService.getPostsForChannel(
      org.id,
      id
    );
    if (isTherePosts.length) {
      // Wait for these. Fired without await, deleteChannel returned first and
      // the posts were deleted afterwards or not at all, while the API had
      // already promised they would go with the channel.
      const results = await this._postsService.deletePostsByGroups(
        org.id,
        isTherePosts.map((post) => post.group)
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          Sentry.captureException(result.reason, {
            tags: { area: 'delete_channel_posts' },
            extra: { orgId: org.id, integrationId: id },
          });
        }
      }
    }

    return this._integrationService.deleteChannel(org.id, id);
  }

  @Get('/integration-settings/:id')
  async getIntegrationSettings(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const loadIntegration =
      await this._integrationService.getIntegrationByIdNotDeleted(org.id, id);

    if (!loadIntegration) {
      throw new HttpException({ msg: 'Integration not found' }, 404);
    }

    const additionalSettings = JSON.parse(
      loadIntegration.additionalSettings || '[]'
    );

    const integration = socialIntegrationList.find(
      (p) => p.identifier === loadIntegration.providerIdentifier
    )!;

    if (!integration) {
      return {
        output: { rules: '', maxLength: 0, settings: {}, tools: [] as any[] },
      };
    }

    // The same stored settings `validatePosts` hands the provider, so the
    // limit reported here is the one a post is then held to.
    const maxLength = integration.maxLength(additionalSettings);
    const schemas = !integration.dto
      ? false
      : getValidationSchemas()[integration.dto.name];
    const tools = this._integrationManager.getAllTools();
    const rules = this._integrationManager.getAllRulesDescription();

    return {
      output: {
        rules: rules[integration.identifier],
        maxLength,
        settings: !schemas ? 'No additional settings required' : schemas,
        tools: tools[integration.identifier],
      },
    };
  }

  @Get('/posts/:id/missing')
  async getMissingContent(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.getMissingContent(org.id, id);
  }

  @Put('/posts/:id/settings')
  async updatePostSettings(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdatePostSettingsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.updatePostSettings(
      org.id,
      id,
      body.settings,
      'API'
    );
  }

  @Put('/posts/:id/status')
  async changePostStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: ChangePostStatusDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.changePostStatus(org.id, id, body.status);
  }

  @Put('/posts/:id/release-id')
  async updateReleaseId(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateReleaseIdDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.updateReleaseId(org.id, id, body.releaseId);
  }

  @Get('/analytics/posts')
  getAnalyticsPosts(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetAnalyticsPostsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postMetricsService.listPosts(org.id, query);
  }

  @Get('/analytics/summary')
  getAnalyticsSummary(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetAnalyticsPostsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postMetricsService.summary(org.id, query);
  }

  @Get('/analytics/post/:postId')
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.checkPostAnalytics(org.id, postId, +date);
  }

  @Get('/analytics/:integration')
  async getAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._integrationService.checkAnalytics(org, integration, date);
  }

  @Post('/integration-trigger/:id')
  async triggerIntegrationTool(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { methodName: string; data: Record<string, string> }
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const getIntegration =
      await this._integrationService.getIntegrationByIdNotDeleted(org.id, id);

    if (!getIntegration) {
      throw new HttpException({ msg: 'Integration not found' }, 404);
    }

    const integrationProvider = socialIntegrationList.find(
      (p) => p.identifier === getIntegration.providerIdentifier
    )!;

    if (!integrationProvider) {
      throw new HttpException({ msg: 'Integration provider not found' }, 404);
    }

    const tools = this._integrationManager.getAllTools();
    if (
      // @ts-ignore
      !tools[integrationProvider.identifier]?.some(
        (p: any) => p.methodName === body.methodName
      ) ||
      // @ts-ignore
      !integrationProvider[body.methodName]
    ) {
      throw new HttpException({ msg: 'Tool not found' }, 404);
    }

    while (true) {
      try {
        // @ts-ignore
        const result = await integrationProvider[body.methodName](
          getIntegration.token,
          body.data || {},
          getIntegration.internalId,
          getIntegration
        );

        return { output: result };
      } catch (err) {
        if (err instanceof RefreshToken) {
          const data = await this._refreshIntegrationService.refresh(
            getIntegration
          );

          if (!data) {
            await this._integrationService.disconnectChannel(
              org.id,
              getIntegration
            );
            throw new HttpException(
              { msg: 'Channel disconnected due to expired token' },
              401
            );
          }

          const { accessToken } = data;

          if (accessToken) {
            getIntegration.token = accessToken;

            if (integrationProvider.refreshWait) {
              await timer(10000);
            }

            continue;
          }
        }
        // Anything that is not an expired token. The caller still gets a
        // generic 500 because the provider's own message can carry account
        // detail, but throwing this away entirely made a malformed `data`
        // payload indistinguishable from PostQueen being down.
        Sentry.captureException(err, {
          tags: { area: 'integration_trigger' },
          extra: {
            provider: getIntegration.providerIdentifier,
            methodName: body.methodName,
          },
        });
        throw new HttpException({ msg: 'Unexpected error' }, 500);
      }
    }
  }
}
