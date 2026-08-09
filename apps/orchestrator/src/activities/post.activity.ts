import { Injectable } from '@nestjs/common';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  NotificationService,
  NotificationType,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Integration, Post, State } from '@prisma/client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { AuthTokenDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { timer } from '@gitroom/helpers/utils/timer';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { extractPostErrorMessage } from '@gitroom/helpers/utils/post.error.message';

/**
 * Written to `Post.error` when a scheduled post could not run because the org
 * has no active subscription. Deliberately not 'No Post': that string is a
 * silence sentinel, and it is what the frozen workflow writes for this case.
 * Rendered into the calendar tooltip, so it reads as a sentence fragment.
 */
const LAPSED_SUBSCRIPTION = 'Subscription required';

// Drops fields the workflow and downstream activities never read — biggest wins are `error` (grows per retry) and `childrenPost` (Prisma side-loads it on every recursive row).
function slimPost(post: any) {
  if (!post) return post;
  const {
    error,
    childrenPost,
    tags,
    description,
    title,
    submittedForOrderId,
    submittedForOrganizationId,
    submittedForOrder,
    submittedForOrganization,
    lastMessageId,
    parentPostId,
    approvedSubmitForOrder,
    deletedAt,
    createdAt,
    updatedAt,
    payoutProblems,
    comments,
    errors,
    ...rest
  } = post;
  return rest;
}

@Injectable()
@Activity()
export class PostActivity {
  constructor(
    private _postService: PostsService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _webhookService: WebhooksService,
    private _temporalService: TemporalService,
    private _subscriptionService: SubscriptionService
  ) {}

  @ActivityMethod()
  async getIntegrationById(orgId: string, id: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPosts() {
    const list = await this._postService.searchForMissingThreeHoursPosts();
    for (const post of list) {
      // v106, matching posts.service.ts. The recovery sweep starting the old
      // version would have quietly reintroduced the duplicate-publish loop on
      // exactly the posts that had already gone wrong once.
      await this._temporalService.client
        .getRawClient()
        .workflow.signalWithStart('postWorkflowV106', {
          workflowId: `post_${post.id}`,
          taskQueue: 'main',
          signal: 'poke',
          workflowIdConflictPolicy: 'USE_EXISTING',
          signalArgs: [],
          args: [
            {
              taskQueue: post.integration.providerIdentifier
                .split('-')[0]
                .toLowerCase(),
              postId: post.id,
              organizationId: post.organizationId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: post.id,
            },
            {
              key: organizationId,
              value: post.organizationId,
            },
          ]),
        });
    }
  }

  @ActivityMethod()
  async updatePost(id: string, postId: string, releaseURL: string) {
    await this._postService.updatePost(id, postId, releaseURL);
  }

  @ActivityMethod()
  async getPost(orgId: string, postId: string) {
    if (isBillingEnabled()) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return false;
      }
    }
    const post = await this._postService.getPostById(postId, orgId);
    if (post.deletedAt) {
      return false;
    }

    return post;
  }

  @ActivityMethod()
  async getPostsList(orgId: string, postId: string) {
    if (isBillingEnabled()) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    return getPosts.map(slimPost);
  }

  @ActivityMethod()
  async isCommentable(integration: Integration) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return !!getIntegration.comment;
  }

  @ActivityMethod()
  async postComment(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: Post[]
  ) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    return getIntegration.comment(
      integration.internalId,
      postId,
      lastPostId,
      integration.token,
      await Promise.all(
        (newPosts || []).map(async (p) => ({
          id: p.id,
          message: stripHtmlValidation(
            getIntegration.editor,
            p.content,
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(p.content),
            getIntegration.mentionFormat
          ),
          settings: JSON.parse(p.settings || '{}'),
          media: await this._postService.updateMedia(
            p.id,
            JSON.parse(p.image || '[]'),
            getIntegration?.convertToJPEG || false
          ),
        }))
      ),
      integration
    );
  }

  @ActivityMethod()
  async postSocial(integration: Integration, posts: Post[]) {
    if (isBillingEnabled()) {
      const subscription = await this._subscriptionService.getSubscription(
        integration.organizationId
      );

      if (!subscription) {
        throw new Error('No active subscription found for this organization.');
      }
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const postNow = await getIntegration.post(
      integration.internalId,
      integration.token,
      await Promise.all(
        (newPosts || []).map(async (p) => ({
          id: p.id,
          message: stripHtmlValidation(
            getIntegration.editor,
            p.content,
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(p.content),
            getIntegration.mentionFormat
          ),
          settings: JSON.parse(p.settings || '{}'),
          media: await this._postService.updateMedia(
            p.id,
            JSON.parse(p.image || '[]'),
            getIntegration?.convertToJPEG || false
          ),
        }))
      ),
      integration
    );

    // Everything past this point runs *after* the post is live on the
    // customer's timeline, so nothing here may fail the activity. Temporal
    // retries a failed activity, and a retry of this one publishes the post a
    // second time — `postSocial` has no idempotency guard and never checks
    // `releaseId` before calling the provider. A streak counter is not worth a
    // duplicate post, so its failure is swallowed deliberately.
    try {
      await this._temporalService.client
        .getRawClient()
        .workflow.start('streakWorkflow', {
          args: [{ organizationId: integration.organizationId }],
          workflowId: `streak_${integration.organizationId}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: organizationId,
              value: integration.organizationId,
            },
          ]),
        });
    } catch (err) {
      console.error(
        `[postSocial] post ${newPosts?.[0]?.id} published, but the streak workflow could not start`,
        err
      );
    }

    return postNow;
  }

  @ActivityMethod()
  async inAppNotification(
    orgId: string,
    subject: string,
    message: string,
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      subject,
      message,
      sendEmail,
      digest,
      type
    );
  }

  @ActivityMethod()
  async globalPlugs(integration: Integration) {
    return this._postService.checkPlugs(
      integration.organizationId,
      integration.providerIdentifier,
      integration.id
    );
  }

  @ActivityMethod()
  async changeState(id: string, state: State, err?: any, body?: any) {
    // Read BEFORE the write: the post already being in ERROR is how we know
    // this is a repeat. The generic-error branch in post.workflow v1.0.5 does
    // not break out of its 5-iteration retry loop, and this activity itself
    // retries 3 times, so one failed post could otherwise send 15 notifications
    // and 15 emails. The workflow file is frozen, so it is deduped here.
    const [before] =
      state !== 'ERROR'
        ? []
        : await this._postService
            .getPostsRecursively(id, true)
            .catch(() => [] as any[]);

    // `getPost` and `getPostsList` return falsy both for a post that is gone
    // and for an org whose subscription has lapsed, and the frozen workflow
    // turns either into 'No Post' — which is on the silence list below. So a
    // paying customer who let their plan expire lost every scheduled post
    // without a word, and the hourly sweep never picked them up again because
    // it only collects `QUEUE`. Ask the subscription rather than inferring it
    // from the row: this only runs on the 'No Post' path, and guessing wrong
    // either way is a lost post or a false alarm.
    let reason = extractPostErrorMessage(err);
    const lapsed =
      state === 'ERROR' &&
      reason === 'No Post' &&
      !!before?.organizationId &&
      isBillingEnabled() &&
      !(await this._subscriptionService
        .getSubscription(before.organizationId)
        .catch(() => null));

    if (lapsed) {
      reason = LAPSED_SUBSCRIPTION;
    }

    // The post stays ERROR rather than going back to QUEUE on purpose. A post
    // scheduled three weeks ago should not fire the moment someone resubscribes
    // — it is stale, and publishing it unasked is worse than losing it. ERROR
    // with an honest reason leaves it visible on the calendar to reschedule.
    await this._postService.changeState(
      id,
      state,
      lapsed ? reason : err,
      body
    );

    if (state !== 'ERROR' || before?.state === 'ERROR') {
      return;
    }

    // The workflow notifies for the two pre-flight cases and for bad_body, and
    // stays silent for everything else — provider 500s, media failures, a
    // lapsed subscription. Those are the common ones, and the post just died
    // without a word. Cover them here so no failure is silent, while skipping
    // the reasons that already spoke.
    const alreadyReported =
      reason === 'Refresh channel needed' ||
      reason === 'Channel disabled' ||
      // Internal sentinels, not failures the user can act on. 'Already posted'
      // is worse than noise: the workflow writes it when it re-runs over a post
      // that already PUBLISHED, so it announces a failure that never happened.
      reason === 'No Post' ||
      reason === 'Already posted' ||
      err?.cause?.type === 'bad_body';
    if (alreadyReported) {
      return;
    }

    try {
      const post = before?.organizationId
        ? before
        : (await this._postService.getPostsRecursively(id, true))[0];
      if (!post?.organizationId) {
        return;
      }
      const channel = post.integration?.name || 'your channel';
      await this._notificationService.inAppNotification(
        post.organizationId,
        lapsed
          ? `Your post to ${channel} was not published`
          : `We couldn't publish your post to ${channel}`,
        lapsed
          ? // Not a failure of ours and not something retrying fixes, so it
            // says what happened and what to do, and is classed like the
            // reconnect-your-channel notice rather than a publish failure.
            `Your post to ${channel} was not published because your subscription is no longer active. Renew it from Billing, then reschedule the post from your calendar.`
          : `We couldn't publish your post to ${channel}${
              reason ? `: ${reason}` : ''
            }. Open the post on your calendar to see the details.`,
        true,
        false,
        lapsed ? 'info' : 'fail'
      );
    } catch (e) {
      // Never let the notification take down the state change itself.
    }
  }

  @ActivityMethod()
  async internalPlugs(integration: Integration, settings: any) {
    return this._postService.checkInternalPlug(
      integration,
      integration.organizationId,
      integration.id,
      settings
    );
  }

  @ActivityMethod()
  async sendWebhooks(postId: string, orgId: string, integrationId: string) {
    const webhooks = (await this._webhookService.getWebhooks(orgId)).filter(
      (f) => {
        return (
          f.integrations.length === 0 ||
          f.integrations.some((i) => i.integration.id === integrationId)
        );
      }
    );

    const post = await this._postService.getPostByForWebhookId(
      postId,
      orgId,
      integrationId
    );
    await Promise.all(
      webhooks.map(async (webhook) => {
        try {
          // The DTO resolves DNS at save time only; a host that answers public
          // then and private now would otherwise be reached here. Same
          // dispatcher the rest of the outbound fetches use. The timeout is
          // just as important — an endpoint that hangs used to hold this
          // activity open in front of plugs and repeat-post scheduling.
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), 10000);
          try {
            await fetch(webhook.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(post),
              signal: ac.signal,
              // Redirects are followed (the default). undici hands a manual
              // 3xx straight back instead of the spec's opaque redirect, and
              // nothing here inspects the response — so `manual` silently
              // stopped delivering to every endpoint that normalises its URL
              // (apex→www, trailing slash). The dispatcher below re-checks DNS
              // on each hop, so following is still SSRF-safe.
              // @ts-ignore — undici option, not in lib.dom fetch types
              dispatcher: getSsrfSafeDispatcher(),
            });
          } finally {
            clearTimeout(timer);
          }
        } catch (e) {
          /**empty**/
        }
      })
    );
  }
  @ActivityMethod()
  async processPlug(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    return this._integrationService.processPlugs(data);
  }

  @ActivityMethod()
  async processInternalPlug(data: {
    post: string;
    originalIntegration: string;
    integration: string;
    plugName: string;
    orgId: string;
    delay: number;
    information: any;
  }) {
    await this._integrationService.processInternalPlug(data);
  }

  @ActivityMethod()
  async refreshToken(
    integration: Integration
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration);
      return false;
    }
  }

  @ActivityMethod()
  async refreshTokenWithCause(
    integration: Integration,
    cause: string
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration,
        cause
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration, cause);
      return false;
    }
  }
}
