import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import dayjs from 'dayjs';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  Integration,
  Post,
  Media,
  From,
  CreationMethod,
  State,
} from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import { shuffle } from 'lodash';
import { CreateGeneratedPostsDto } from '@gitroom/nestjs-libraries/dtos/generator/create.generated.posts.dto';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import utc from 'dayjs/plugin/utc';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import {
  minifyPostsList,
  minifyPosts,
} from '@gitroom/helpers/utils/posts.list.minify';
import { postWantsPublishNotice } from '@gitroom/helpers/utils/post.publish.notice';
import { readOrFetch } from '@gitroom/nestjs-libraries/integrations/read.or.fetch';
import sharp from 'sharp';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { Readable } from 'stream';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
dayjs.extend(utc);
import * as Sentry from '@sentry/nestjs';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import {
  daysSpanning,
  quarterHourMinutesOnDay,
  soonWindow,
} from '@gitroom/nestjs-libraries/database/prisma/posts/soon-slot';
import { stripLinks } from '@gitroom/helpers/utils/strip.links';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { countLength } from '@gitroom/helpers/utils/count.length';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { postContentPlainText } from '@gitroom/helpers/utils/sanitize.post.content';
import { CreatePublicCommentDto } from '@gitroom/nestjs-libraries/dtos/comments/add.comment.dto';

type PostWithConditionals = Post & {
  integration?: Integration;
  childrenPost: Post[];
};

@Injectable()
export class PostsService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _postRepository: PostsRepository,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _mediaService: MediaService,
    private _shortLinkService: ShortLinkService,
    private _openaiService: OpenaiService,
    private _temporalService: TemporalService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _subscriptionService: SubscriptionService,
    private _organizationService: OrganizationService
  ) {}

  /**
   * The monthly posts allowance, the way `POST /posts` checks it through its
   * policy (`PermissionsService`, which lives in the backend app and cannot
   * be reached from here): posts counted from the subscription's monthly
   * anniversary, against the tier's `posts_per_month`. For the MCP schedule
   * tool, which creates rows without passing that controller.
   */
  async assertPostsQuota(orgId: string) {
    if (!isBillingEnabled()) {
      return;
    }
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(orgId);
    const tier = subscription?.subscriptionTier || 'FREE';
    const limit = pricing[tier].posts_per_month;
    const refuse = () => {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.POSTS_PER_MONTH,
      });
    };
    // FREE has no posts at all; no need to count.
    if (limit <= 0) {
      refuse();
    }
    const createdAt =
      subscription?.createdAt ||
      (await this._organizationService.getOrgById(orgId))?.createdAt ||
      new Date();
    const monthsPast = Math.abs(dayjs(createdAt).diff(dayjs(), 'month'));
    const count = await this.countPostsFromDay(
      orgId,
      dayjs(createdAt).add(monthsPast, 'month').toDate()
    );
    if (count >= limit) {
      refuse();
    }
  }

  searchForMissingThreeHoursPosts() {
    return this._postRepository.searchForMissingThreeHoursPosts();
  }

  updatePost(id: string, postId: string, releaseURL: string) {
    return this._postRepository.updatePost(id, postId, releaseURL);
  }

  shouldSkipPublishNotice(post?: { settings: string | null } | null) {
    return !postWantsPublishNotice(post?.settings);
  }

  /** The post a publish notice is about, found by the link it went live at. */
  getPublishedByReleaseUrl(orgId: string, releaseURL: string) {
    return this._postRepository.getPublishedByReleaseUrl(orgId, releaseURL);
  }

  claimPost(id: string, claimant: string, anyState: boolean) {
    return this._postRepository.claimPost(id, claimant, anyState);
  }

  getPublishClaim(id: string) {
    return this._postRepository.getPublishClaim(id);
  }

  async getMissingContent(
    orgId: string,
    postId: string,
    forceRefresh = false
  ): Promise<{ id: string; url: string }[]> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || post.releaseId !== 'missing') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.missing) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    try {
      return await integrationProvider.missing(
        getIntegration.internalId,
        getIntegration.token
      );
    } catch (e) {
      console.log(e);
      if (e instanceof RefreshToken) {
        return this.getMissingContent(orgId, postId, true);
      }
    }

    return [];
  }

  async getPostById(postId: string, orgId: string) {
    return this._postRepository.getPostById(postId, orgId);
  }

  async getPostTimeline(postId: string, orgId: string) {
    return this._postRepository.getPostTimeline(postId, orgId);
  }

  async updateReleaseId(orgId: string, postId: string, releaseId: string) {
    // The update matches only a post still waiting for its id, so a wrong id
    // or a post that already has one reached Prisma as a 500.
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || post.deletedAt) {
      throw new NotFoundException('Post not found');
    }
    if (post.releaseId !== 'missing') {
      throw new BadRequestException('This post is not waiting for a release id');
    }
    return this._postRepository.updateReleaseId(postId, orgId, releaseId);
  }

  async checkPostAnalytics(
    orgId: string,
    postId: string,
    date: number,
    forceRefresh = false
  ): Promise<AnalyticsData[] | { missing: true }> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || !post.releaseId) {
      return [];
    }

    if (post.releaseId === 'missing') {
      return { missing: true };
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.postAnalytics) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    // const getIntegrationData = await ioRedis.get(
    //   `integration:${orgId}:${post.id}:${date}`
    // );
    // if (getIntegrationData) {
    //   return JSON.parse(getIntegrationData);
    // }

    try {
      const loadAnalytics = await integrationProvider.postAnalytics(
        getIntegration.internalId,
        getIntegration.token,
        post.releaseId,
        date
      );
      await ioRedis.set(
        `integration:${orgId}:${post.id}:${date}`,
        JSON.stringify(loadAnalytics),
        'EX',
        !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
          ? 1
          : 3600
      );
      return loadAnalytics;
    } catch (e) {
      console.log(e);
      if (e instanceof RefreshToken) {
        return this.checkPostAnalytics(orgId, postId, date, true);
      }
    }

    return [];
  }

  async getStatistics(orgId: string, id: string) {
    const getPost = await this.getPostsRecursively(id, true, orgId, true);
    const content = getPost.map((p) => p.content);
    const shortLinksTracking = await this._shortLinkService.getStatistics(
      content
    );

    return {
      clicks: shortLinksTracking,
    };
  }

  async mapTypeToPost(
    body: CreatePostDto,
    organization: string,
    replaceDraft: boolean = false
  ): Promise<CreatePostDto> {
    if (!body?.posts?.every((p) => p?.integration?.id)) {
      throw new BadRequestException('All posts must have an integration id');
    }

    const mappedValues = {
      ...body,
      type: replaceDraft ? 'schedule' : body?.type,
      posts: await Promise.all(
        body?.posts?.map(async (post) => {
          // A removed channel keeps its row, so the plain lookup would take
          // the post and answer 200 for a channel that cannot publish.
          const integration =
            await this._integrationService.getIntegrationByIdNotDeleted(
              organization,
              post.integration.id
            );

          if (!integration) {
            throw new BadRequestException(
              `Integration with id ${post.integration.id} not found`
            );
          }

          return {
            ...post,
            // After the spread, not before. Post.type carries no validator, so
            // with the spread last a caller could set a per-post type of
            // 'draft' and skip that entry's settings validation while the
            // top-level type stayed 'schedule'.
            type: replaceDraft ? 'schedule' : body?.type,
            settings: {
              ...(post.settings || ({} as any)),
              __type: integration.providerIdentifier,
            },
          };
        }) || []
      ),
    };

    const validationPipe = new ValidationPipe({
      skipMissingProperties: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });

    return await validationPipe.transform(mappedValues, {
      type: 'body',
      metatype: CreatePostDto,
    });
  }

  async getPostsRecursively(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ): Promise<PostWithConditionals[]> {
    const post = await this._postRepository.getPost(
      id,
      includeIntegration,
      orgId,
      isFirst
    );

    if (!post) {
      return [];
    }

    return [
      post!,
      ...(post?.childrenPost?.length
        ? await this.getPostsRecursively(
            post?.childrenPost?.[0]?.id,
            false,
            orgId,
            false
          )
        : []),
    ];
  }

  async getPosts(orgId: string, query: GetPostsDto) {
    return this._postRepository.getPosts(orgId, query);
  }

  async getPostsMinified(orgId: string, query: GetPostsDto) {
    return minifyPosts({
      posts: await this._postRepository.getPosts(orgId, query),
    });
  }

  countPostsByState(orgId: string, integrationId: string) {
    return this._postRepository.countPostsByState(orgId, integrationId);
  }

  async getPostsList(orgId: string, query: GetPostsListDto) {
    return minifyPostsList(
      await this._postRepository.getPostsList(orgId, query)
    );
  }

  async updateMedia(id: string, imagesList: any[], convertToJPEG = false) {
    try {
      let imageUpdateNeeded = false;
      // A video attached while it was still being normalized was saved with
      // the path its row had then; the row is what is current. One query for
      // the whole list, and a row that is gone leaves the post's copy alone.
      const liveRows = await this._mediaService.getMediaByIds(
        (imagesList || []).map((p: any) => p?.id).filter(Boolean)
      );
      const getImageList = await Promise.all(
        (
          await Promise.all(
            (imagesList || []).map(async (p: any) => {
              if (!p.path && p.id) {
                imageUpdateNeeded = true;
                return this._mediaService.getMediaById(p.id);
              }

              // Only a video: an image's path can differ on purpose (the
              // JPEG a provider converted it to was written back here).
              const live = p.id ? liveRows.find((row) => row.id === p.id) : undefined;
              if (live && hasExtension(live.path, 'mp4') && live.path !== p.path) {
                imageUpdateNeeded = true;
                return {
                  ...p,
                  path: live.path,
                  ...(live.thumbnail ? { thumbnail: live.thumbnail } : {}),
                };
              }

              return p;
            })
          )
        )
          .map((m) => {
            return {
              ...m,
              url:
                m.path.indexOf('http') === -1
                  ? process.env.FRONTEND_URL +
                    '/' +
                    (process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY || 'uploads') +
                    m.path
                  : m.path,
              // Was hardcoded 'image', videos included. This is the value the
              // publish payload carries and providers branch on it: gmb sends
              // `mediaFormat: PHOTO` for anything that is not 'video', telegram
              // picks sendPhoto over sendVideo. So an uploaded mp4 went to
              // those networks as a still.
              //
              // Read off the path rather than the row: Media has a `type`
              // column, but nothing has ever written to it, so every row still
              // carries the "image" default whatever was uploaded. mp4 is the
              // only video the uploaders accept (ALLOWED_EXT_TO_MIME,
              // LOCAL_STORAGE_ALLOWED_MIME).
              type: hasExtension(m.path, 'mp4') ? 'video' : 'image',
              path:
                m.path.indexOf('http') === -1
                  ? process.env.UPLOAD_DIRECTORY + m.path
                  : m.path,
            };
          })
          .map(async (m) => {
            if (!convertToJPEG) {
              return m;
            }

            // Every image format the library takes besides JPEG, not only
            // PNG: a provider that asks for JPEG accepts none of them as they
            // are. Named formats only, so a path with no known extension is
            // never downloaded on a guess. (BMP is left out: sharp cannot
            // read it, and the providers that convert refuse it up front.)
            if (
              m.type === 'image' &&
              ['png', 'webp', 'gif', 'avif', 'tif'].some((ext) =>
                hasExtension(m.path, ext)
              )
            ) {
              // The stored path can name any host, so it goes through the same
              // guarded reader the providers use. A file that cannot be read
              // or decoded goes out as it is, and the rest of the list is
              // still converted instead of the whole list being dropped.
              const imageBuffer = await readOrFetch(m.url).catch(
                (): null => null
              );
              // Transparency is laid on white: JPEG has no alpha, and sharp
              // would otherwise fill it with black. rotate() applies the EXIF
              // orientation first, since the JPEG is written without it.
              const buffer = imageBuffer
                ? await sharp(Buffer.from(imageBuffer))
                    .rotate()
                    .flatten({ background: '#ffffff' })
                    .jpeg({ quality: 100 })
                    .toBuffer()
                    .catch((): null => null)
                : null;
              if (!buffer) {
                return m;
              }

              imageUpdateNeeded = true;
              const { path, originalname } = await this.storage.uploadFile({
                buffer,
                mimetype: 'image/jpeg',
                size: buffer.length,
                path: '',
                fieldname: '',
                destination: '',
                stream: new Readable(),
                filename: '',
                originalname: '',
                encoding: '',
              });

              return {
                ...m,
                name: originalname,
                url:
                  path.indexOf('http') === -1
                    ? process.env.FRONTEND_URL +
                      '/' +
                      (process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY || 'uploads') +
                      path
                    : path,
                type: 'image',
                path:
                  path.indexOf('http') === -1
                    ? process.env.UPLOAD_DIRECTORY + path
                    : path,
              };
            }

            return m;
          })
      );

      if (imageUpdateNeeded) {
        await this._postRepository.updateImages(
          id,
          JSON.stringify(getImageList)
        );
      }

      return getImageList;
    } catch (err: any) {
      return imagesList;
    }
  }

  async getPostGroupDebugExport(orgId: string, group: string) {
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    const errors = await this._postRepository.getErrorsByPostIds(
      loadAll.map((p) => p.id)
    );
    const posts = this.arrangePostsByGroup(loadAll, undefined);
    if (!posts.length) {
      throw new NotFoundException('Post not found');
    }
    const rootPost = posts[0] as any;

    return {
      type: 'draft' as const,
      shortLink: false,
      date: rootPost.publishDate.toISOString(),
      tags:
        rootPost.tags?.map((t: any) => ({
          value: t.tag.id,
          label: t.tag.name,
        })) || [],
      posts: [
        {
          integration: { id: 'REPLACE_WITH_LOCAL_INTEGRATION_ID' },
          group: rootPost.group,
          settings: JSON.parse(rootPost.settings || '{}'),
          value: posts.map((post) => ({
            content: post.content,
            image: JSON.parse(post.image || '[]'),
            delay: post.delay || 0,
          })),
        },
      ],
      _debug: {
        providerIdentifier: rootPost.integration?.providerIdentifier,
        providerName: rootPost.integration?.name,
        state: rootPost.state,
        error: rootPost.error,
        errors: errors.map((e) => ({
          message: e.message,
          platform: e.platform,
          body: e.body,
          createdAt: e.createdAt,
        })),
        originalGroup: group,
        originalPublishDate: rootPost.publishDate,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  async getPostsByGroup(orgId: string, group: string) {
    const convertToJPEG = false;
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    const posts = this.arrangePostsByGroup(loadAll, undefined);
    if (!posts.length) {
      throw new NotFoundException('Post not found');
    }

    return {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...post,
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };
  }

  arrangePostsByGroup(all: any, parent?: string): PostWithConditionals[] {
    const findAll = all
      .filter((p: any) =>
        !parent ? !p.parentPostId : p.parentPostId === parent
      )
      .map(({ integration, ...all }: any) => ({
        ...all,
        ...(!parent ? { integration } : {}),
      }));

    return [
      ...findAll,
      ...(findAll.length
        ? findAll.flatMap((p: any) => this.arrangePostsByGroup(all, p.id))
        : []),
    ];
  }

  async getPost(orgId: string, id: string, convertToJPEG = false) {
    const posts = await this.getPostsRecursively(id, true, orgId, true);
    // An unknown id, or a comment's id, used to reach `posts[0].integrationId`
    // below and answer with a TypeError as a 500.
    if (!posts.length) {
      throw new NotFoundException('Post not found');
    }
    const list = {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...post,
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };

    return list;
  }

  async getOldPosts(orgId: string, date: string) {
    return this._postRepository.getOldPosts(orgId, date);
  }

  public async updateTags(orgId: string, post: Post[]): Promise<Post[]> {
    const plainText = JSON.stringify(post);
    const extract = Array.from(
      plainText.match(/\(post:[a-zA-Z0-9-_]+\)/g) || []
    );
    if (!extract.length) {
      return post;
    }

    const ids = (extract || []).map((e) =>
      e.replace('(post:', '').replace(')', '')
    );
    const urls = await this._postRepository.getPostUrls(orgId, ids);
    const newPlainText = ids.reduce((acc, value) => {
      const findUrl = urls?.find?.((u) => u.id === value)?.releaseURL || '';
      return acc.replace(
        new RegExp(`\\(post:${value}\\)`, 'g'),
        findUrl.split(',')[0]
      );
    }, plainText);

    return this.updateTags(orgId, JSON.parse(newPlainText) as Post[]);
  }

  public async checkInternalPlug(
    integration: Integration,
    orgId: string,
    id: string,
    settings: any
  ) {
    const plugs = Object.entries(settings).filter(([key]) => {
      return key.indexOf('plug-') > -1;
    });

    if (plugs.length === 0) {
      return [];
    }

    const parsePlugs = plugs.reduce((all, [key, value]) => {
      const [_, name, identifier] = key.split('--');
      all[name] = all[name] || { name };
      all[name][identifier] = value;
      return all;
    }, {} as any);

    const list: {
      name: string;
      integrations: { id: string }[];
      delay: string;
      active: boolean;
    }[] = Object.values(parsePlugs);

    return (list || []).flatMap((trigger) => {
      return (trigger?.integrations || []).flatMap((int) => ({
        type: 'internal-plug',
        post: id,
        originalIntegration: integration.id,
        integration: int.id,
        plugName: trigger.name,
        orgId: orgId,
        delay: +trigger.delay,
        information: trigger,
      }));
    });
  }

  public async checkPlugs(
    orgId: string,
    providerName: string,
    integrationId: string
  ) {
    const loadAllPlugs = this._integrationManager.getAllPlugs();
    const getPlugs = await this._integrationService.getPlugs(
      orgId,
      integrationId
    );

    const currentPlug = loadAllPlugs.find((p) => p.identifier === providerName);

    return getPlugs
      .filter((plug) => {
        return currentPlug?.plugs?.some(
          (p: any) => p.methodName === plug.plugFunction
        );
      })
      .map((plug) => {
        const runPlug = currentPlug?.plugs?.find(
          (p: any) => p.methodName === plug.plugFunction
        )!;
        return {
          type: 'global',
          plugId: plug.id,
          delay: runPlug.runEveryMilliseconds,
          totalRuns: runPlug.totalRuns,
        };
      });
  }

  /**
   * Ends every run still going for a post: the one waiting for its publish
   * date, a repeat waiting for its next turn, and the plugs a finished run is
   * still processing (repeat runs are started with the same `postId`, so the
   * search finds them too). The empty catches are on purpose: failing to find
   * or end a run is normal, it may have just finished.
   */
  private async terminatePostWorkflows(postId: string) {
    try {
      const workflows = this._temporalService.client
        .getRawClient()
        ?.workflow.list({
          query: `postId="${postId}" AND ExecutionStatus="Running"`,
        });

      for await (const executionInfo of workflows) {
        try {
          const workflow = await this._temporalService.client.getWorkflowHandle(
            executionInfo.workflowId
          );
          if (
            workflow &&
            (await workflow.describe()).status.name !== 'TERMINATED'
          ) {
            await workflow.terminate();
          }
        } catch (err) {}
      }
    } catch (err) {}
  }

  async deletePost(orgId: string, group: string) {
    const post = await this._postRepository.deletePost(orgId, group);

    if (post?.id) {
      await this.terminatePostWorkflows(post.id);
    }

    return { error: true };
  }

  /**
   * Stops a published post from repeating. What it already published stays,
   * on the platform and here.
   *
   * Clearing the interval alone is not enough. A run reads the interval before
   * it publishes, and the one that published last is already waiting to start
   * the next repeat, which publishes without looking at the interval again. So
   * the runs still going for the post are ended, as deletePost ends them. That
   * also drops any plug still waiting on the last repeat, the same as a delete.
   * No workflow changes: the next repeat is simply never started.
   */
  async stopRepeat(orgId: string, group: string) {
    const post = await this._postRepository.getRootPostByGroup(orgId, group);
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Before it is published, the Repeat control in the editor clears it, and
    // ending the run here would cancel the first publish with it.
    if (post.state !== 'PUBLISHED') {
      throw new BadRequestException(
        'Only a published post can be stopped from repeating. Edit the post to change its repeat.'
      );
    }

    // Already stopped: nothing is waiting, and ending the runs would only
    // drop the plugs of a post that no longer repeats.
    if (!post.intervalInDays) {
      return { id: post.id };
    }

    await this._postRepository.stopRepeat(orgId, group);
    await this.terminatePostWorkflows(post.id);

    return { id: post.id };
  }

  /**
   * Deleting a channel takes its posts with it. `getPostsForChannel` has no
   * state filter, so that list is every group the channel ever had, and each
   * deletePost above costs two queries plus a Temporal visibility search and a
   * terminate per running workflow. Firing all of them at once exhausted the
   * Prisma pool on busy channels while the HTTP request sat there, so they run
   * a few at a time. Rejections are returned, not thrown: the channel delete
   * must still happen.
   */
  async deletePostsByGroups(orgId: string, groups: string[]) {
    const results: PromiseSettledResult<any>[] = [];
    const chunkSize = 5;

    for (let i = 0; i < groups.length; i += chunkSize) {
      results.push(
        ...(await Promise.allSettled(
          groups
            .slice(i, i + chunkSize)
            .map((group) => this.deletePost(orgId, group))
        ))
      );
    }

    return results;
  }

  async countPostsFromDay(orgId: string, date: Date) {
    return this._postRepository.countPostsFromDay(orgId, date);
  }

  getPostByForWebhookId(id: string, orgId: string, integrationId: string) {
    return this._postRepository.getPostByForWebhookId(id, orgId, integrationId);
  }

  async startWorkflow(
    taskQueue: string,
    postId: string,
    orgId: string,
    state: State
  ) {
    await this.terminatePostWorkflows(postId);

    if (state === 'DRAFT') {
      return;
    }

    try {
      await this._temporalService.client
        .getRawClient()
        ?.workflow.start('postWorkflowV1012', {
          workflowId: `post_${postId}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
          args: [
            {
              taskQueue: taskQueue,
              postId: postId,
              organizationId: orgId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: postId,
            },
            {
              key: organizationId,
              value: orgId,
            },
          ]),
        });
    } catch (err) {
      // Rethrown, not swallowed. This used to be `catch (err) {}`, which made
      // the failure unreportable *by construction*: `createPost` attaches a
      // `.catch` that reports to Sentry and logs, and that handler could never
      // run because this promise could never reject. An unreachable Temporal
      // therefore looked exactly like a successful schedule — HTTP 200, a row
      // in QUEUE, and nothing anywhere to say the post would never publish.
      //
      // The terminate sweep above (terminatePostWorkflows) keeps its empty
      // catches on purpose: failing to find or kill a previous execution is
      // normal, and the start below uses TERMINATE_EXISTING anyway.
      throw err;
    }
  }

  /**
   * Server-side validation that used to live on the client (`checkValidity` +
   * the manage modal loop). Runs the provider's settings DTO validation, the
   * provider `checkValidity` (media rules) and the empty-content / too-long
   * character checks. Returns one result per post so the frontend can show the
   * same toasts it did before — and so `/posts` can refuse to create invalid
   * posts.
   */
  /**
   * "Add a thread finisher" (X, Threads, Bluesky) was a setting nothing ever
   * published. When a post is saved it becomes the thread's last part, and the
   * switch is stored off so the next edit shows it as a normal part instead of
   * adding it again. validatePosts runs on the same result, so the part is
   * checked like any other. Finishers saved while the composer used a rich
   * editor are HTML already; plain text becomes one paragraph per line.
   */
  private withThreadFinisher(post: { value?: any[]; settings?: any }) {
    const settings = post.settings || {};
    const text = settings.active_thread_finisher
      ? String(settings.thread_finisher || '').trim()
      : '';
    if (!text) {
      return { value: post.value || [], settings };
    }

    // The rich editor always opened with a block tag; "<me>" in plain text
    // is not HTML.
    const html = /^<(p|div|h[1-6]|ul|ol|blockquote)\b/i.test(text)
      ? text
      : text
          .split('\n')
          .map((line) =>
            line.trim()
              ? `<p>${line
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')}</p>`
              : '<p></p>'
          )
          .join('');

    return {
      value: [
        ...(post.value || []),
        { id: makeId(10), content: html, image: [], delay: 0 },
      ],
      settings: { ...settings, active_thread_finisher: false },
    };
  }

  async validatePosts(
    orgId: string,
    posts: Array<{
      integration: { id: string };
      value: Array<{
        content?: string;
        image?: Array<{ path: string; thumbnail?: string }>;
      }>;
      settings?: any;
    }>
  ) {
    return Promise.all(
      (posts || []).map(async (post) => {
        // The same lookup as mapTypeToPost: a removed channel is refused here
        // too, instead of validating a post that could never be saved.
        const integration =
          await this._integrationService.getIntegrationByIdNotDeleted(
            orgId,
            post?.integration?.id
          );

        if (!integration) {
          throw new BadRequestException(
            `Integration with id ${post?.integration?.id} not found`
          );
        }

        const provider = this._integrationManager.getSocialIntegration(
          integration.providerIdentifier
        );

        let additionalSettings: any[] = [];
        try {
          additionalSettings = JSON.parse(
            integration.additionalSettings || '[]'
          );
        } catch {
          additionalSettings = [];
        }

        const settings = post.settings || {};
        const value = this.withThreadFinisher(post).value;
        const media = value.map((p) => p.image || []);
        // One stripped text per entry for the empty / too-long checks below.
        const texts = value.map((p) =>
          stripHtmlValidation('normal', p.content || '', true)
        );
        // And, for the provider's own rules, each entry exactly as the
        // publish activity will hand it over as `message`: stripped for the
        // provider's editor, plain text passed through as it came.
        const messages = value.map((p) =>
          stripHtmlValidation(
            provider.editor,
            p.content || '',
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(p.content || ''),
            provider.mentionFormat
          )
        );

        // Settings DTO validation — mirrors the client `form.trigger()`.
        let valid = true;
        let settingsError = '';
        let settingsErrorKey = '';
        if (provider?.dto) {
          const instance = plainToInstance(provider.dto, settings, {
            enableImplicitConversion: false,
          });
          const validationErrors = await validate(instance as object, {
            skipMissingProperties: false,
          });
          settingsError = this.firstValidationError(validationErrors);
          settingsErrorKey = this.firstValidationErrorKey(validationErrors);
          valid = validationErrors.length === 0;
        }

        // Provider-specific media validation (the old client `checkValidity`).
        let errors: string | true = true;
        try {
          errors = await provider.checkValidity(
            media,
            settings,
            additionalSettings,
            messages
          );
        } catch (err: any) {
          errors = err?.message || 'Invalid media';
        }

        const maximumCharacters = provider.maxLength(additionalSettings, settings);

        const emptyContent = value.some((a, index) => {
          const strip = texts[index];
          const length = countLength(integration.providerIdentifier, strip);
          return length === 0 && (a.image || []).length === 0;
        });

        const tooLong = texts.some((strip) => {
          const counted = countLength(integration.providerIdentifier, strip);
          return counted > (maximumCharacters || 1000000);
        });

        return {
          id: integration.id,
          identifier: integration.providerIdentifier,
          name: integration.name,
          valid,
          settingsError,
          // The setting the first error is about, so a client that built the
          // settings itself (the Copilot card) can say which key to add.
          settingsErrorKey,
          errors,
          emptyContent,
          tooLong,
          maximumCharacters,
        };
      })
    );
  }

  /** Returns the first class-validator message (incl. nested children), or ''. */
  private firstValidationError(errors: any[]): string {
    for (const e of errors || []) {
      if (e?.constraints) {
        return Object.values(e.constraints as Record<string, string>)[0] || '';
      }
      const child = e?.children?.length
        ? this.firstValidationError(e.children)
        : '';
      if (child) {
        return child;
      }
    }
    return '';
  }

  private firstValidationErrorKey(errors: any[]): string {
    for (const e of errors || []) {
      if (e?.constraints) {
        return String(e.property || '');
      }
      const child = e?.children?.length
        ? this.firstValidationErrorKey(e.children)
        : '';
      if (child) {
        return `${e.property}.${child}`;
      }
    }
    return '';
  }

  // A schedule-type save targeting an already-PUBLISHED post republishes it to
  // the platform: require the explicit `republish` opt-in instead. The message
  // doubles as the confirmation dialog for API/MCP automation.
  private guardAgainstRepublish(
    post: { state: State; publishDate: Date; integration?: { providerIdentifier: string } } | null,
    source: 'createPost' | 'changeDate'
  ) {
    if (post?.state !== 'PUBLISHED') {
      return;
    }

    const howToUpdate =
      source === 'createPost' ? `use type 'update'` : `use action 'update'`;

    throw new BadRequestException(
      `This post was already published on ${dayjs
        .utc(post.publishDate)
        .format('YYYY-MM-DD HH:mm')} UTC. Saving it this way would publish it again to ${
        post.integration?.providerIdentifier || 'the channel'
      }. To edit without republishing, ${howToUpdate}. To intentionally publish again, pass republish: true.`
    );
  }

  // An update changes a post that exists, named by the first entry of its
  // thread. The rows are upserted by id, so an id that matched nothing created
  // a new main post instead: in QUEUE, because an update leaves the state
  // alone, with no workflow started for it, and the hourly sweep then
  // published it. Only the first entry is checked: a comment added while
  // editing is new, and the composer gives it an id of its own making. Every
  // post is checked before any is written, so a refusal writes nothing.
  private async guardUpdateTargets(
    orgId: string,
    posts: CreatePostDto['posts']
  ) {
    for (const post of posts) {
      const id = post.value?.[0]?.id;
      const existing = id
        ? await this._postRepository.getPostById(id, orgId)
        : null;
      if (!existing || existing.deletedAt || existing.parentPostId) {
        throw new BadRequestException(
          `type 'update' changes an existing post: value[0].id must be the id of a post in this workspace (the main post, not a comment). To create a post, use type 'draft', 'schedule' or 'now'.`
        );
      }
    }
  }

  async createPost(
    orgId: string,
    body: CreatePostDto,
    creationMethod: CreationMethod,
    keepGroup = false
  ): Promise<any[]> {
    if (body.type === 'update') {
      await this.guardUpdateTargets(orgId, body.posts);
    }

    const postList = [];
    for (const post of body.posts) {
      if (
        (body.type === 'schedule' || body.type === 'now') &&
        !body.republish &&
        post.value?.[0]?.id
      ) {
        this.guardAgainstRepublish(
          await this._postRepository.getPostById(post.value[0].id, orgId),
          'createPost'
        );
      }
      const provider = this._integrationManager.getSocialIntegration(
        (post.settings as any)?.__type
      );
      const removeLinks = !!provider?.stripLinks?.();

      // A settings-only update promises the content stays as it is.
      if (body.type !== 'update') {
        const finished = this.withThreadFinisher(post);
        post.value = finished.value;
        post.settings = finished.settings;
      }

      const messages = (post.value || []).map((p) => p.content);
      // No point shortlinking links on platforms that strip them out anyway
      const updateContent =
        !body.shortLink || removeLinks
          ? messages
          : await this._shortLinkService.convertTextToShortLinks(
              orgId,
              messages
            );

      post.value = (post.value || []).map((p, i) => ({
        ...p,
        content: removeLinks ? stripLinks(updateContent[i]) : updateContent[i],
      }));

      // Media entries carrying an id but no path are resolved from the database
      // at publish time by id alone, so a borrowed id would pull another
      // organization's file into this post. Reject them at the door, where the
      // organization is still in scope.
      const borrowedMediaIds = [
        ...new Set(
          (post.value || [])
            .flatMap((p) => p.image || [])
            .filter((image: any) => image?.id && !image?.path)
            .map((image: any) => image.id as string)
        ),
      ];

      if (borrowedMediaIds.length) {
        const owned = await this._mediaService.findOwnedMediaIds(
          orgId,
          borrowedMediaIds
        );

        if (owned.length !== borrowedMediaIds.length) {
          throw new BadRequestException('Media not found');
        }
      }

      // The MCP tool, the CLI and the public API name media by path and make
      // up an id for it. A video still being converted is swapped for its
      // converted file at publish time by media id, so a made-up id leaves the
      // post pointing at the original, which is removed once the conversion
      // is done. Use the id of this organization's media row with that path.
      const mediaPaths = [
        ...new Set(
          (post.value || [])
            .flatMap((p) => p.image || [])
            .map((image: any) => image?.path)
            .filter(Boolean) as string[]
        ),
      ];

      if (mediaPaths.length) {
        const idByPath = new Map(
          (
            await this._mediaService.findOwnedMediaByPaths(orgId, mediaPaths)
          ).map((row) => [row.path, row.id])
        );

        post.value = (post.value || []).map((p) => ({
          ...p,
          image: (p.image || []).map((image: any) =>
            idByPath.has(image?.path)
              ? { ...image, id: idByPath.get(image.path) }
              : image
          ),
        }));

        // Publish reads a video's row by id as well, so an id left over
        // after that must be this organization's or no media row at all.
        const unmatchedIds = [
          ...new Set(
            (post.value || [])
              .flatMap((p) => p.image || [])
              .filter((image: any) => image?.id && !idByPath.has(image?.path))
              .map((image: any) => image.id as string)
          ),
        ];

        if (unmatchedIds.length) {
          const owned = (
            await this._mediaService.findOwnedMediaIds(orgId, unmatchedIds)
          ).map((row) => row.id);
          const foreign = await this._mediaService.getMediaByIds(
            unmatchedIds.filter((id) => !owned.includes(id))
          );

          if (foreign.length) {
            throw new BadRequestException('Media not found');
          }
        }
      }

      const { posts } = await this._postRepository.createOrUpdatePost(
        body.type,
        orgId,
        body.type === 'now' ? dayjs().format('YYYY-MM-DDTHH:mm:00') : body.date,
        post,
        body.tags,
        creationMethod,
        body.inter,
        keepGroup
      );

      if (!posts?.length) {
        return [] as any[];
      }

      if (body.type !== 'update') {
        // The row is already written, so a failure here does not undo the post:
        // it leaves it in QUEUE with nothing scheduled to publish it. Swallowing
        // that made an unreachable Temporal look exactly like a successful
        // schedule, so record it. The request still succeeds, because the post
        // does exist and can be rescheduled.
        this.startWorkflow(
          post.settings.__type.split('-')[0].toLowerCase(),
          posts[0].id,
          orgId,
          posts[0].state
        ).catch((err) => {
          Sentry.captureException(err, {
            tags: { area: 'post_workflow_start' },
            extra: { postId: posts[0].id, orgId },
          });
          console.error(
            `Could not start the publishing workflow for post ${posts[0].id}. It will not go out until it is rescheduled.`,
            err
          );
        });
      }

      // After the workflow has started, and never able to fail the save: a
      // highlight that outlives its text is cosmetic, a post with nothing
      // scheduled to publish it is not.
      const existingIds = (post.value || []).map((p) => p.id).filter(Boolean);
      await this.detachStaleAnchors(
        posts.filter((p) => existingIds.includes(p.id))
      ).catch((err) => {
        Sentry.captureException(err, {
          tags: { area: 'preview_comment_anchors' },
          extra: { postId: posts[0].id, orgId },
        });
      });

      Sentry.metrics.count('post_created', 1);
      postList.push({
        postId: posts[0].id,
        integration: post.integration.id,
      });
    }

    return postList;
  }

  // Update ONLY the provider settings of a not-yet-published post (scheduled or
  // draft). The passed keys are merged into the existing settings; content and
  // publish date stay as they are, so the running publish workflow is left
  // untouched (type "update"). Shared by the agent/MCP tool and the public API
  // PUT /posts/:id/settings so both go through one path.
  async updatePostSettings(
    orgId: string,
    postId: string,
    settings: Record<string, any>,
    creationMethod: CreationMethod
  ): Promise<{ postId: string; publishDate: string }> {
    // Ordered as post -> comments, root includes integration and tags.
    const ordered = await this.getPostsRecursively(postId, true, orgId, true);

    const [root] = ordered;
    if (!root) {
      throw new NotFoundException('Post not found');
    }

    if (root.parentPostId) {
      throw new BadRequestException(
        'This id belongs to a comment, pass the id of the main post'
      );
    }

    if (root.state !== 'QUEUE' && root.state !== 'DRAFT') {
      throw new BadRequestException(
        'Only scheduled posts that were not published yet (or drafts) can be updated'
      );
    }

    if (
      root.state === 'QUEUE' &&
      dayjs.utc(root.publishDate).isBefore(dayjs.utc())
    ) {
      throw new BadRequestException(
        'The publish time of this post already passed, it cannot be updated'
      );
    }

    const integration = (root as any).integration;

    let existingSettings: Record<string, any>;
    try {
      existingSettings = JSON.parse(root.settings || '{}');
    } catch (err) {
      existingSettings = {};
    }

    // Merge: only the passed keys change, everything else stays.
    const mergedSettings = {
      ...existingSettings,
      ...(settings || {}),
      __type: integration.providerIdentifier,
    };

    // Keep the existing content/ids so the posts are updated in place (the
    // workflow identity is preserved) - only the settings differ.
    const value = ordered.map((p) => {
      let image = [];
      try {
        image = JSON.parse(p.image || '[]');
      } catch (err) {}
      return {
        id: p.id,
        content: p.content,
        delay: p.delay || 0,
        image,
      };
    });

    // Same server-side validation as the dashboard / public create route.
    const [validation] = await this.validatePosts(orgId, [
      {
        integration: { id: integration.id },
        settings: mergedSettings,
        value: value.map((p) => ({ content: p.content, image: p.image })),
      },
    ]);

    if (validation.emptyContent) {
      throw new BadRequestException(
        `${validation.name}: Your post should have at least one character or one image.`
      );
    }

    if (root.state !== 'DRAFT') {
      if (!validation.valid) {
        throw new BadRequestException(
          `${validation.name}: ${
            validation.settingsError || 'Please fix your settings'
          }`
        );
      }

      if (validation.errors !== true) {
        throw new BadRequestException(
          `${validation.name}: ${validation.errors}`
        );
      }

      if (validation.tooLong) {
        throw new BadRequestException(
          `${validation.name}: The maximum characters is ${validation.maximumCharacters}`
        );
      }
    }

    const date = dayjs.utc(root.publishDate).format('YYYY-MM-DDTHH:mm:ss');

    const [output] = await this.createPost(
      orgId,
      {
        date,
        // Settings-only update: keep the current state and leave the running
        // publish workflow alone.
        type: 'update',
        shortLink: false,
        tags: ((root as any).tags || []).map((t: any) => ({
          value: t.tag.name,
          label: t.tag.name,
        })),
        posts: [
          {
            integration,
            group: root.group,
            settings: mergedSettings,
            value,
          },
        ],
      } as any,
      creationMethod,
      // Keep the group stable: a client may have the calendar open while the
      // settings are updated out of band, and the calendar links posts by group.
      true
    );

    if (!output) {
      throw new BadRequestException('Failed to update the post');
    }

    return {
      postId: output.postId,
      publishDate: date,
    };
  }

  async separatePosts(content: string, len: number) {
    return this._openaiService.separatePosts(content, len);
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    return this._postRepository.changeState(id, state, err, body);
  }

  async changePostStatus(
    orgId: string,
    id: string,
    status: 'draft' | 'schedule'
  ) {
    const getPostById = await this._postRepository.getPostById(id, orgId);
    if (!getPostById) {
      throw new BadRequestException('Post not found');
    }

    if (getPostById.state === 'PUBLISHED' || getPostById.state === 'ERROR') {
      throw new BadRequestException(
        'Cannot change status of a published or errored post'
      );
    }

    // A draft can be saved with settings the network would refuse. Queueing
    // it is the point where POST /posts would have checked them, so the same
    // rules run here, before a publishing workflow starts.
    if (status === 'schedule' && getPostById.state === 'DRAFT') {
      const post = await this.getPost(orgId, id);
      const [check] = await this.validatePosts(orgId, [
        {
          integration: { id: post.integration },
          value: post.posts.map((p) => ({ content: p.content, image: p.image })),
          settings: post.settings,
        },
      ]);

      let error = '';
      if (check.emptyContent) {
        error = 'Your post should have at least one character or one image.';
      } else if (!check.valid) {
        error = check.settingsError || 'Please fix your settings';
      } else if (check.errors !== true) {
        error = check.errors;
      } else if (check.tooLong) {
        error = 'post is too long, please fix it';
      }

      if (error) {
        throw new BadRequestException(`${check.name}: ${error}`);
      }
    }

    const state: State = status === 'draft' ? 'DRAFT' : 'QUEUE';

    // Idempotent: already a draft — skip Temporal churn.
    if (status === 'draft' && getPostById.state === 'DRAFT') {
      return { id, state };
    }

    if (status === 'draft') {
      await this._postRepository.setPostDraft(id);
    } else {
      await this._postRepository.changeState(id, state);
    }

    try {
      await this.startWorkflow(
        getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(),
        getPostById.id,
        orgId,
        state
      );
    } catch (err) {
      // The row has already moved to QUEUE, so a start failure here means a
      // post the user believes is scheduled with nothing scheduled to publish
      // it. Not fatal to the request — the hourly sweep can still pick it up
      // while it is inside the two-day window — but it must not be invisible.
      Sentry.captureException(err, {
        tags: { area: 'post_workflow_start', path: 'changePostStatus' },
        extra: { postId: id, orgId },
      });
      Logger.error(
        `Could not start the publishing workflow for post ${id} after a status change`,
        err as Error
      );
    }

    return { id, state };
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    action: 'schedule' | 'update' = 'schedule',
    republish = false
  ) {
    const getPostById = await this._postRepository.getPostById(id, orgId);

    // Calendar drag used to send action: 'schedule' for every drop. That
    // promotes DRAFT → QUEUE and starts Temporal, which publishes at once if
    // the slot is now or in the past (and emails the user on a provider
    // error). A draft stays a draft until the composer publishes it.
    if (getPostById?.state === 'DRAFT') {
      action = 'update';
    }

    // A `schedule` here clears releaseId/releaseURL, puts the row back in QUEUE
    // and starts the workflow — so on an already-published post it publishes
    // the same content to the customer's audience a second time. The only
    // thing standing in the way used to be a confirmation modal in the
    // calendar: a stale tab, a double drop, or any direct API call went
    // straight through, and if the new date was in the past the workflow slept
    // zero and posted immediately.
    //
    // Upstream's guard replaces the flat refusal we had here — it names the
    // platform and the original publish date, tells the caller how to edit
    // without republishing, and leaves a deliberate `republish: true` opt-in
    // for the case where publishing again is the actual intent.
    if (action === 'schedule' && !republish) {
      this.guardAgainstRepublish(getPostById, 'changeDate');
    }

    // schedule: Set status to QUEUE and change date (reschedule the post)
    // update: Just change the date without changing the status
    const newDate = await this._postRepository.changeDate(
      orgId,
      id,
      date,
      action
    );

    if (action === 'schedule') {
      try {
        // QUEUE / republish: the repository just set state to QUEUE.
        // Hard-code QUEUE so startWorkflow is not skipped.
        await this.startWorkflow(
          getPostById.integration.providerIdentifier
            .split('-')[0]
            .toLowerCase(),
          getPostById.id,
          orgId,
          'QUEUE'
        );
      } catch (err) {
        // Same reasoning as changePostStatus: the row says QUEUE, so a failed
        // start is a post nobody is going to publish. Report it.
        Sentry.captureException(err, {
          tags: { area: 'post_workflow_start', path: 'changeDate' },
          extra: { postId: id, orgId },
        });
        Logger.error(
          `Could not start the publishing workflow for post ${id} after a date change`,
          err as Error
        );
      }
    }

    return newDate;
  }

  async generatePostsDraft(orgId: string, body: CreateGeneratedPostsDto) {
    const getAllIntegrations = (
      await this._integrationService.getIntegrationsList(orgId)
    ).filter((f) => !f.disabled && f.providerIdentifier !== 'reddit');

    // const posts = chunk(body.posts, getAllIntegrations.length);
    const allDates = dayjs()
      .isoWeek(body.week)
      .year(body.year)
      .startOf('isoWeek');

    const dates = [...new Array(7)].map((_, i) => {
      return allDates.add(i, 'day').format('YYYY-MM-DD');
    });

    const findTime = (): string => {
      const totalMinutes = Math.floor(Math.random() * 144) * 10;

      // Convert total minutes to hours and minutes
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      // Format hours and minutes to always be two digits
      const formattedHours = hours.toString().padStart(2, '0');
      const formattedMinutes = minutes.toString().padStart(2, '0');
      const randomDate =
        shuffle(dates)[0] + 'T' + `${formattedHours}:${formattedMinutes}:00`;

      if (dayjs(randomDate).isBefore(dayjs())) {
        return findTime();
      }

      return randomDate;
    };

    for (const integration of getAllIntegrations) {
      for (const toPost of body.posts) {
        const group = makeId(10);
        const randomDate = findTime();

        await this.createPost(
          orgId,
          {
            type: 'draft',
            date: randomDate,
            order: '',
            shortLink: false,
            tags: [],
            posts: [
              {
                group,
                integration: {
                  id: integration.id,
                },
                settings: {
                  __type: integration.providerIdentifier as any,
                  title: '',
                  tags: [],
                  subreddit: [],
                },
                value: [
                  ...toPost.list.map((l) => ({
                    id: '',
                    content: l.post,
                    delay: 0,
                    image: [],
                  })),
                  {
                    id: '',
                    delay: 0,
                    content: `Check out the full story here:\n${
                      body.postId || body.url
                    }`,
                    image: [],
                  },
                ],
              },
            ],
          },
          'WEB'
        );
      }
    }
  }

  findAllExistingCategories() {
    return this._postRepository.findAllExistingCategories();
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._postRepository.findAllExistingTopicsOfCategory(category);
  }

  findPopularPosts(category: string, topic?: string) {
    return this._postRepository.findPopularPosts(category, topic);
  }

  async findFreeDateTime(orgId: string, integrationId?: string) {
    const findTimes = await this._integrationService.findFreeDateTime(
      orgId,
      integrationId
    );
    // getPostsCountsByDates returns `times.filter(...)`, so an empty `times`
    // answers empty for every date and the recursion below walks forward one
    // day at a time forever, one query per step. That is reachable from
    // /posts/find-slot/:id with any id that is unknown, disabled, deleted or
    // owned by another org — each request pins a connection and never answers.
    // Fall back to the same slots the column defaults to (schema.prisma
    // AutoPost/Integration postingTimes) so callers still get a sane time.
    const times = findTimes.length ? findTimes : [120, 400, 700];
    return this.findFreeDateTimeRecursive(
      orgId,
      times,
      dayjs.utc().startOf('day')
    );
  }

  /**
   * Create Post's default "when to post" — 1–4 hours from now on a quarter
   * hour, not the org postingTimes grid (02:00 / 06:40 UTC). Autopost and
   * `/posts/find-slot/:id` keep `findFreeDateTime`.
   */
  async findSoonDateTime(orgId: string) {
    const now = dayjs.utc();
    const { start, end } = soonWindow(now);
    const preferred = await this.firstFreeInRange(orgId, start, end);
    if (preferred) {
      return preferred;
    }
    const later = await this.firstFreeInRange(
      orgId,
      end.add(15, 'minute'),
      now.add(48, 'hour')
    );
    if (later) {
      return later;
    }
    return start.format('YYYY-MM-DDTHH:mm:00');
  }

  private async firstFreeInRange(
    orgId: string,
    from: dayjs.Dayjs,
    to: dayjs.Dayjs
  ): Promise<string | null> {
    for (const day of daysSpanning(from, to)) {
      const times = quarterHourMinutesOnDay(day, from, to);
      if (!times.length) {
        continue;
      }
      const free = await this._postRepository.getPostsCountsByDates(
        orgId,
        times,
        day
      );
      if (!free.length) {
        continue;
      }
      return day
        .clone()
        .add(Math.min(...free), 'minutes')
        .format('YYYY-MM-DDTHH:mm:00');
    }
    return null;
  }

  async createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._postRepository.createPopularPosts(post);
  }

  private async findFreeDateTimeRecursive(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs,
    // Backstop: the empty-times case is guarded at the entry point, but this
    // branch is also taken when every slot on a day is past or taken, so bound
    // the walk rather than trust that it always terminates.
    daysLeft = 365
  ): Promise<string> {
    const list = await this._postRepository.getPostsCountsByDates(
      orgId,
      times,
      date
    );

    if (!list.length) {
      if (daysLeft <= 0) {
        return date.clone().add(times[0] ?? 0, 'minutes').format('YYYY-MM-DDTHH:mm:00');
      }
      return this.findFreeDateTimeRecursive(
        orgId,
        times,
        date.add(1, 'day'),
        daysLeft - 1
      );
    }

    const num = list.reduce<null | number>((prev, curr) => {
      if (prev === null || prev > curr) {
        return curr;
      }
      return prev;
    }, null) as number;

    return date.clone().add(num, 'minutes').format('YYYY-MM-DDTHH:mm:00');
  }

  // `orgId` comes only through the signed-in route. Resolving belongs to the
  // team that owns the post, and the public page is not told which
  // organization that is.
  async getComments(previewId: string, orgId?: string) {
    const posts = await this.getPostsRecursively(previewId, false);
    const comments = await this._postRepository.getCommentsForPosts(
      posts.map((p) => p.id)
    );

    return {
      canResolve: !!orgId && posts[0]?.organizationId === orgId,
      comments: comments.map((comment) => ({
        id: comment.id,
        postId: comment.postId,
        parentId: comment.parentId,
        content: comment.content,
        anchorStart: comment.anchorStart,
        anchorEnd: comment.anchorEnd,
        anchorQuote: comment.anchorQuote,
        resolvedAt: comment.resolvedAt,
        createdAt: comment.createdAt,
        name: comment.userId
          ? [comment.user?.name, comment.user?.lastName]
              .filter(Boolean)
              .join(' ')
              .trim() || null
          : comment.displayName,
        // A typed name is not an account: the page marks it, so nobody can
        // pass as a member of the team by typing their name.
        guest: !comment.userId,
      })),
    };
  }

  async createPublicComment(
    previewId: string,
    body: CreatePublicCommentDto,
    userId: string | null
  ) {
    const posts = await this.getPostsRecursively(previewId, false);
    if (!posts.length) {
      throw new NotFoundException('Post not found');
    }

    let post = body.postId ? posts.find((p) => p.id === body.postId) : posts[0];
    if (!post) {
      throw new BadRequestException('Post does not belong to this preview');
    }

    if (!userId && !body.displayName?.trim()) {
      throw new BadRequestException('Name is required');
    }

    const hasStart = typeof body.anchorStart === 'number';
    const hasEnd = typeof body.anchorEnd === 'number';
    if (hasStart !== hasEnd) {
      throw new BadRequestException('Both anchor offsets are required');
    }

    if (body.parentId) {
      const parent = await this._postRepository.getCommentById(body.parentId);
      if (!parent || !posts.some((p) => p.id === parent.postId)) {
        throw new BadRequestException('Parent comment not found');
      }
      if (parent.parentId) {
        throw new BadRequestException(
          'Replies can only be added to a root comment'
        );
      }
      if (hasStart || body.anchorQuote) {
        throw new BadRequestException('Replies cannot be anchored');
      }
      post = posts.find((p) => p.id === parent.postId)!;
    }

    if (hasStart) {
      const plainText = postContentPlainText(post.content);
      if (
        body.anchorStart! < 0 ||
        body.anchorStart! >= body.anchorEnd! ||
        body.anchorEnd! > plainText.length
      ) {
        throw new BadRequestException('Anchor is out of range');
      }
      if (
        body.anchorQuote !== plainText.slice(body.anchorStart!, body.anchorEnd!)
      ) {
        throw new BadRequestException('Anchor does not match the post text');
      }
    }

    return this._postRepository.createComment(
      post.organizationId,
      userId,
      post.id,
      body.content,
      {
        displayName: userId ? undefined : body.displayName!.trim(),
        parentId: body.parentId,
        anchorStart: hasStart ? body.anchorStart : undefined,
        anchorEnd: hasStart ? body.anchorEnd : undefined,
        anchorQuote: hasStart ? body.anchorQuote : undefined,
      }
    );
  }

  async resolveComment(orgId: string, commentId: string, resolved: boolean) {
    const comment = await this._postRepository.getCommentById(commentId);
    if (!comment || comment.post.organizationId !== orgId) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.parentId) {
      throw new BadRequestException('Only root comments can be resolved');
    }

    return this._postRepository.setCommentResolved(
      commentId,
      resolved ? new Date() : null
    );
  }

  // Moderation for the team that owns the post, the same scope as resolving:
  // anyone with the link can comment, so someone has to be able to take a
  // comment down again.
  async deleteComment(orgId: string, commentId: string) {
    const comment = await this._postRepository.getCommentById(commentId);
    if (!comment || comment.post.organizationId !== orgId) {
      throw new NotFoundException('Comment not found');
    }

    await this._postRepository.deleteCommentThread(commentId);
    return { deleted: true };
  }

  // A comment anchored to a span of text keeps its quote but loses the
  // highlight once the span no longer reads the same on the new content.
  async detachStaleAnchors(posts: { id: string; content: string }[]) {
    for (const post of posts) {
      const anchored = await this._postRepository.getAnchoredCommentsForPost(
        post.id
      );
      if (!anchored.length) {
        continue;
      }

      const plainText = postContentPlainText(post.content);
      const stale = anchored
        .filter(
          (c) => c.anchorQuote !== plainText.slice(c.anchorStart!, c.anchorEnd!)
        )
        .map((c) => c.id);

      if (stale.length) {
        await this._postRepository.detachAnchorsForPost(post.id, stale);
      }
    }
  }

  getTags(orgId: string) {
    return this._postRepository.getTags(orgId);
  }

  createTag(orgId: string, body: CreateTagDto) {
    return this._postRepository.createTag(orgId, body);
  }

  editTag(id: string, orgId: string, body: CreateTagDto) {
    return this._postRepository.editTag(id, orgId, body);
  }

  deleteTag(id: string, orgId: string) {
    return this._postRepository.deleteTag(id, orgId);
  }
}
