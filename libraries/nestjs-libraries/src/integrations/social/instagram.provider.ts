import {
  AnalyticsData,
  AuthTokenDetails,
  NormalizedPostMetrics,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { mapInstagramMediaInsights, mapInstagramStoryInsights, insightTimeSeries } from '@gitroom/nestjs-libraries/integrations/social/post-metrics.map';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { parseMetaSignedRequest } from '@gitroom/nestjs-libraries/integrations/social/meta.signed.request';
import { timer } from '@gitroom/helpers/utils/timer';
import dayjs from 'dayjs';
import {
  BadBody,
  Disconnect,
  RefreshToken,
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';

// A story refuses the post metrics as a whole ("does not support the saved,
// likes, comments metric for this media product type") and has a set of its own.
const INSTAGRAM_POST_METRICS = 'views,reach,saved,likes,comments,shares';
const INSTAGRAM_STORY_METRICS = 'views,reach,shares,replies,total_interactions';

@Rules(
  "Instagram should have at least one attachment, if it's a story, each attachment is published as its own separate story"
)
export class InstagramProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'instagram';
  analyticsIntervals = [7, 30] as const;
  category = 'social' as const;
  name = 'Instagram\n(Facebook Business)';
  isBetweenSteps = true;
  toolTip = 'Instagram must be business and connected to a Facebook page';
  scopes = [
    'instagram_basic',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
  ];
  override maxConcurrentJob = 400;
  // Instagram publishes JPEG only; every other image format is converted
  // before it is handed over (posts.service updateMedia).
  convertToJPEG = true;
  editor = 'normal' as const;
  dto = InstagramDto;
  maxLength() {
    return 2200;
  }

  /**
   * The rules both Instagram tiles share, so the standalone one delegates here
   * the same way it delegates `handleErrors`: images the JPEG conversion can
   * read (sharp has no BMP decoder), and for a post or a reel at most 20 items
   * and Instagram's caps of 30 hashtags and 20 @mentions per caption. A story
   * publishes each item as its own story and carries no caption, so neither
   * cap applies to it. Feed photos must also sit between 4:5 and 1.91:1,
   * which stories and reels do not ask for.
   */
  async checkMediaAndCaption(
    media: ValidityMedia[],
    caption = '',
    postType?: string
  ): Promise<string | true> {
    if (media.some((m) => hasExtension(m?.path, 'bmp'))) {
      return 'Instagram only accepts JPEG images and BMP files cannot be converted, please use a JPEG or PNG';
    }
    if (postType === 'story') {
      return true;
    }
    // IG Media reference (v26.0): "Carousels can have up to 20 total
    // images, videos, or a mix".
    if (media.length > 20) {
      return 'Instagram carousels can have up to 20 photos or videos';
    }
    const hashtags = caption.match(/(^|[^\p{L}\p{N}_&])#[\p{L}\p{N}_]+/gu);
    if ((hashtags?.length ?? 0) > 30) {
      return 'Instagram allows up to 30 hashtags in a caption';
    }
    const mentions = caption.match(/(^|[^\p{L}\p{N}_.])@[A-Za-z0-9._]+/gu);
    if ((mentions?.length ?? 0) > 20) {
      return 'Instagram allows up to 20 @mentions in a caption';
    }
    if (postType === 'reel') {
      return true;
    }

    // Instagram refuses a feed photo outside 4:5 to 1.91:1 only when it
    // publishes (error 36003). The ratio is rounded to two decimals, so
    // 1200x628 still counts as 1.91:1. A file sharp cannot read is left for
    // Instagram to judge. An EXIF orientation of 5 or more shows the photo a
    // quarter turn round, so it is measured the way it is shown.
    const dimensions = await Promise.all(
      media.map((m) =>
        hasExtension(m?.path, 'mp4')
          ? undefined
          : this.getImageDimensions(m?.path).then(
              ({ width, height, orientation }) =>
                (orientation ?? 0) >= 5
                  ? { width: height, height: width }
                  : { width, height },
              () => undefined
            )
      )
    );
    const outside = dimensions.findIndex((d) => {
      if (!d?.width || !d?.height) {
        return false;
      }
      const ratio = Math.round((d.width / d.height) * 100) / 100;
      return ratio < 0.8 || ratio > 1.91;
    });
    if (outside > -1) {
      return `Image ${outside + 1} is ${dimensions[outside]?.width}x${
        dimensions[outside]?.height
      }. Instagram feed photos must be between 4:5 and 1.91:1. Crop the photo or post it as a story.`;
    }
    return true;
  }

  override async checkValidity(
    [firstPost]: Array<ValidityMedia[]>,
    settings: any,
    additionalSettings: any[],
    [caption]: string[] = []
  ): Promise<string | true> {
    if (!firstPost?.length) {
      return 'Should have at least one media';
    }
    const shared = await this.checkMediaAndCaption(
      firstPost,
      caption,
      settings?.post_type
    );
    if (shared !== true) {
      return shared;
    }
    if (settings?.post_type === 'reel') {
      if ((firstPost?.length ?? 0) !== 1) {
        return 'Reels must be a single video';
      }
      const reelVideo = firstPost?.some(
        (f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1
      );
      if (!reelVideo) {
        return 'Reels must be a video';
      }
    }
    if (this.assetBoolean(settings?.is_trial_reel)) {
      if ((firstPost?.length ?? 0) > 1) {
        return 'Trial Reels can only have one video';
      }
      const hasVideo = firstPost?.some(
        (f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1
      );
      if (!hasVideo) {
        return 'Trial Reels must be a video';
      }
    }
    if (settings?.audio?.id) {
      if (settings?.post_type === 'story') {
        return 'Audio can only be added to Reels, not to Stories';
      }
      if ((firstPost?.length ?? 0) > 1) {
        return 'Audio can only be added to a single video Reel';
      }
      const hasVideo = firstPost?.some(
        (f) => (f?.path?.indexOf?.('mp4') ?? -1) > -1
      );
      if (!hasVideo) {
        return 'Audio can only be added to a video Reel';
      }
    }
    return true;
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  public override handleErrors(
    body: string,
    status: number
  ):
    | {
        type: 'refresh-token' | 'bad-body' | 'retry' | 'disconnect';
        value: string;
      }
    | undefined {
    // Subcodes arrive in the JSON body ("error_subcode":2207001) and in a
    // failed container's status text ("error code 2207001"), so they are
    // matched as whole numbers, never inside a longer id.
    if (/\b2207081\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: "This account doesn't support Trial Reels",
      };
    }
    if (/\b2207078\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram Trial Reel publish limit reached for this account, please try again later or publish the post as a regular Reel',
      };
    }

    if (body.indexOf('REVOKED_ACCESS_TOKEN') > -1) {
      return {
        type: 'refresh-token' as const,
        value:
          "Instagram revoked this channel's access. Please reconnect the channel.",
      };
    }

    // Graph code 100, subcode 33: the object does not exist, cannot be loaded
    // due to missing permissions, or does not support this operation.
    if (/"error_subcode":33\b/.test(body)) {
      return {
        type: 'refresh-token' as const,
        value:
          'Instagram could not find this account or media, or this channel no longer has access to it. Please reconnect the channel.',
      };
    }

    if (
      body.toLowerCase().indexOf('the user is not an instagram business') > -1
    ) {
      return {
        type: 'refresh-token' as const,
        value:
          'Your Instagram account is not a professional (Business or Creator) account. Switch it in the Instagram app, then reconnect the channel.',
      };
    }

    if (body.toLowerCase().indexOf('session has been invalidated') > -1) {
      return {
        type: 'refresh-token' as const,
        value:
          'Your Instagram session ended, usually after a password change or a security check. Please reconnect the channel.',
      };
    }

    if (/\b2207050\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram has restricted this account. Open the Instagram app, complete any steps it shows, then try again.',
      };
    }

    // Media download/upload errors. Meta documents 2207003, 2207032 and
    // 2207008 as temporary ("try again"), and the failed call created
    // nothing, so the same request is sent again.
    if (/\b2207003\b/.test(body)) {
      return {
        type: 'retry' as const,
        value: 'Timeout downloading media, please try again',
      };
    }

    if (/\b2207020\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Media expired, please upload again',
      };
    }

    if (/\b2207032\b/.test(body)) {
      return {
        type: 'retry' as const,
        value: 'Failed to create media, please try again',
      };
    }

    if (/\b2207053\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Unknown upload error, please try again',
      };
    }

    if (/\b2207052\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram could not download the media file. Please try again. If it keeps failing, upload the file again.',
      };
    }

    if (/\b2207057\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid thumbnail offset for video',
      };
    }

    if (/\b2207026\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Unsupported video format',
      };
    }

    if (/\b2207023\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Unknown media type',
      };
    }

    if (/\b2207006\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Media not found, please upload again',
      };
    }

    if (/\b2207008\b/.test(body)) {
      return {
        type: 'retry' as const,
        value: 'Media builder expired, please try again',
      };
    }

    // Content validation errors
    if (/\b2207028\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Carousel validation failed',
      };
    }

    if (/\b2207010\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram captions allow 2,200 characters, 30 hashtags and 20 @ tags.',
      };
    }

    // Product tagging errors
    if (/\b2207035\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Product tag positions not supported for videos',
      };
    }

    if (/\b2207036\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Product tag positions required for photos',
      };
    }

    if (/\b2207037\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Product tag validation failed',
      };
    }

    if (/\b2207040\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Instagram allows up to 20 @ tags per post.',
      };
    }

    // Image format/size errors
    if (/\b2207004\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Instagram images must be 8 MB or smaller.',
      };
    }

    if (/\b2207005\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Unsupported image format',
      };
    }

    if (/\b2207009\b/.test(body) || /"code":36003\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram feed photos must be between 4:5 and 1.91:1. Crop the photo or post it as a story.',
      };
    }

    if (body.indexOf('Page request limit reached') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Page posting for today is limited, please try again tomorrow',
      };
    }

    if (/\b2207042\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'You have reached the maximum number of posts per day allowed for your account',
      };
    }

    if (body.indexOf('(#200)') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Facebook rejected the post due to missing permissions. Make sure your Facebook account has full content access to the Page linked to this Instagram account, then reconnect the channel.',
      };
    }

    if (body.indexOf('Not enough permissions to post') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Not enough permissions to post',
      };
    }

    // Meta put the account behind a checkpoint: the token is still valid, so a
    // refresh cannot help and every post fails until the user logs in on
    // Instagram and re-connects the channel.
    if (
      body.indexOf('You cannot access the app till you log in to') > -1 ||
      body.indexOf('Session key is malformed') > -1
    ) {
      return {
        type: 'disconnect' as const,
        value:
          'Instagram requires you to log in at instagram.com and follow its instructions before posting can resume. After that, please reconnect this channel.',
      };
    }

    // Code 190 is an expired or invalidated access token (Graph error
    // handling guide); the checkpoint case above arrives with it too.
    if (/"code":190\b/.test(body)) {
      return {
        type: 'refresh-token' as const,
        value:
          "Instagram ended this channel's session. Please reconnect the channel.",
      };
    }

    if (/\b2207051\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Instagram blocked your request',
      };
    }

    if (/\b2207001\b/.test(body)) {
      return {
        type: 'retry' as const,
        value:
          'Instagram had a temporary server problem. Please try again in a few minutes.',
      };
    }

    if (/\b2207082\b/.test(body)) {
      return {
        type: 'retry' as const,
        value:
          'Instagram could not process this video. If you attached audio to a video that has no sound track, set the original video volume to 0 and try again',
      };
    }

    if (/\b2207085\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Instagram could not process the video, please check the video format, duration and resolution and try again',
      };
    }

    if (/\b2207077\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value: 'Instagram Video download failed',
      };
    }

    if (body.indexOf('too little or too many attachments') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'An Instagram carousel needs 2 to 20 photos or videos.',
      }
    }

    // The container is not finished yet: publishing it again shortly after
    // is what Meta asks for.
    if (/\b2207027\b/.test(body)) {
      return {
        type: 'retry' as const,
        value:
          'Instagram is still processing the media. Please try again in a minute.',
      };
    }

    if (body.indexOf('param collaborators is not allowed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Collaborators are not allowed for carousel',
      };
    }

    // Graph rate limits: application (4), user (17), application limit
    // (341), API calls (613) and the Instagram business use case (80002).
    if (/"code":(4|17|341|613|80002)\b/.test(body)) {
      return {
        type: 'bad-body' as const,
        value:
          'Meta is limiting requests for this channel right now. Wait an hour, then try again.',
      };
    }

    // Broadest check last, so a known subcode sent with this generic message
    // keeps its own answer.
    if (body.indexOf('An unknown error occurred') > -1) {
      return {
        type: 'retry' as const,
        value: 'An unknown error occurred, please try again later',
      };
    }

    return undefined;
  }

  async reConnect(
    id: string,
    requiredId: string,
    token: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const [accessToken, userToken] = token.split('___');
    const findPage = (await this.pages(accessToken)).find(
      (p) => p.id === requiredId
    );

    const information = await this.fetchPageInformation(accessToken, {
      id: requiredId,
      pageId: findPage?.pageId!,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url:
        `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth` +
        `?client_id=${process.env.FACEBOOK_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(
          `${process.env.FRONTEND_URL}/integrations/social/instagram`
        )}` +
        `&state=${state}` +
        `&scope=${encodeURIComponent(this.scopes.join(','))}`,
      codeVerifier: makeId(10),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh: string;
  }) {
    const getAccessToken = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token` +
          `?client_id=${process.env.FACEBOOK_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(
            `${process.env.FRONTEND_URL}/integrations/social/instagram${
              params.refresh ? `?refresh=${params.refresh}` : ''
            }`
          )}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&code=${params.code}`
      )
    ).json();

    const { access_token, expires_in, ...all } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token` +
          '?grant_type=fb_exchange_token' +
          `&client_id=${process.env.FACEBOOK_APP_ID}` +
          `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
          `&fb_exchange_token=${getAccessToken.access_token}`
      )
    ).json();

    const { data } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/permissions?access_token=${access_token}`
      )
    ).json();

    const permissions = data
      .filter((d: any) => d.status === 'granted')
      .map((p: any) => p.permission);
    this.checkScopes(this.scopes, permissions);

    const { id, name, picture } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me?fields=id,name,picture.type(large)&access_token=${access_token}`
      )
    ).json();

    return {
      id,
      name,
      accessToken: access_token,
      refreshToken: access_token,
      expiresIn: dayjs().add(59, 'days').unix() - dayjs().unix(),
      picture: picture?.data?.url || '',
      username: '',
      // The account picked next gets its own internalId; this is the person.
      platformUserId: id,
    };
  }

  async verifyPlatformCallback(signedRequest: string) {
    return parseMetaSignedRequest(
      signedRequest,
      process.env.FACEBOOK_APP_SECRET
    );
  }

  async pages(token: string) {
    const [accessToken, userToken] = token.split('___');
    const seenPageIds = new Set<string>();
    const allFacebookPages: any[] = [];

    const fetchPaginated = async (startUrl: string) => {
      let nextUrl: string | undefined = startUrl;
      while (nextUrl) {
        const response = await (await fetch(nextUrl)).json();
        if (response.data) {
          for (const page of response.data) {
            if (!seenPageIds.has(page.id)) {
              seenPageIds.add(page.id);
              allFacebookPages.push(page);
            }
          }
        }
        nextUrl = response.paging?.next;
      }
    };

    // Fetch pages the user explicitly shared during the OAuth dialog
    await fetchPaginated(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/accounts?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
    );

    // Also fetch pages via Business Manager API to discover pages
    // not selected during the OAuth page selection step
    try {
      let bizUrl:
        | string
        | undefined = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/businesses?access_token=${accessToken}`;

      while (bizUrl) {
        const bizResponse = await (await fetch(bizUrl)).json();
        if (bizResponse.data) {
          for (const business of bizResponse.data) {
            try {
              await fetchPaginated(
                `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${business.id}/owned_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
              );
            } catch {
              // Continue with other businesses
            }

            try {
              await fetchPaginated(
                `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${business.id}/client_pages?fields=id,instagram_business_account,username,name,picture.type(large)&limit=100&access_token=${accessToken}`
              );
            } catch {
              // Continue with other businesses
            }
          }
        }
        bizUrl = bizResponse.paging?.next;
      }
    } catch {
      // Business Manager API not available for all users
    }

    const onlyConnectedAccounts = await Promise.all(
      allFacebookPages
        .filter((f: any) => f.instagram_business_account)
        .map(async (p: any) => {
          return {
            pageId: p.id,
            ...(await (
              await fetch(
                `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${p.instagram_business_account.id}?fields=name,profile_picture_url&access_token=${accessToken}`
              )
            ).json()),
            id: p.instagram_business_account.id,
          };
        })
    );

    return onlyConnectedAccounts.map((p: any) => ({
      pageId: p.pageId,
      id: p.id,
      name: p.name,
      picture: { data: { url: p.profile_picture_url } },
    }));
  }

  async fetchPageInformation(
    token: string,
    data: { pageId: string; id: string }
  ) {
    const [accessToken, userToken] = token.split('___');
    const { access_token, ...all } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${data.pageId}?fields=access_token,name,picture.type(large)&access_token=${accessToken}`
      )
    ).json();

    const { id, name, profile_picture_url, username } = await (
      await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${data.id}?fields=username,name,profile_picture_url&access_token=${accessToken}`
      )
    ).json();

    return {
      id,
      name,
      picture: profile_picture_url,
      access_token: access_token + '___' + accessToken,
      username,
    };
  }

  // Instagram rejects collaborator handles that carry a leading @ with
  // error_subcode 2207018, and the tag input stores whatever the user typed.
  private stripHandle(handle: string) {
    return handle.replace(/^@+/, '');
  }

  // Single, read-only status check of a media container - the polling loops
  // that used to live inside post() are now driven by the post workflow.
  private async igContainerStatus(
    containerId: string,
    checkToken: string,
    type: string
  ): Promise<string> {
    const { status_code, status } = await (
      await this.fetch(
        `https://${type}/${META_GRAPH_API_VERSION}/${containerId}?access_token=${checkToken}&fields=status_code,status`,
        undefined,
        '',
        0,
        true
      )
    ).json();

    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      const handleError = this.handleErrors(status || '', 200);
      if (handleError?.type === 'disconnect') {
        throw new Disconnect(
          this.identifier,
          JSON.stringify({ status_code, status }),
          '{}',
          handleError?.value
        );
      }
      throw new BadBody(
        this.identifier,
        JSON.stringify({ status_code, status }),
        '{}',
        handleError?.value || status || 'Instagram could not process the media'
      );
    }

    return status_code;
  }

  // The post is live, the permalink is only cosmetic: never fail (and risk
  // re-publishing) a live post over it.
  private async igPermalink(
    mediaId: string,
    checkToken: string,
    type: string,
    integration: Integration
  ): Promise<string> {
    try {
      const { permalink } = await (
        await this.fetch(
          `https://${type}/${META_GRAPH_API_VERSION}/${mediaId}?fields=permalink&access_token=${checkToken}`
        )
      ).json();
      return permalink;
    } catch (err) {
      return `https://www.instagram.com/${integration.profile}`;
    }
  }

  async postPending(
    id: string,
    token: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration,
    type = 'graph.facebook.com'
  ): Promise<PostResponse[]> {
    const [accessToken] = token.split('___');
    const [firstPost] = postDetails;
    const isStory = firstPost.settings.post_type === 'story';
    const collaborators =
      firstPost?.settings?.collaborators?.length && !isStory
        ? `&collaborators=${encodeURIComponent(
            JSON.stringify(
              firstPost?.settings?.collaborators.map((p) =>
                this.stripHandle(p.label)
              )
            )
          )}`
        : ``;
    const isTrialReel = this.assetBoolean(firstPost.settings.is_trial_reel);
    const medias = await Promise.all(
      firstPost?.media?.map(async (m) => {
        const caption =
          firstPost.media?.length === 1
            ? `&caption=${encodeURIComponent(firstPost.message)}`
            : ``;
        const isCarousel =
          (firstPost?.media?.length || 0) > 1 && !isStory
            ? `&is_carousel_item=true`
            : ``;
        const mediaType = hasExtension(m.path, 'mp4')
          ? firstPost?.media?.length === 1
            ? isStory
              ? `video_url=${m.path}&media_type=STORIES`
              : m?.thumbnail
              ? `video_url=${m.path}&media_type=REELS&cover_url=${encodeURIComponent(
                  m.thumbnail
                )}`
              : `video_url=${m.path}&media_type=REELS&thumb_offset=${
                  m?.thumbnailTimestamp || 0
                }`
            : isStory
            ? `video_url=${m.path}&media_type=STORIES`
            : `video_url=${m.path}&media_type=VIDEO&thumb_offset=${
                m?.thumbnailTimestamp || 0
              }`
          : isStory
          ? `image_url=${m.path}&media_type=STORIES`
          : `image_url=${m.path}`;

        const trialParams = isTrialReel
          ? `&trial_params=${encodeURIComponent(
              JSON.stringify({
                graduation_strategy:
                  firstPost.settings.graduation_strategy || 'MANUAL',
              })
            )}`
          : ``;

        // collaborators are not allowed on carousel child items,
        // they go on the carousel container instead
        const itemCollaborators =
          firstPost?.media?.length === 1 ? collaborators : ``;

        // audio_configuration is only supported for Reels (single video, not a story)
        // and only with Facebook Login (not Instagram Login / graph.instagram.com)
        const audioConfiguration =
          firstPost?.settings?.audio?.id &&
          type === 'graph.facebook.com' &&
          !isStory &&
          firstPost?.media?.length === 1 &&
          hasExtension(m.path, 'mp4')
            ? `&audio_configuration=${encodeURIComponent(
                JSON.stringify({
                  audio_id: firstPost.settings.audio.id,
                  ...(typeof firstPost.settings.audio.audio_volume !==
                  'undefined'
                    ? { audio_volume: +firstPost.settings.audio.audio_volume }
                    : {}),
                  ...(typeof firstPost.settings.audio.video_volume !==
                  'undefined'
                    ? { video_volume: +firstPost.settings.audio.video_volume }
                    : {}),
                })
              )}`
            : ``;

        const { id: photoId } = await (
          await this.fetch(
            `https://${type}/${META_GRAPH_API_VERSION}/${id}/media?${mediaType}${isCarousel}${itemCollaborators}${trialParams}${audioConfiguration}&access_token=${accessToken}${caption}`,
            {
              method: 'POST',
            }
          )
        ).json();

        return photoId;
      }) || []
    );

    // Containers are invisible until media_publish runs: the processing wait
    // and the publish itself move to checkPostStatus / finalizePost so a
    // failure there can never re-create (and re-publish) the whole post.
    return [
      {
        id: firstPost.id,
        postId: '',
        releaseURL: '',
        status: 'pending',
        pendingData: {
          type,
          postType:
            isStory && medias.length > 1
              ? 'stories'
              : medias.length === 1
              ? 'single'
              : 'carousel',
          containers: medias,
          message: firstPost?.message || '',
          ...(collaborators
            ? {
                collaborators: firstPost.settings.collaborators!.map((p) =>
                  this.stripHandle(p.label)
                ),
              }
            : {}),
        },
      },
    ];
  }

  override async checkPostStatus(
    token: string,
    pendingData: {
      type: string;
      postType: 'stories' | 'single' | 'carousel';
      containers: string[];
      message?: string;
      carouselId?: string;
      collaborators?: string[];
    },
    integration: Integration
  ): Promise<PendingCheckResponse> {
    const [accessToken, userToken] = token.split('___');
    const checkToken = userToken || accessToken;

    // the carousel container was already created: wait for it
    if (pendingData.carouselId) {
      const status = await this.igContainerStatus(
        pendingData.carouselId,
        checkToken,
        pendingData.type
      );

      if (status === 'IN_PROGRESS') {
        return { status: 'pending', pendingData };
      }

      // a previous finalizePost published but died before reporting: the post
      // is live, never publish again
      if (status === 'PUBLISHED') {
        return {
          status: 'completed',
          postId: pendingData.carouselId,
          releaseURL: `https://www.instagram.com/${integration.profile}`,
        };
      }

      return { status: 'ready', pendingData };
    }

    for (const containerId of pendingData.containers) {
      const status = await this.igContainerStatus(
        containerId,
        checkToken,
        pendingData.type
      );

      if (status === 'IN_PROGRESS') {
        return { status: 'pending', pendingData };
      }

      if (status === 'PUBLISHED') {
        // a previous finalizePost died mid-way: a single post is fully live,
        // stories are resumed by finalizePost (it skips published containers)
        if (pendingData.postType === 'single') {
          return {
            status: 'completed',
            postId: containerId,
            releaseURL: `https://www.instagram.com/${integration.profile}`,
          };
        }
      }
    }

    return { status: 'ready', pendingData };
  }

  override async finalizePost(
    token: string,
    pendingData: {
      type: string;
      postType: 'stories' | 'single' | 'carousel';
      containers: string[];
      message?: string;
      carouselId?: string;
      collaborators?: string[];
    },
    integration: Integration
  ): Promise<PendingCheckResponse> {
    const [accessToken, userToken] = token.split('___');
    const checkToken = userToken || accessToken;
    const igId = integration.internalId;

    if (pendingData.postType === 'stories') {
      // Stories don't support carousels - publish each media as a separate
      // story, skipping containers a previous (crashed) run already published
      let lastMediaId = '';
      for (const mediaCreationId of pendingData.containers) {
        const status = await this.igContainerStatus(
          mediaCreationId,
          checkToken,
          pendingData.type
        );
        if (status === 'PUBLISHED') {
          continue;
        }

        const { id: mediaId } = await (
          await this.fetch(
            `https://${pendingData.type}/${META_GRAPH_API_VERSION}/${igId}/media_publish?creation_id=${mediaCreationId}&access_token=${accessToken}&field=id`,
            {
              method: 'POST',
            }
          )
        ).json();
        lastMediaId = mediaId;
      }

      return {
        status: 'completed',
        postId: lastMediaId || pendingData.containers.at(-1)!,
        releaseURL: !lastMediaId
          ? `https://www.instagram.com/${integration.profile}`
          : await this.igPermalink(
              lastMediaId,
              checkToken,
              pendingData.type,
              integration
            ),
      };
    }

    if (pendingData.postType === 'carousel' && !pendingData.carouselId) {
      // create the carousel container and hand back to the workflow to wait
      // for it (an orphan container from a crashed run is invisible, so
      // re-running this is safe)
      const { id: containerId } = await (
        await this.fetch(
          `https://${pendingData.type}/${META_GRAPH_API_VERSION}/${igId}/media?caption=${encodeURIComponent(
            pendingData.message || ''
          )}&media_type=CAROUSEL&children=${encodeURIComponent(
            pendingData.containers.join(',')
          )}${
            pendingData.collaborators?.length
              ? `&collaborators=${encodeURIComponent(
                  JSON.stringify(pendingData.collaborators)
                )}`
              : ``
          }&access_token=${accessToken}`,
          {
            method: 'POST',
          }
        )
      ).json();

      return {
        status: 'pending',
        pendingData: { ...pendingData, carouselId: containerId },
      };
    }

    const creationId =
      pendingData.postType === 'carousel'
        ? pendingData.carouselId
        : pendingData.containers[0];

    const { id: mediaId } = await (
      await this.fetch(
        `https://${pendingData.type}/${META_GRAPH_API_VERSION}/${igId}/media_publish?creation_id=${creationId}&access_token=${accessToken}&field=id`,
        {
          method: 'POST',
        }
      )
    ).json();

    return {
      status: 'completed',
      postId: mediaId,
      releaseURL: await this.igPermalink(
        mediaId,
        checkToken,
        pendingData.type,
        integration
      ),
    };
  }

  // Old blocking behavior, kept for workflow versions before v1.0.6 that don't
  // know how to resolve a `pending` response.
  async post(
    id: string,
    token: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration,
    type = 'graph.facebook.com'
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const [response] = await this.postPending(
      id,
      token,
      postDetails,
      integration,
      type
    );

    let pendingData = response.pendingData;
    const started = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Cap below the 10-minute activity timeout of the old workflows using
      // this method: failing here (non-retryable) is safe, timing the
      // activity out is not - a retried activity would publish again.
      if (Date.now() - started > 8 * 60 * 1000) {
        throw new BadBody(
          this.identifier,
          '{}',
          '{}',
          'Media processing timed out'
        );
      }

      const check = await this.checkPostStatus(token, pendingData, integration);

      if (check.status === 'pending') {
        pendingData = check.pendingData;
        await timer(30000);
        continue;
      }

      const result =
        check.status === 'ready'
          ? await this.finalizePost(token, check.pendingData, integration)
          : check;

      if (result.status === 'completed') {
        return [
          {
            id: firstPost.id,
            postId: result.postId,
            releaseURL: result.releaseURL,
            status: 'success',
          },
        ];
      }

      pendingData = result.pendingData;
      await timer(30000);
    }
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    token: string,
    postDetails: PostDetails<InstagramDto>[],
    integration: Integration,
    type = 'graph.facebook.com'
  ): Promise<PostResponse[]> {
    const [accessToken, userToken] = token.split('___');
    const [commentPost] = postDetails;

    const { id: commentId } = await (
      await this.fetch(
        `https://${type}/${META_GRAPH_API_VERSION}/${postId}/comments?message=${encodeURIComponent(
          commentPost.message
        )}&access_token=${accessToken}`,
        {
          method: 'POST',
        }
      )
    ).json();

    // Get the permalink from the parent post
    const { permalink } = await (
      await this.fetch(
        `https://${type}/${META_GRAPH_API_VERSION}/${postId}?fields=permalink&access_token=${
          userToken || accessToken
        }`
      )
    ).json();

    return [
      {
        id: commentPost.id,
        postId: commentId,
        releaseURL: permalink,
        status: 'success',
      },
    ];
  }

  private setTitle(name: string) {
    switch (name) {
      case 'likes': {
        return 'Likes';
      }

      case 'followers': {
        return 'Followers';
      }

      case 'reach': {
        return 'Reach';
      }

      // New followers per day, not the account's total.
      case 'follower_count': {
        return 'New Followers';
      }

      case 'views': {
        return 'Views';
      }

      case 'comments': {
        return 'Comments';
      }

      case 'shares': {
        return 'Shares';
      }

      case 'saves': {
        return 'Saves';
      }

      case 'replies': {
        return 'Replies';
      }
    }

    return '';
  }

  async analytics(
    id: string,
    token: string,
    date: number,
    type = 'graph.facebook.com'
  ): Promise<AnalyticsData[]> {
    const [accessToken, userToken] = token.split('___');
    const until = dayjs().startOf('day').unix();
    const since = dayjs().subtract(date, 'day').unix();

    const firstResponse = await fetch(
      `https://${type}/${META_GRAPH_API_VERSION}/${id}/insights?metric=follower_count,reach&access_token=${accessToken}&period=day&since=${since}&until=${until}`
    );
    const first = await firstResponse.json();
    this.throwIfCannotFetch(first, firstResponse.status);
    const { data } = first;

    const secondResponse = await fetch(
      `https://${type}/${META_GRAPH_API_VERSION}/${id}/insights?metric_type=total_value&metric=likes,views,comments,shares,saves,replies&access_token=${accessToken}&period=day&since=${since}&until=${until}`
    );
    const second = await secondResponse.json();
    this.throwIfCannotFetch(second, secondResponse.status);
    const { data: data2 } = second;
    const analytics = [];

    analytics.push(
      ...((Array.isArray(data) ? data : []) as any[])
        .filter(
          (d) => d && (Array.isArray(d.values) || d.total_value?.value != null)
        )
        .map((d: any) => ({
          label: this.setTitle(d.name),
          // Daily reach counts unique accounts per day, so a sum of days
          // counts the same account again each day; show the daily average.
          ...(d.name === 'reach' && Array.isArray(d.values)
            ? {
                label: 'Average Daily Reach',
                average: true,
                unit: 'count' as const,
              }
            : {}),
          percentageChange: 5,
          data: Array.isArray(d.values)
            ? d.values.map((v: any) => ({
                total: v?.value ?? 0,
                date: dayjs(v?.end_time).format('YYYY-MM-DD'),
              }))
            : [
                {
                  total: d.total_value.value,
                  date: dayjs().format('YYYY-MM-DD'),
                },
              ],
        }))
    );

    analytics.push(
      ...((Array.isArray(data2) ? data2 : []) as any[])
        .filter((d) => d?.total_value?.value != null)
        .map((d: any) => ({
          label: this.setTitle(d.name),
          percentageChange: 5,
          data: [
            {
              total: d.total_value.value,
              date: dayjs().format('YYYY-MM-DD'),
            },
          ],
        }))
    );

    return analytics;
  }

  music(accessToken: string, data: { q: string }) {
    return this.fetch(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/music/search?q=${encodeURIComponent(
        data.q
      )}&access_token=${accessToken}`
    );
  }

  // https://developers.facebook.com/docs/instagram-platform/content-publishing/audio-api/
  // empty search_query returns trending audio
  @Tool({
    description:
      'Search audio (music or original sounds) to attach to a Reel via the "audio" setting, an empty query returns trending audio',
    dataSchema: [
      {
        key: 'q',
        type: 'string',
        description: 'Search query, leave empty for trending audio',
      },
      {
        key: 'type',
        type: 'string',
        description: 'Either "music" or "original_sound", defaults to "music"',
      },
    ],
  })
  async audioSearch(
    token: string,
    data: { q?: string; type?: 'music' | 'original_sound' },
    internalId?: string
  ) {
    const [accessToken, userToken] = token.split('___');
    const audioType =
      data?.type === 'original_sound' ? 'original_sound' : 'music';

    const { audio } = await (
      await this.fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/ig_audio?audio_type=${audioType}&user_id=${internalId}${
          data?.q ? `&search_query=${encodeURIComponent(data.q)}` : ''
        }&access_token=${userToken || accessToken}`
      )
    ).json();

    return (audio || []).map((audio: any) => ({
      id: audio.audio_id,
      title: audio.title || '',
      artist: audio.display_artist || audio.ig_username || '',
      image:
        audio.cover_artwork_thumbnail_uri ||
        audio.cover_artwork_thumbnail_url ||
        audio.profile_picture_url ||
        '',
      duration: audio.duration_in_ms || 0,
      previewUrl: audio.download_url || '',
    }));
  }

  async postAnalytics(
    integrationId: string,
    token: string,
    postId: string,
    date: number,
    type = 'graph.facebook.com'
  ): Promise<AnalyticsData[]> {
    const [accessToken, userToken] = token.split('___');
    const today = dayjs().format('YYYY-MM-DD');

    try {
      // Fetch media insights from Instagram Graph API
      const insights = async (metrics: string) =>
        (
          await fetch(
            `https://${type}/${META_GRAPH_API_VERSION}/${postId}/insights?metric=${metrics}&access_token=${accessToken}`
          )
        ).json();
      const first = await insights(INSTAGRAM_POST_METRICS);
      let { data } = first;
      // A story: ask again with its own set, as postsAnalytics does.
      if ((first.error?.message || '').indexOf('for this media product type') > -1) {
        ({ data } = await insights(INSTAGRAM_STORY_METRICS));
      }

      if (!data || data.length === 0) {
        return [];
      }

      const result: AnalyticsData[] = [];

      for (const metric of data) {
        const dataPoints = insightTimeSeries(metric.values, today);
        if (!dataPoints.length) continue;

        let label = '';

        switch (metric.name) {
          case 'views':
            label = 'Views';
            break;
          case 'reach':
            label = 'Reach';
            break;
          case 'engagement':
            label = 'Engagement';
            break;
          case 'saved':
            label = 'Saves';
            break;
          case 'likes':
            label = 'Likes';
            break;
          case 'comments':
            label = 'Comments';
            break;
          case 'shares':
            label = 'Shares';
            break;
          case 'replies':
            label = 'Replies';
            break;
          case 'total_interactions':
            label = 'Interactions';
            break;
        }

        if (label) {
          result.push({
            label,
            percentageChange: 0,
            data: dataPoints,
          });
        }
      }

      return result;
    } catch (err) {
      console.error('Error fetching Instagram post analytics:', err);
      return [];
    }
  }

  // Instagram deletes a story 24 hours after it goes up. From then on Graph
  // answers its insights with "does not exist", so there is nothing to ask.
  postMetricsAvailable(post: {
    settings: Record<string, any>;
    publishDate: Date;
  }): boolean {
    return !(
      post.settings?.post_type === 'story' &&
      dayjs(post.publishDate).add(24, 'hour').isBefore(dayjs())
    );
  }

  async postsAnalytics(
    integrationId: string,
    token: string,
    platformPostIds: string[],
    type = 'graph.facebook.com'
  ): Promise<NormalizedPostMetrics[]> {
    const [accessToken] = token.split('___');
    const rows: NormalizedPostMetrics[] = [];

    for (const postId of platformPostIds) {
      try {
        const insights = async (metrics: string) =>
          (
            await this.fetch(
              `https://${type}/${META_GRAPH_API_VERSION}/${postId}/insights?metric=${metrics}&access_token=${accessToken}`,
              {},
              this.identifier
            )
          ).json();
        let story = false;
        let data: any[] | undefined;
        try {
          ({ data } = await insights(INSTAGRAM_POST_METRICS));
        } catch (err) {
          // A story's own set is asked only after that refusal, so a post or
          // reel still costs one request.
          if (
            String((err as any)?.details?.[0]?.json ?? '').indexOf(
              'for this media product type'
            ) === -1
          ) {
            throw err;
          }
          story = true;
          ({ data } = await insights(INSTAGRAM_STORY_METRICS));
        }
        if (!data || data.length === 0) {
          continue;
        }
        rows.push(
          story
            ? mapInstagramStoryInsights(postId, data)
            : mapInstagramMediaInsights(postId, data)
        );
      } catch (err) {
        const json = String((err as any)?.details?.[0]?.json ?? '');
        // A story is deleted 24 hours after it goes up, and Graph answers its
        // insights with subcode 33 "does not exist". handleErrors maps every
        // subcode 33 to refresh-token for publishing, so each expired story
        // flagged a working channel for reconnect and stopped its queue.
        // The media is gone, not the token: skip it, as facebook.provider does.
        if (
          /"error_subcode":33\b/.test(json) &&
          json.indexOf('does not exist') > -1
        ) {
          continue;
        }
        if (err instanceof RefreshToken || err instanceof Disconnect) {
          throw err;
        }
        // Graph withholds insights from media seen by too few accounts. That
        // is a quiet post, not an error worth a stack trace on every sync.
        if (json.indexOf('Not enough viewers') > -1) {
          continue;
        }
        console.error('Error fetching Instagram posts analytics:', err);
      }
    }

    return rows;
  }
}
