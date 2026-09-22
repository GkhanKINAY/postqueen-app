import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Prisma } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { PURGE_BATCH } from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.plan';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

// Mastra creates some of its tables the first time a feature needs them, so an
// install can lack one. A table that is not there holds nothing to remove.
const missingTable = (err: unknown) =>
  (err as { code?: string })?.code === 'P2021';

// Same default as schema.prisma, for a scrubbed channel.
const DEFAULT_POSTING_TIMES = '[{"time":120}, {"time":400}, {"time":700}]';

/**
 * Every query the account purge makes. Deletes are scoped by the deleted
 * organization's or user's id and capped at PURGE_BATCH rows; rows of other
 * organizations are only ever updated, to drop a pointer at something that is
 * going. A step method answers the count it would remove when `apply` is false
 * (dry-run) and the count it removed when it is true, from the same `where`.
 */
@Injectable()
export class AccountPurgeRepository {
  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _user: PrismaRepository<'user'>,
    private _userOrganization: PrismaRepository<'userOrganization'>,
    private _userIdentity: PrismaRepository<'userIdentity'>,
    private _integration: PrismaRepository<'integration'>,
    private _post: PrismaRepository<'post'>,
    private _comments: PrismaRepository<'comments'>,
    private _tagsPosts: PrismaRepository<'tagsPosts'>,
    private _tags: PrismaRepository<'tags'>,
    private _errors: PrismaRepository<'errors'>,
    private _postMetricSnapshot: PrismaRepository<'postMetricSnapshot'>,
    private _payoutProblems: PrismaRepository<'payoutProblems'>,
    private _integrationsWebhooks: PrismaRepository<'integrationsWebhooks'>,
    private _webhooks: PrismaRepository<'webhooks'>,
    private _plugs: PrismaRepository<'plugs'>,
    private _exisingPlugData: PrismaRepository<'exisingPlugData'>,
    private _media: PrismaRepository<'media'>,
    private _customer: PrismaRepository<'customer'>,
    private _sets: PrismaRepository<'sets'>,
    private _signatures: PrismaRepository<'signatures'>,
    private _autoPost: PrismaRepository<'autoPost'>,
    private _thirdParty: PrismaRepository<'thirdParty'>,
    private _notifications: PrismaRepository<'notifications'>,
    private _credits: PrismaRepository<'credits'>,
    private _gitHub: PrismaRepository<'gitHub'>,
    private _clipping: PrismaRepository<'clipping'>,
    private _clippingClip: PrismaRepository<'clippingClip'>,
    private _oauthAuthorization: PrismaRepository<'oAuthAuthorization'>,
    private _oauthApp: PrismaRepository<'oAuthApp'>,
    private _subscription: PrismaRepository<'subscription'>,
    private _itemUser: PrismaRepository<'itemUser'>,
    private _agency: PrismaRepository<'socialMediaAgency'>,
    private _agencyNiche: PrismaRepository<'socialMediaAgencyNiche'>,
    private _mastraThreads: PrismaRepository<'mastra_threads'>,
    private _mastraMessages: PrismaRepository<'mastra_messages'>,
    private _mastraThreadState: PrismaRepository<'mastra_thread_state'>,
    private _mastraBackgroundTasks: PrismaRepository<'mastra_background_tasks'>,
    private _mastraObservationalMemory: PrismaRepository<'mastra_observational_memory'>,
    private _mastraScorers: PrismaRepository<'mastra_scorers'>,
    private _mastraKnowledgeActivity: PrismaRepository<'mastra_knowledge_activity'>,
    private _mastraKnowledgeCursors: PrismaRepository<'mastra_knowledge_cursors'>,
    private _mastraKnowledgeRecords: PrismaRepository<'mastra_knowledge_records'>,
    private _mastraWorkflowSnapshot: PrismaRepository<'mastra_workflow_snapshot'>,
    private _mastraResources: PrismaRepository<'mastra_resources'>,
    private _transaction: PrismaTransaction
  ) {}

  private async step(
    apply: boolean,
    count: () => Promise<number>,
    remove: () => Promise<{ count: number }>
  ) {
    if (!apply) {
      return { count: await count(), more: false };
    }
    const removed = (await remove()).count;
    return { count: removed, more: removed >= PURGE_BATCH };
  }

  private async copilot<T>(query: () => Promise<T>, empty: T): Promise<T> {
    try {
      return await query();
    } catch (err) {
      if (missingTable(err)) {
        return empty;
      }
      throw err;
    }
  }

  // Targets

  getUnpurgedDeletedOrganizations() {
    return this._organization.model.organization.findMany({
      where: {
        deletedAt: { not: null },
        purgedAt: null,
      },
      select: { id: true, deletedAt: true },
      orderBy: { deletedAt: 'asc' },
    });
  }

  getUnpurgedDeletedUsers(deletedBefore: Date) {
    return this._user.model.user.findMany({
      where: {
        deletedAt: { lt: deletedBefore },
        purgedAt: null,
      },
      select: { id: true },
      orderBy: { deletedAt: 'asc' },
    });
  }

  async getOrganizationGuard(orgId: string) {
    const org = await this._organization.model.organization.findUnique({
      where: { id: orgId },
      select: {
        deletedAt: true,
        purgedAt: true,
        subscription: { select: { isLifetime: true, deletedAt: true } },
        _count: {
          select: {
            users: {
              where: { disabled: false, user: { deletedAt: null } },
            },
          },
        },
      },
    });
    if (!org) {
      return null;
    }
    return {
      deletedAt: org.deletedAt,
      purgedAt: org.purgedAt,
      activeMembers: org._count.users,
      subscription:
        org.subscription && !org.subscription.deletedAt
          ? { isLifetime: org.subscription.isLifetime }
          : null,
    };
  }

  async getUserGuard(userId: string) {
    const user = await this._user.model.user.findUnique({
      where: { id: userId },
      select: {
        deletedAt: true,
        purgedAt: true,
        _count: {
          select: {
            organizations: { where: { organization: { deletedAt: null } } },
          },
        },
      },
    });
    if (!user) {
      return null;
    }
    return {
      deletedAt: user.deletedAt,
      purgedAt: user.purgedAt,
      liveMemberships: user._count.organizations,
    };
  }

  // Quiesce: what can still have a workflow running for the organization

  async getWorkflowOwners(orgId: string) {
    const [integrations, autoposts, media, clippings, repeatPosts] =
      await Promise.all([
        this._integration.model.integration.findMany({
          where: { organizationId: orgId },
          select: { id: true },
        }),
        this._autoPost.model.autoPost.findMany({
          where: { organizationId: orgId },
          select: { id: true },
        }),
        this._media.model.media.findMany({
          where: { organizationId: orgId, status: 'processing' },
          select: { id: true },
        }),
        this._clipping.model.clipping.findMany({
          where: { organizationId: orgId },
          select: { id: true },
        }),
        // Repeating posts continue in child workflows that carry only the
        // post id, so the organization search does not find them.
        this._post.model.post.findMany({
          where: { organizationId: orgId, intervalInDays: { not: null } },
          select: { id: true },
        }),
      ]);
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
    return {
      integrations: ids(integrations),
      autoposts: ids(autoposts),
      media: ids(media),
      clippings: ids(clippings),
      repeatPosts: ids(repeatPosts),
    };
  }

  quiesceAutoposts(orgId: string, apply: boolean) {
    const where: Prisma.AutoPostWhereInput = {
      organizationId: orgId,
      deletedAt: null,
    };
    return this.step(
      apply,
      () => this._autoPost.model.autoPost.count({ where }),
      () =>
        this._autoPost.model.autoPost.updateMany({
          where,
          data: { active: false, deletedAt: new Date() },
        })
    );
  }

  // Organization steps, in ORGANIZATION_PURGE_STEPS order

  purgeComments(orgId: string, apply: boolean) {
    const where: Prisma.CommentsWhereInput = {
      OR: [{ organizationId: orgId }, { post: { organizationId: orgId } }],
    };
    return this.step(
      apply,
      () => this._comments.model.comments.count({ where }),
      () =>
        this._comments.model.comments.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgeTagsPosts(orgId: string, apply: boolean) {
    const where: Prisma.TagsPostsWhereInput = {
      OR: [{ post: { organizationId: orgId } }, { tag: { orgId } }],
    };
    return this.step(
      apply,
      () => this._tagsPosts.model.tagsPosts.count({ where }),
      () =>
        this._tagsPosts.model.tagsPosts.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  purgeErrors(orgId: string, apply: boolean) {
    const where: Prisma.ErrorsWhereInput = {
      OR: [{ organizationId: orgId }, { post: { organizationId: orgId } }],
    };
    return this.step(
      apply,
      () => this._errors.model.errors.count({ where }),
      () => this._errors.model.errors.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgeSnapshots(orgId: string, apply: boolean) {
    const where: Prisma.PostMetricSnapshotWhereInput = {
      OR: [
        { organizationId: orgId },
        { post: { organizationId: orgId } },
        { integration: { organizationId: orgId } },
      ],
    };
    return this.step(
      apply,
      () => this._postMetricSnapshot.model.postMetricSnapshot.count({ where }),
      () =>
        this._postMetricSnapshot.model.postMetricSnapshot.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  // Pointers at the organization's posts from rows that are not deleted with
  // them: legacy payout records, other organizations' posts submitted to this
  // one, and thread children, so a batch of posts never waits on another.
  async purgePostLinks(orgId: string, apply: boolean) {
    const payouts: Prisma.PayoutProblemsWhereInput = {
      post: { organizationId: orgId },
    };
    const submitted: Prisma.PostWhereInput = {
      submittedForOrganizationId: orgId,
      organizationId: { not: orgId },
    };
    const children: Prisma.PostWhereInput = {
      parentPost: { organizationId: orgId },
    };
    const results = await Promise.all([
      this.step(
        apply,
        () =>
          this._payoutProblems.model.payoutProblems.count({ where: payouts }),
        () =>
          this._payoutProblems.model.payoutProblems.updateMany({
            where: payouts,
            data: { postId: null },
            limit: PURGE_BATCH,
          })
      ),
      this.step(
        apply,
        () => this._post.model.post.count({ where: submitted }),
        () =>
          this._post.model.post.updateMany({
            where: submitted,
            data: { submittedForOrganizationId: null },
            limit: PURGE_BATCH,
          })
      ),
      this.step(
        apply,
        () => this._post.model.post.count({ where: children }),
        () =>
          this._post.model.post.updateMany({
            where: children,
            data: { parentPostId: null },
            limit: PURGE_BATCH,
          })
      ),
    ]);
    return {
      count: results.reduce((sum, result) => sum + result.count, 0),
      more: results.some((result) => result.more),
    };
  }

  postsWithFiles(orgId: string, after = '', take = PURGE_BATCH) {
    return this._post.model.post.findMany({
      where: { organizationId: orgId, id: { gt: after } },
      select: { id: true, image: true, content: true, settings: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  deletePosts(orgId: string, ids: string[]) {
    return this._post.model.post.deleteMany({
      where: { organizationId: orgId, id: { in: ids } },
    });
  }

  purgeIntegrationWebhooks(orgId: string, apply: boolean) {
    const where: Prisma.IntegrationsWebhooksWhereInput = {
      OR: [
        { integration: { organizationId: orgId } },
        { webhook: { organizationId: orgId } },
      ],
    };
    return this.step(
      apply,
      () =>
        this._integrationsWebhooks.model.integrationsWebhooks.count({ where }),
      () =>
        this._integrationsWebhooks.model.integrationsWebhooks.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  purgeWebhooks(orgId: string, apply: boolean) {
    const where: Prisma.WebhooksWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._webhooks.model.webhooks.count({ where }),
      () =>
        this._webhooks.model.webhooks.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgePlugs(orgId: string, apply: boolean) {
    const where: Prisma.PlugsWhereInput = {
      OR: [
        { organizationId: orgId },
        { integration: { organizationId: orgId } },
      ],
    };
    return this.step(
      apply,
      () => this._plugs.model.plugs.count({ where }),
      () => this._plugs.model.plugs.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgePlugData(orgId: string, apply: boolean) {
    const where: Prisma.ExisingPlugDataWhereInput = {
      integration: { organizationId: orgId },
    };
    return this.step(
      apply,
      () => this._exisingPlugData.model.exisingPlugData.count({ where }),
      () =>
        this._exisingPlugData.model.exisingPlugData.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  // A media row still used outside the organization stays: a live member's
  // avatar, another organization's OAuth app picture, a live agency logo.
  // Those relations are SET NULL, so deleting the row would silently blank
  // them instead of failing.
  private mediaInUse(orgId: string): Prisma.MediaWhereInput {
    return {
      OR: [
        { userPicture: { some: { deletedAt: null } } },
        {
          oauthApps: {
            some: {
              deletedAt: null,
              OR: [
                { organizationId: null },
                { organizationId: { not: orgId } },
              ],
            },
          },
        },
        {
          agencies: { some: { deletedAt: null, user: { deletedAt: null } } },
        },
      ],
    };
  }

  mediaWithFiles(orgId: string, after = '', take = PURGE_BATCH) {
    return this._media.model.media.findMany({
      where: {
        organizationId: orgId,
        id: { gt: after },
        NOT: this.mediaInUse(orgId),
      },
      select: { id: true, path: true, thumbnail: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  deleteMedia(orgId: string, ids: string[]) {
    return this._media.model.media.deleteMany({
      where: {
        organizationId: orgId,
        id: { in: ids },
        NOT: this.mediaInUse(orgId),
      },
    });
  }

  mediaKeptInUse(orgId: string) {
    return this._media.model.media.findMany({
      where: { organizationId: orgId, ...this.mediaInUse(orgId) },
      select: { id: true, path: true, thumbnail: true },
    });
  }

  purgeCustomers(orgId: string, apply: boolean) {
    const where: Prisma.CustomerWhereInput = { orgId };
    return this.step(
      apply,
      () => this._customer.model.customer.count({ where }),
      async () => {
        const [, removed] = await this._transaction.model.$transaction([
          this._integration.model.integration.updateMany({
            where: { customer: { orgId } },
            data: { customerId: null },
          }),
          this._customer.model.customer.deleteMany({
            where,
            limit: PURGE_BATCH,
          }),
        ]);
        return removed;
      }
    );
  }

  purgeTags(orgId: string, apply: boolean) {
    const where: Prisma.TagsWhereInput = { orgId };
    return this.step(
      apply,
      () => this._tags.model.tags.count({ where }),
      () => this._tags.model.tags.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  setsWithFiles(orgId: string, after = '', take = PURGE_BATCH) {
    return this._sets.model.sets.findMany({
      where: { organizationId: orgId, id: { gt: after } },
      select: { id: true, content: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  deleteSets(orgId: string, ids: string[]) {
    return this._sets.model.sets.deleteMany({
      where: { organizationId: orgId, id: { in: ids } },
    });
  }

  signaturesWithFiles(orgId: string, after = '', take = PURGE_BATCH) {
    return this._signatures.model.signatures.findMany({
      where: { organizationId: orgId, id: { gt: after } },
      select: { id: true, content: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  deleteSignatures(orgId: string, ids: string[]) {
    return this._signatures.model.signatures.deleteMany({
      where: { organizationId: orgId, id: { in: ids } },
    });
  }

  purgeAutoposts(orgId: string, apply: boolean) {
    const where: Prisma.AutoPostWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._autoPost.model.autoPost.count({ where }),
      () =>
        this._autoPost.model.autoPost.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgeThirdParty(orgId: string, apply: boolean) {
    const where: Prisma.ThirdPartyWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._thirdParty.model.thirdParty.count({ where }),
      () =>
        this._thirdParty.model.thirdParty.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  purgeNotifications(orgId: string, apply: boolean) {
    const where: Prisma.NotificationsWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._notifications.model.notifications.count({ where }),
      () =>
        this._notifications.model.notifications.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  purgeCredits(orgId: string, apply: boolean) {
    const where: Prisma.CreditsWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._credits.model.credits.count({ where }),
      () =>
        this._credits.model.credits.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgeGithub(orgId: string, apply: boolean) {
    const where: Prisma.GitHubWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._gitHub.model.gitHub.count({ where }),
      () => this._gitHub.model.gitHub.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  clipsWithFiles(orgId: string, after = '', take = PURGE_BATCH) {
    return this._clippingClip.model.clippingClip.findMany({
      where: { clipping: { organizationId: orgId }, id: { gt: after } },
      select: { id: true, path: true, thumbnail: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  deleteClips(orgId: string, ids: string[]) {
    return this._clippingClip.model.clippingClip.deleteMany({
      where: { clipping: { organizationId: orgId }, id: { in: ids } },
    });
  }

  clippingsWithFiles(orgId: string, after = '', take = PURGE_BATCH) {
    return this._clipping.model.clipping.findMany({
      where: { organizationId: orgId, id: { gt: after } },
      select: { id: true, thumbnail: true },
      orderBy: { id: 'asc' },
      take,
    });
  }

  deleteClippings(orgId: string, ids: string[]) {
    return this._clipping.model.clipping.deleteMany({
      where: { organizationId: orgId, id: { in: ids } },
    });
  }

  // The organization's grants, and other organizations' grants to the
  // organization's own app. Dynamically registered (DCR) apps belong to no
  // organization and are never deleted here.
  purgeOauthAuthorizations(orgId: string, apply: boolean) {
    const where: Prisma.OAuthAuthorizationWhereInput = {
      OR: [
        { organizationId: orgId },
        { oauthApp: { organizationId: orgId, dynamic: false } },
      ],
    };
    return this.step(
      apply,
      () => this._oauthAuthorization.model.oAuthAuthorization.count({ where }),
      () =>
        this._oauthAuthorization.model.oAuthAuthorization.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  purgeOauthApps(orgId: string, apply: boolean) {
    const where: Prisma.OAuthAppWhereInput = {
      organizationId: orgId,
      dynamic: false,
    };
    return this.step(
      apply,
      () => this._oauthApp.model.oAuthApp.count({ where }),
      () =>
        this._oauthApp.model.oAuthApp.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgeSubscription(orgId: string, apply: boolean) {
    const where: Prisma.SubscriptionWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._subscription.model.subscription.count({ where }),
      () => this._subscription.model.subscription.deleteMany({ where })
    );
  }

  purgeMembers(orgId: string, apply: boolean) {
    const where: Prisma.UserOrganizationWhereInput = { organizationId: orgId };
    return this.step(
      apply,
      () => this._userOrganization.model.userOrganization.count({ where }),
      () =>
        this._userOrganization.model.userOrganization.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  // Copilot. Threads are keyed by resource: the organization id for the
  // Copilot page and `<orgId>:composer` for the Create Post rail.

  threadsWithFiles(resourceIds: string[], after = '', take: number) {
    return this.copilot(
      () =>
        this._mastraThreads.model.mastra_threads.findMany({
          where: { resourceId: { in: resourceIds }, id: { gt: after } },
          select: { id: true, metadata: true },
          orderBy: { id: 'asc' },
          take,
        }),
      []
    );
  }

  // Everything keyed by these threads, messages first. Messages are capped
  // per call; the rest are a handful of rows per thread at most.
  async purgeThreadRows(threadIds: string[], apply: boolean) {
    const inThreads = { in: threadIds };
    const results = await Promise.all([
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraMessages.model.mastra_messages.count({
                where: { thread_id: inThreads },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraMessages.model.mastra_messages.deleteMany({
                where: { thread_id: inThreads },
                limit: PURGE_BATCH,
              }),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraThreadState.model.mastra_thread_state.count({
                where: { threadId: inThreads },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraThreadState.model.mastra_thread_state.deleteMany({
                where: { threadId: inThreads },
                limit: PURGE_BATCH,
              }),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraBackgroundTasks.model.mastra_background_tasks.count({
                where: { thread_id: inThreads },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraBackgroundTasks.model.mastra_background_tasks.deleteMany(
                { where: { thread_id: inThreads }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraObservationalMemory.model.mastra_observational_memory.count(
                { where: { threadId: inThreads } }
              ),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraObservationalMemory.model.mastra_observational_memory.deleteMany(
                { where: { threadId: inThreads }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraScorers.model.mastra_scorers.count({
                where: { threadId: inThreads },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraScorers.model.mastra_scorers.deleteMany({
                where: { threadId: inThreads },
                limit: PURGE_BATCH,
              }),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraKnowledgeActivity.model.mastra_knowledge_activity.count(
                { where: { sourceThreadId: inThreads } }
              ),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraKnowledgeActivity.model.mastra_knowledge_activity.deleteMany(
                { where: { sourceThreadId: inThreads }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraKnowledgeCursors.model.mastra_knowledge_cursors.count(
                { where: { sourceThreadId: inThreads } }
              ),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraKnowledgeCursors.model.mastra_knowledge_cursors.deleteMany(
                { where: { sourceThreadId: inThreads }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraKnowledgeRecords.model.mastra_knowledge_records.count(
                { where: { sourceThreadId: inThreads } }
              ),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraKnowledgeRecords.model.mastra_knowledge_records.deleteMany(
                { where: { sourceThreadId: inThreads }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
    ]);
    return {
      messages: results[0].count,
      count: results.reduce((sum, result) => sum + result.count, 0),
      more: results.some((result) => result.more),
    };
  }

  deleteThreads(resourceIds: string[], ids: string[]) {
    return this.copilot(
      () =>
        this._mastraThreads.model.mastra_threads.deleteMany({
          where: { resourceId: { in: resourceIds }, id: { in: ids } },
        }),
      { count: 0 }
    );
  }

  // What is keyed by the resource ids themselves, once the threads are gone.
  async purgeCopilotResources(resourceIds: string[], apply: boolean) {
    const inResources = { in: resourceIds };
    const results = await Promise.all([
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraMessages.model.mastra_messages.count({
                where: { resourceId: inResources },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraMessages.model.mastra_messages.deleteMany({
                where: { resourceId: inResources },
                limit: PURGE_BATCH,
              }),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraWorkflowSnapshot.model.mastra_workflow_snapshot.count(
                { where: { resourceId: inResources } }
              ),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraWorkflowSnapshot.model.mastra_workflow_snapshot.deleteMany(
                { where: { resourceId: inResources }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraBackgroundTasks.model.mastra_background_tasks.count({
                where: { resource_id: inResources },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraBackgroundTasks.model.mastra_background_tasks.deleteMany(
                { where: { resource_id: inResources }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraObservationalMemory.model.mastra_observational_memory.count(
                { where: { resourceId: inResources } }
              ),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraObservationalMemory.model.mastra_observational_memory.deleteMany(
                { where: { resourceId: inResources }, limit: PURGE_BATCH }
              ),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraScorers.model.mastra_scorers.count({
                where: { resourceId: inResources },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraScorers.model.mastra_scorers.deleteMany({
                where: { resourceId: inResources },
                limit: PURGE_BATCH,
              }),
            { count: 0 }
          )
      ),
      this.step(
        apply,
        () =>
          this.copilot(
            () =>
              this._mastraResources.model.mastra_resources.count({
                where: { id: inResources },
              }),
            0
          ),
        () =>
          this.copilot(
            () =>
              this._mastraResources.model.mastra_resources.deleteMany({
                where: { id: inResources },
              }),
            { count: 0 }
          )
      ),
    ]);
    return {
      count: results.reduce((sum, result) => sum + result.count, 0),
      more: results.some((result) => result.more),
    };
  }

  /**
   * Values of rows outside the purge that contain any of these keys: another
   * organization's media, posts, channel avatars, templates and signatures.
   * Deleted rows of other organizations count too; their own purge takes the
   * file once nothing else uses it. `contains` is a sequential scan, so keys
   * come in batches.
   */
  async valuesUsingKeys(orgId: string, keys: string[]) {
    const contains = (field: string) =>
      keys.map((key) => ({ [field]: { contains: key } }));
    const [media, posts, integrations, sets, signatures] = await Promise.all([
      this._media.model.media.findMany({
        where: {
          organizationId: { not: orgId },
          OR: [...contains('path'), ...contains('thumbnail')],
        },
        select: { path: true, thumbnail: true },
      }),
      this._post.model.post.findMany({
        where: {
          organizationId: { not: orgId },
          OR: [
            ...contains('image'),
            ...contains('content'),
            ...contains('settings'),
          ],
        },
        select: { image: true, content: true, settings: true },
      }),
      this._integration.model.integration.findMany({
        where: { organizationId: { not: orgId }, OR: contains('picture') },
        select: { picture: true },
      }),
      this._sets.model.sets.findMany({
        where: { organizationId: { not: orgId }, OR: contains('content') },
        select: { content: true },
      }),
      this._signatures.model.signatures.findMany({
        where: { organizationId: { not: orgId }, OR: contains('content') },
        select: { content: true },
      }),
    ]);
    return [
      ...media.flatMap((row) => [row.path, row.thumbnail]),
      ...posts.flatMap((row) => [row.image, row.content, row.settings]),
      ...integrations.map((row) => row.picture),
      ...sets.map((row) => row.content),
      ...signatures.map((row) => row.content),
    ];
  }

  integrationPictures(orgId: string) {
    return this._integration.model.integration.findMany({
      where: { organizationId: orgId, picture: { not: null } },
      select: { picture: true },
    });
  }

  /**
   * The last step, and the only one that writes purgedAt: the channels and
   * the organization become tombstones in one transaction. A channel keeps
   * the md5 of its rootInternalId for the trial check, its provider and type,
   * and when it was deleted. The organization keeps its id, its Stripe
   * customer id, its dates and its UsedCodes.
   */
  async tombstoneOrganization(orgId: string) {
    const integrations = await this._integration.model.integration.findMany({
      where: { organizationId: orgId },
      select: { id: true, deletedAt: true },
    });
    const now = new Date();
    return this._transaction.model.$transaction([
      ...integrations.map((integration) =>
        this._integration.model.integration.update({
          where: { id: integration.id },
          data: {
            name: 'deleted',
            internalId: `purged_${integration.id}`,
            profile: null,
            picture: null,
            customInstanceDetails: null,
            tokenExpiration: null,
            token: 'purged',
            refreshToken: 'purged',
            additionalSettings: '[]',
            postingTimes: DEFAULT_POSTING_TIMES,
            customerId: null,
            deletedAt: integration.deletedAt || now,
          },
        })
      ),
      this._organization.model.organization.update({
        where: { id: orgId },
        data: {
          name: 'Deleted workspace',
          description: null,
          apiKey: null,
          streakSince: null,
          isTrailing: false,
          allowTrial: false,
          purgedAt: now,
        },
      }),
    ]);
  }

  // User steps, in USER_PURGE_STEPS order

  purgeUserAuthorizations(userId: string, apply: boolean) {
    const where: Prisma.OAuthAuthorizationWhereInput = { userId };
    return this.step(
      apply,
      () => this._oauthAuthorization.model.oAuthAuthorization.count({ where }),
      () =>
        this._oauthAuthorization.model.oAuthAuthorization.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  purgeItems(userId: string, apply: boolean) {
    const where: Prisma.ItemUserWhereInput = { userId };
    return this.step(
      apply,
      () => this._itemUser.model.itemUser.count({ where }),
      () =>
        this._itemUser.model.itemUser.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgeAgencyNiches(userId: string, apply: boolean) {
    const where: Prisma.SocialMediaAgencyNicheWhereInput = {
      agency: { userId },
    };
    return this.step(
      apply,
      () => this._agencyNiche.model.socialMediaAgencyNiche.count({ where }),
      () =>
        this._agencyNiche.model.socialMediaAgencyNiche.deleteMany({
          where,
          limit: PURGE_BATCH,
        })
    );
  }

  purgeAgency(userId: string, apply: boolean) {
    const where: Prisma.SocialMediaAgencyWhereInput = { userId };
    return this.step(
      apply,
      () => this._agency.model.socialMediaAgency.count({ where }),
      () => this._agency.model.socialMediaAgency.deleteMany({ where })
    );
  }

  // Comments the user wrote in workspaces that are still in use. Those in
  // deleted workspaces go with the workspace.
  purgeMemberComments(userId: string, apply: boolean) {
    const where: Prisma.CommentsWhereInput = {
      userId,
      organization: { deletedAt: null },
    };
    return this.step(
      apply,
      () => this._comments.model.comments.count({ where }),
      () =>
        this._comments.model.comments.deleteMany({ where, limit: PURGE_BATCH })
    );
  }

  purgeIdentities(userId: string, apply: boolean) {
    const where: Prisma.UserIdentityWhereInput = { userId };
    return this.step(
      apply,
      () => this._userIdentity.model.userIdentity.count({ where }),
      () => this._userIdentity.model.userIdentity.deleteMany({ where })
    );
  }

  /**
   * The user row stays so comments and legacy rows keep a valid author, with
   * nothing left that names the person. A random email replaces the md5 one
   * written at deletion and still keeps [email, providerName] unique.
   */
  tombstoneUser(userId: string, deletedAt: Date) {
    return this._user.model.user.update({
      where: { id: userId },
      data: {
        email: `deleted_${makeId(32)}`,
        password: null,
        name: null,
        lastName: null,
        providerId: null,
        appleProviderId: null,
        inviteId: null,
        bio: null,
        ip: null,
        agent: null,
        account: null,
        pictureId: null,
        audience: 0,
        lastOnline: deletedAt,
        purgedAt: new Date(),
      },
    });
  }
}
