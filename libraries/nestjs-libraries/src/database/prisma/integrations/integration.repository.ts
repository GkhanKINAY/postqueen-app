import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import dayjs from 'dayjs';
import {
  Integration,
  Prisma,
} from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { INTEGRATION_TOKEN_PREFIX } from '@gitroom/helpers/auth/auth.service';

// What a channel signs in with. Rows these methods return go straight back
// to the browser as the response, which has no use for them.
const CREDENTIALS = {
  token: true,
  refreshToken: true,
  customInstanceDetails: true,
} as const;

@Injectable()
export class IntegrationRepository {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _posts: PrismaRepository<'post'>,
    private _plugs: PrismaRepository<'plugs'>,
    private _exisingPlugData: PrismaRepository<'exisingPlugData'>,
    private _customers: PrismaRepository<'customer'>,
    private _mentions: PrismaRepository<'mentions'>
  ) {}

  getMentions(platform: string, q: string) {
    return this._mentions.model.mentions.findMany({
      where: {
        platform,
        OR: [
          {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
          {
            username: {
              contains: q,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        name: 'asc',
      },
      take: 100,
      select: {
        name: true,
        username: true,
        image: true,
      },
    });
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    if (mentions.length === 0) {
      return [] as any[];
    }
    return this._mentions.model.mentions.createMany({
      data: mentions.map((mention) => ({
        platform,
        name: mention.name,
        username: mention.username,
        image: mention.image,
      })),
      skipDuplicates: true,
    });
  }

  async checkPreviousConnections(org: string, id: string) {
    // Deleted accounts keep their integrations with an md5 hashed
    // rootInternalId, so match both the raw id and its hash to still catch
    // channels that were connected by a deleted account.
    const findIt = await this._integration.model.integration.findMany({
      where: {
        rootInternalId: {
          in: [id, this.hashValue(id)],
        },
      },
      select: {
        organizationId: true,
        id: true,
      },
    });

    if (findIt.some((f) => f.organizationId === org)) {
      return false;
    }

    return findIt.length > 0;
  }

  updateProviderSettings(org: string, id: string, settings: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        additionalSettings: settings,
      },
    });
  }

  async setTimes(org: string, id: string, times: IntegrationTimeDto) {
    return this._integration.model.integration.update({
      select: {
        id: true,
      },
      where: {
        id,
        organizationId: org,
      },
      data: {
        postingTimes: JSON.stringify(times.time),
      },
    });
  }

  getPlug(plugId: string) {
    return this._plugs.model.plugs.findFirst({
      where: {
        id: plugId,
      },
      include: {
        integration: true,
      },
    });
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._plugs.model.plugs.findMany({
      where: {
        integrationId,
        organizationId: orgId,
        activated: true,
      },
      include: {
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
          },
        },
      },
    });
  }

  async updateIntegration(id: string, params: Partial<Integration>) {
    if (
      params.picture &&
      (params.picture.indexOf(process.env.CLOUDFLARE_BUCKET_URL!) === -1 ||
        params.picture.indexOf(process.env.FRONTEND_URL!) === -1)
    ) {
      // Same catch as createOrUpdateIntegration: a YouTube thumbnail that
      // fails the SSRF/mime check used to 500 the whole Save, leaving the
      // row stuck in inBetweenSteps with no message on the picker.
      try {
        params.picture = await this.storage.uploadSimple(params.picture);
      } catch (err) {
        console.log('Failed to upload profile picture:', params.picture, err);
      }
    }

    const existing = await this._integration.model.integration.findUnique({
      where: {
        organizationId_internalId: {
          organizationId: params.organizationId!,
          internalId: params.internalId,
        },
      },
    });

    if (existing) {
      await this._posts.model.post.updateMany({
        where: {
          integrationId: id,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await this._integration.model.integration.update({
        where: {
          id,
        },
        data: {
          internalId: `deleted_${params.internalId}_${makeId(10)}`,
          deletedAt: new Date(),
        },
      });
    }

    return this._integration.model.integration.update({
      where: {
        ...(existing ? { id: existing.id } : { id }),
      },
      data: {
        ...params,
        disabled: false,
        // Reconnecting is the user putting the channel back into service, so
        // the stamp goes with it. Otherwise a live row keeps a mark that says
        // "the system switched this off", which is not true of anything the
        // enable query looks at today but is a trap for whoever reads it next.
        autoDisabledAt: null,
        deletedAt: null,
      },
    });
  }

  // Extra pages from a two-step picker (Facebook, Instagram, …). The first
  // selected page reuses the inBetweenSteps row; each extra page needs its own
  // row with that page's token, grouped under the original account
  // (`rootInternalId`). createOrUpdateIntegration would set rootInternalId to
  // the page id, and refresh would then skip reConnect and store the user
  // token as if it were the page token.
  async createExtraProviderPage(
    template: Integration,
    page: {
      name: string;
      picture?: string;
      internalId: string;
      token: string;
      username?: string;
    }
  ) {
    const params: Partial<Integration> = {
      picture: page.picture,
    };
    if (
      params.picture &&
      (params.picture.indexOf(process.env.CLOUDFLARE_BUCKET_URL!) === -1 ||
        params.picture.indexOf(process.env.FRONTEND_URL!) === -1)
    ) {
      try {
        params.picture = await this.storage.uploadSimple(params.picture);
      } catch (err) {
        console.log('Failed to upload profile picture:', params.picture, err);
        params.picture = undefined;
      }
    }

    const rootInternalId = template.rootInternalId || template.internalId;
    const existing = await this._integration.model.integration.findUnique({
      where: {
        organizationId_internalId: {
          organizationId: template.organizationId,
          internalId: page.internalId,
        },
      },
    });

    const shared = {
      name: page.name,
      ...(params.picture ? { picture: params.picture } : {}),
      token: page.token,
      refreshToken: template.refreshToken || template.token,
      tokenExpiration: template.tokenExpiration,
      profile: page.username,
      ...(template.platformUserId
        ? { platformUserId: template.platformUserId }
        : {}),
      inBetweenSteps: false,
      refreshNeeded: false,
      disabled: false,
      autoDisabledAt: null,
      deletedAt: null,
    };

    if (existing) {
      return this._integration.model.integration.update({
        where: {
          id: existing.id,
        },
        data: {
          ...shared,
          internalId: page.internalId,
          providerIdentifier: template.providerIdentifier,
          type: template.type,
          ...(existing.deletedAt ? { rootInternalId } : {}),
        },
      });
    }

    return this._integration.model.integration.create({
      data: {
        ...shared,
        organizationId: template.organizationId,
        type: template.type,
        providerIdentifier: template.providerIdentifier,
        internalId: page.internalId,
        rootInternalId,
        additionalSettings: template.additionalSettings ?? '[]',
        customInstanceDetails: template.customInstanceDetails,
        postingTimes: template.postingTimes,
      },
    });
  }

  disconnectChannel(org: string, id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        refreshNeeded: true,
      },
    });
  }

  getIntegrationByInternalId(org: string, internalId: string) {
    return this._integration.model.integration.findFirst({
      where: {
        organizationId: org,
        internalId,
        deletedAt: null,
      },
    });
  }

  // Moves a channel to another provider in place (MIGRATE_PROVIDERS): only the
  // provider and the app-scoped ids change, so the integration id - and with it
  // scheduled posts, settings and customers - survives the migration. The
  // follow-up createOrUpdateIntegration upsert matches the new internalId and
  // stores the fresh tokens.
  async migrateIntegration(
    org: string,
    id: string,
    internalId: string,
    providerIdentifier: string,
    rootInternalId: string
  ) {
    // A soft-deleted channel can still hold the target internalId
    // (deleteChannel keeps it): rename it out of the way like updateIntegration
    // does, otherwise the organizationId_internalId unique constraint rejects
    // the migration. Live channels are rejected by the service before this.
    const existing = await this._integration.model.integration.findUnique({
      where: {
        organizationId_internalId: {
          organizationId: org,
          internalId,
        },
      },
    });

    if (existing && existing.deletedAt) {
      await this._integration.model.integration.update({
        where: {
          id: existing.id,
        },
        data: {
          internalId: `deleted_${internalId}_${makeId(10)}`,
        },
      });
    }

    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        internalId,
        providerIdentifier,
        rootInternalId,
      },
    });
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn = 999999999,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string,
    platformUserId?: string
  ) {
    // An offset of 0 (UTC, or London in winter) is a real offset. Tested
    // for truthiness it fell through to the column default, 02:00, 06:40 and
    // 11:40 UTC. Unknown (undefined, or NaN from `+undefined`) keeps it.
    const postTimes = Number.isFinite(timezone)
      ? {
          postingTimes: JSON.stringify([
            { time: 560 - timezone },
            { time: 850 - timezone },
            { time: 1140 - timezone },
          ]),
        }
      : {};
    const upsert = await this._integration.model.integration.upsert({
      where: {
        organizationId_internalId: {
          internalId,
          organizationId: org,
        },
      },
      create: {
        type: type as any,
        name,
        providerIdentifier: provider,
        token,
        profile: username,
        ...(picture ? { picture } : {}),
        inBetweenSteps: isBetweenSteps,
        refreshToken,
        ...(expiresIn
          ? { tokenExpiration: new Date(Date.now() + expiresIn * 1000) }
          : {}),
        internalId,
        ...postTimes,
        organizationId: org,
        refreshNeeded: false,
        rootInternalId: internalId,
        ...(customInstanceDetails ? { customInstanceDetails } : {}),
        ...(platformUserId ? { platformUserId } : {}),
        additionalSettings: additionalSettings
          ? JSON.stringify(additionalSettings)
          : '[]',
      },
      update: {
        ...(additionalSettings
          ? { additionalSettings: JSON.stringify(additionalSettings) }
          : {}),
        ...(customInstanceDetails ? { customInstanceDetails } : {}),
        // A refresh does not send it, and must not clear it.
        ...(platformUserId ? { platformUserId } : {}),
        type: type as any,
        ...(!refresh
          ? {
              inBetweenSteps: isBetweenSteps,
            }
          : {}),
        ...(picture ? { picture } : {}),
        profile: username,
        providerIdentifier: provider,
        token,
        refreshToken,
        ...(expiresIn
          ? { tokenExpiration: new Date(Date.now() + expiresIn * 1000) }
          : {}),
        internalId,
        organizationId: org,
        deletedAt: null,
        refreshNeeded: false,
      },
    });

    if (oneTimeToken) {
      const rootId =
        (
          await this._integration.model.integration.findFirst({
            where: {
              organizationId: org,
              internalId: internalId,
            },
          })
        )?.rootInternalId || internalId;

      await this._integration.model.integration.updateMany({
        where: {
          id: {
            not: upsert.id,
          },
          rootInternalId: rootId,
          deletedAt: null,
        },
        data: {
          token,
          refreshToken,
          refreshNeeded: false,
          ...(expiresIn
            ? { tokenExpiration: new Date(Date.now() + expiresIn * 1000) }
            : {}),
        },
      });
    }

    return upsert;
  }

  needsToBeRefreshed() {
    return this._integration.model.integration.findMany({
      where: {
        tokenExpiration: {
          lte: dayjs().add(1, 'day').toDate(),
        },
        inBetweenSteps: false,
        deletedAt: null,
        refreshNeeded: false,
      },
    });
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
      },
      data: {
        inBetweenSteps: true,
      },
    });
  }
  refreshNeeded(org: string, id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        refreshNeeded: true,
      },
    });
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integration.model.integration.update({
      omit: CREDENTIALS,
      where: {
        id,
      },
      data: {
        ...(name ? { name } : {}),
        ...(url ? { picture: url } : {}),
      },
    });
  }

  getIntegrationById(org: string, id: string) {
    return this._integration.model.integration.findFirst({
      where: {
        organizationId: org,
        id,
      },
    });
  }

  // Deleting a channel keeps its row, with the credentials hashed: its history
  // and running workflows still read it through the lookup above, and the few
  // callers that must tell a removed channel apart (analytics, the internal
  // plugs) check `deletedAt` themselves. Anything that would post to a channel
  // or act on it reads this one, so a removed channel answers "not found"
  // instead of taking the request.
  getIntegrationByIdNotDeleted(org: string, id: string) {
    return this._integration.model.integration.findFirst({
      where: {
        organizationId: org,
        id,
        deletedAt: null,
      },
    });
  }

  async getIntegrationForOrder(
    id: string,
    order: string,
    user: string,
    org: string
  ) {
    const integration = await this._posts.model.post.findFirst({
      where: {
        integrationId: id,
        submittedForOrder: {
          id: order,
          messageGroup: {
            OR: [
              { sellerId: user },
              { buyerId: user },
              { buyerOrganizationId: org },
            ],
          },
        },
      },
      select: {
        integration: {
          select: {
            id: true,
            name: true,
            picture: true,
            inBetweenSteps: true,
            providerIdentifier: true,
          },
        },
      },
    });

    return integration?.integration;
  }

  async updateOnCustomerName(org: string, id: string, name: string) {
    const customer = !name
      ? undefined
      : (await this._customers.model.customer.findFirst({
          where: {
            orgId: org,
            name,
          },
        })) ||
        (await this._customers.model.customer.create({
          data: {
            name,
            orgId: org,
          },
        }));

    return this._integration.model.integration.update({
      omit: CREDENTIALS,
      where: {
        id,
        organizationId: org,
      },
      data: {
        customer: !customer
          ? { disconnect: true }
          : {
              connect: {
                id: customer.id,
              },
            },
      },
    });
  }

  async updateIntegrationGroup(org: string, id: string, group: string) {
    // The integration side is org-scoped, but `group` comes straight from the
    // request body and used to be connected unchecked. Another org's Customer
    // id therefore linked their row into this org — leaking its name back
    // through `/integrations/list` and putting a foreign channel inside their
    // customer grouping. `updateOnCustomerName` above resolves the customer
    // with `orgId` for exactly this reason; do the same here.
    const customer = !group
      ? undefined
      : await this._customers.model.customer.findFirst({
          where: {
            id: group,
            orgId: org,
            deletedAt: null,
          },
        });

    if (group && !customer) {
      throw new Error('Customer not found');
    }

    return this._integration.model.integration.update({
      omit: CREDENTIALS,
      where: {
        id,
        organizationId: org,
      },
      data: !customer
        ? {
            customer: {
              disconnect: true,
            },
          }
        : {
            customer: {
              connect: {
                id: customer.id,
              },
            },
          },
    });
  }

  customers(orgId: string) {
    return this._customers.model.customer.findMany({
      where: {
        orgId,
        deletedAt: null,
      },
    });
  }

  getIntegrationsList(org: string) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
      },
      include: {
        customer: true,
      },
    });
  }

  private async latestPostsFor(
    org: string,
    state: 'PUBLISHED' | 'ERROR',
    field: 'publishDate' | 'updatedAt',
    topLevelOnly: boolean,
    groups: { integrationId: string; date: Date | null }[]
  ) {
    const matches = groups.filter((group) => group.date);

    if (!matches.length) {
      return [];
    }

    return this._posts.model.post.findMany({
      where: {
        organizationId: org,
        state,
        deletedAt: null,
        ...(topLevelOnly ? { parentPostId: null } : {}),
        OR: matches.map(
          (group) =>
            ({
              integrationId: group.integrationId,
              [field]: group.date,
            } as Prisma.PostWhereInput)
        ),
      },
      orderBy: {
        id: 'asc',
      },
      select: {
        id: true,
        integrationId: true,
        publishDate: true,
        updatedAt: true,
        releaseURL: true,
        error: true,
      },
    });
  }

  private firstPerIntegration<T extends { integrationId: string }>(posts: T[]) {
    const byIntegration = new Map<string, T>();

    for (const post of posts) {
      if (!byIntegration.has(post.integrationId)) {
        byIntegration.set(post.integrationId, post);
      }
    }

    return byIntegration;
  }

  async getChannelHealth(org: string) {
    const [integrations, lastPublished, lastErrored] = await Promise.all([
      this._integration.model.integration.findMany({
        where: {
          organizationId: org,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          internalId: true,
          name: true,
          providerIdentifier: true,
          type: true,
          disabled: true,
          refreshNeeded: true,
          inBetweenSteps: true,
          tokenExpiration: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this._posts.model.post.groupBy({
        by: ['integrationId'],
        where: {
          organizationId: org,
          state: 'PUBLISHED',
          deletedAt: null,
          parentPostId: null,
        },
        _max: { publishDate: true },
      }),
      this._posts.model.post.groupBy({
        by: ['integrationId'],
        where: {
          organizationId: org,
          state: 'ERROR',
          deletedAt: null,
        },
        _max: { updatedAt: true },
      }),
    ]);

    const [publishedPosts, erroredPosts] = await Promise.all([
      this.latestPostsFor(
        org,
        'PUBLISHED',
        'publishDate',
        true,
        lastPublished.map((group) => ({
          integrationId: group.integrationId,
          date: group._max.publishDate,
        }))
      ),
      this.latestPostsFor(
        org,
        'ERROR',
        'updatedAt',
        false,
        lastErrored.map((group) => ({
          integrationId: group.integrationId,
          date: group._max.updatedAt,
        }))
      ),
    ]);

    const publishedByIntegration = this.firstPerIntegration(publishedPosts);
    const erroredByIntegration = this.firstPerIntegration(erroredPosts);

    return integrations.map((integration) => {
      const published = publishedByIntegration.get(integration.id);
      const errored = erroredByIntegration.get(integration.id);

      return {
        ...integration,
        lastPublishedAt: published?.publishDate || null,
        lastPublishedPostId: published?.id || null,
        lastPublishedUrl: published?.releaseURL || null,
        lastErrorAt: errored?.updatedAt || null,
        lastErrorPostId: errored?.id || null,
        lastError: errored?.error || null,
      };
    });
  }

  // Both of these clear `autoDisabledAt`: the user touching the toggle is the
  // signal that this row's state is now their decision, so a later upgrade
  // must leave it alone. Clearing it on *disable* is the important half — that
  // is someone switching a channel off on purpose, and it must not come back.
  async disableChannel(org: string, id: string) {
    await this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        disabled: true,
        autoDisabledAt: null,
      },
    });
  }

  async enableChannel(org: string, id: string) {
    await this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        disabled: false,
        autoDisabledAt: null,
      },
    });
  }

  getPostsForChannel(org: string, id: string) {
    return this._posts.model.post.groupBy({
      by: ['group'],
      where: {
        organizationId: org,
        integrationId: id,
        deletedAt: null,
      },
    });
  }

  // Removing a channel keeps the row (post history and a later reconnect both
  // find it by internalId), but not what it signed in with. The token, refresh
  // token and custom instance details are replaced the same way account
  // deletion does it, so a removed channel holds no working credentials. A
  // reconnect writes fresh ones through createOrUpdateIntegration.
  async deleteChannel(org: string, id: string) {
    const integration = await this._integration.model.integration.findFirst({
      where: {
        id,
        organizationId: org,
      },
    });

    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        deletedAt: new Date(),
        ...(integration
          ? {
              token: this.hashValue(integration.token),
              refreshToken: integration.refreshToken
                ? this.hashValue(integration.refreshToken)
                : null,
              customInstanceDetails: integration.customInstanceDetails
                ? this.hashValue(integration.customInstanceDetails)
                : null,
            }
          : {}),
      },
    });
  }

  // The channels, in every organization, that a platform callback about one
  // of its users can mean. New rows carry platformUserId. A personal account
  // is its own internalId, whoever connected it. A page or business account
  // connected before platformUserId existed keeps the person only in
  // rootInternalId, which a later reconnect by someone else does not update,
  // so that is read only while platformUserId is empty.
  // Soft-deleted rows are included, since they still hold the profile.
  getIntegrationsByPlatformUser(providers: string[], platformUserId: string) {
    return this._integration.model.integration.findMany({
      where: {
        providerIdentifier: {
          in: providers,
        },
        OR: [
          { platformUserId },
          { internalId: platformUserId },
          { platformUserId: null, rootInternalId: platformUserId },
        ],
      },
    });
  }

  // A platform asked for what it sent about one of its users to be deleted.
  // Takes what the channel arrived with, the way deleteIntegrationsForAccount
  // does. The credentials are replaced here too, because a channel removed
  // before deleteChannel started replacing them still holds them.
  // rootInternalId stays matchable by checkPreviousConnections through its
  // md5, and internalId is renamed out of the way like updateIntegration
  // does, so a later connect starts a fresh row instead of reviving this one.
  async eraseChannelData(org: string, id: string) {
    const integration = await this._integration.model.integration.findFirst({
      where: {
        id,
        organizationId: org,
      },
    });

    if (!integration) {
      return;
    }

    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        name: this.hashValue(integration.name),
        internalId: `deleted_${this.hashValue(integration.internalId)}_${makeId(
          10
        )}`,
        rootInternalId: integration.rootInternalId
          ? this.hashValue(integration.rootInternalId)
          : null,
        profile: integration.profile ? this.hashValue(integration.profile) : null,
        picture: null,
        platformUserId: null,
        token: this.hashValue(integration.token),
        refreshToken: integration.refreshToken
          ? this.hashValue(integration.refreshToken)
          : null,
        customInstanceDetails: integration.customInstanceDetails
          ? this.hashValue(integration.customInstanceDetails)
          : null,
        deletedAt: integration.deletedAt || new Date(),
      },
    });
  }

  private hashValue(value: string) {
    return createHash('md5').update(value).digest('hex');
  }

  /**
   * Rewrites the stored tokens that are not in the form asked for: the plain
   * ones while encryption is on (every row written before it existed), the
   * encrypted ones while ENCRYPT_INTEGRATION_TOKENS=false. The rewrite itself
   * is an ordinary update, so the client extension in prisma.service.ts does
   * the encrypting, or leaves them plain.
   *
   * Each update only lands if the row is unchanged since it was read
   * (`updatedAt`), so a token refreshed in between is never replaced by the
   * one read before it. That row is simply left for the next boot.
   */
  async syncStoredTokenEncryption(encrypt: boolean) {
    const encrypted = { startsWith: INTEGRATION_TOKEN_PREFIX };
    const [tokens, refreshTokens] = await Promise.all([
      this._integration.model.integration.findMany({
        where: encrypt
          ? { token: { not: '' }, NOT: { token: encrypted } }
          : { token: encrypted },
        select: { id: true },
      }),
      this._integration.model.integration.findMany({
        where: encrypt
          ? { refreshToken: { not: '' }, NOT: { refreshToken: encrypted } }
          : { refreshToken: encrypted },
        select: { id: true },
      }),
    ]);

    const rewriteToken = new Set(tokens.map((p) => p.id));
    const rewriteRefreshToken = new Set(refreshTokens.map((p) => p.id));
    let rewritten = 0;
    for (const id of new Set([...rewriteToken, ...rewriteRefreshToken])) {
      const row = await this._integration.model.integration.findUnique({
        where: { id },
        select: { token: true, refreshToken: true, updatedAt: true },
      });

      // Only the fields in the wrong form are written, so a field that is
      // already right, and possibly encrypted under a key no longer set, is
      // never read back and written out as empty.
      const data = {
        ...(rewriteToken.has(id) ? { token: row?.token } : {}),
        ...(rewriteRefreshToken.has(id)
          ? { refreshToken: row?.refreshToken }
          : {}),
      };

      // Read back empty means no configured key could decrypt it. Writing
      // that out would lose a value the right key may still open.
      if (!row || Object.values(data).some((value) => !value)) {
        continue;
      }

      const { count } = await this._integration.model.integration.updateMany({
        where: { id, updatedAt: row.updatedAt },
        data,
      });
      rewritten += count;
    }

    return rewritten;
  }

  async deleteIntegrationsForAccount(org: string) {

    await this._posts.model.post.updateMany({
      where: {
        organizationId: org,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    const integrations = await this._integration.model.integration.findMany({
      where: {
        organizationId: org,
      },
    });

    // md5 is deterministic, so a hashed rootInternalId can still be matched
    // by checkPreviousConnections when the same channel is connected again
    // from a new account.
    for (const integration of integrations) {
      await this._integration.model.integration.update({
        where: {
          id: integration.id,
        },
        data: {
          name: this.hashValue(integration.name),
          internalId: this.hashValue(integration.internalId),
          rootInternalId: integration.rootInternalId
            ? this.hashValue(integration.rootInternalId)
            : null,
          token: this.hashValue(integration.token),
          refreshToken: integration.refreshToken
            ? this.hashValue(integration.refreshToken)
            : null,
          profile: integration.profile ? this.hashValue(integration.profile) : null,
          customInstanceDetails: integration.customInstanceDetails
            ? this.hashValue(integration.customInstanceDetails)
            : null,
          picture: null,
          platformUserId: null,
          deletedAt: integration.deletedAt || new Date(),
        },
      });
    }
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integration.model.integration.updateMany({
      where: {
        organizationId: org,
        internalId: page,
        deletedAt: {
          not: null,
        },
      },
      data: {
        internalId: makeId(10),
      },
    });
  }

  // `totalChannels` is the EXCESS to switch off, not the cap (see the caller in
  // subscription.service). Returns what it disabled so the caller can tell the
  // user which channels went quiet.
  async disableIntegrations(org: string, totalChannels: number) {
    const getChannels = await this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        disabled: false,
        deletedAt: null,
      },
      // Without an order this was whatever Postgres felt like returning, so a
      // downgrade could switch off someone's oldest, most-used channel and
      // keep one they connected yesterday. Newest first is the predictable,
      // least-surprising rule.
      orderBy: { createdAt: 'desc' },
      take: totalChannels,
      select: {
        id: true,
        name: true,
      },
    });

    for (const channel of getChannels) {
      await this._integration.model.integration.update({
        where: {
          id: channel.id,
        },
        data: {
          disabled: true,
          // Stamped so an upgrade can tell these apart from the channels the
          // user switched off deliberately, and give back only these.
          autoDisabledAt: new Date(),
        },
      });
    }

    return getChannels;
  }

  // The other half of `disableIntegrations`. `headroom` is how many channels
  // the new plan has spare, not the cap. Oldest-disabled first, so the order
  // channels come back in is the reverse of the order they went away — a
  // downgrade takes the newest, an upgrade returns the ones lost longest ago.
  async enableAutoDisabledIntegrations(org: string, headroom: number) {
    if (headroom <= 0) {
      return [];
    }

    const getChannels = await this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        disabled: true,
        autoDisabledAt: { not: null },
        deletedAt: null,
        // A channel that needs reconnecting cannot publish anyway, and
        // switching it on would only put a broken row in front of the user.
        refreshNeeded: false,
      },
      orderBy: { autoDisabledAt: 'asc' },
      take: headroom,
      select: {
        id: true,
        name: true,
      },
    });

    for (const channel of getChannels) {
      await this._integration.model.integration.update({
        where: {
          id: channel.id,
        },
        data: {
          disabled: false,
          autoDisabledAt: null,
        },
      });
    }

    return getChannels;
  }

  getPlugsByIntegrationId(org: string, id: string) {
    return this._plugs.model.plugs.findMany({
      where: {
        organizationId: org,
        integrationId: id,
      },
    });
  }

  createOrUpdatePlug(org: string, integrationId: string, body: PlugDto) {
    return this._plugs.model.plugs.upsert({
      where: {
        organizationId: org,
        plugFunction_integrationId: {
          integrationId,
          plugFunction: body.func,
        },
      },
      create: {
        integrationId,
        organizationId: org,
        plugFunction: body.func,
        data: JSON.stringify(body.fields),
        activated: true,
      },
      update: {
        data: JSON.stringify(body.fields),
      },
      select: {
        activated: true,
      },
    });
  }

  changePlugActivation(orgId: string, plugId: string, status: boolean) {
    return this._plugs.model.plugs.update({
      where: {
        organizationId: orgId,
        id: plugId,
      },
      data: {
        activated: !!status,
      },
    });
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    return this._exisingPlugData.model.exisingPlugData.findMany({
      where: {
        integrationId,
        methodName,
        value: {
          in: id,
        },
      },
    });
  }

  async saveExisingData(
    methodName: string,
    integrationId: string,
    value: string[]
  ) {
    return this._exisingPlugData.model.exisingPlugData.createMany({
      data: value.map((p) => ({
        integrationId,
        methodName,
        value: p,
      })),
    });
  }

  async getPostingTimes(orgId: string, integrationsId?: string) {
    return this._integration.model.integration.findMany({
      where: {
        ...(integrationsId ? { id: integrationsId } : {}),
        organizationId: orgId,
        disabled: false,
        deletedAt: null,
      },
      select: {
        postingTimes: true,
      },
    });
  }
}
