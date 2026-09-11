import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import dayjs from 'dayjs';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';

@Injectable()
export class SubscriptionRepository {
  constructor(
    private readonly _subscription: PrismaRepository<'subscription'>,
    private readonly _organization: PrismaRepository<'organization'>,
    private readonly _user: PrismaRepository<'user'>,
    private readonly _credits: PrismaRepository<'credits'>,
    private _usedCodes: PrismaRepository<'usedCodes'>,
    private _stripeEvent: PrismaRepository<'stripeEvent'>
  ) {}

  /**
   * Claim a Stripe event id for processing.
   *
   * `'claimed'` — go ahead. `'duplicate'` — already completed, drop it.
   * `'in_flight'` — another attempt is still running; the caller must NOT
   * answer 2xx, or Stripe marks the event delivered while that attempt can
   * still fail.
   *
   * The insert is the check: the id is the primary key, so two concurrent
   * deliveries race in the database rather than in a read-then-write both could
   * pass. Only the unique-violation is caught — every other error is rethrown,
   * because reporting a dead connection as "already processed" would answer 200
   * to Stripe and lose the event for good.
   */
  async claimStripeEvent(
    id: string,
    type: string,
    staleAfterMs = 5 * 60 * 1000
  ): Promise<'claimed' | 'duplicate' | 'in_flight'> {
    try {
      await this._stripeEvent.model.stripeEvent.create({ data: { id, type } });
      return 'claimed';
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') {
        throw err;
      }
    }

    const existing = await this._stripeEvent.model.stripeEvent.findUnique({
      where: { id },
    });
    if (!existing) {
      // Deleted between the insert and this read — a concurrent attempt failed
      // and released it. Treat as in flight; the retry will claim it cleanly.
      return 'in_flight';
    }
    if (existing.completedAt) {
      return 'duplicate';
    }

    // Claimed but never completed: the process died mid-handler. Nothing else
    // will ever finish it, so take it over once it is old enough that it cannot
    // still be running. The updateMany is conditional on the row still being
    // incomplete, so two retries cannot both take over.
    if (Date.now() - existing.createdAt.getTime() < staleAfterMs) {
      return 'in_flight';
    }
    const takeover = await this._stripeEvent.model.stripeEvent.updateMany({
      where: { id, completedAt: null, createdAt: existing.createdAt },
      data: { createdAt: new Date() },
    });
    return takeover.count === 1 ? 'claimed' : 'in_flight';
  }

  /** Stamp a claimed event as finished so redeliveries are dropped. */
  completeStripeEvent(id: string) {
    return this._stripeEvent.model.stripeEvent.updateMany({
      where: { id },
      data: { completedAt: new Date() },
    });
  }

  /** Release a claimed event so Stripe's retry can process it again. */
  releaseStripeEvent(id: string) {
    return this._stripeEvent.model.stripeEvent.deleteMany({
      where: { id, completedAt: null },
    });
  }

  getUserAccount(userId: string) {
    return this._user.model.user.findFirst({
      where: {
        id: userId,
      },
      select: {
        account: true,
        connectedAccount: true,
      },
    });
  }

  getCode(code: string) {
    return this._usedCodes.model.usedCodes.findFirst({
      where: {
        code,
      },
    });
  }

  getCodesByOrgId(orgId: string) {
    return this._usedCodes.model.usedCodes.findMany({
      where: { orgId },
      select: { code: true },
    });
  }

  // Organizations that bought the founding deal with the charge deferred to
  // the end of their trial. Whether one still owes it is decided per
  // organization by `StripeService.isDeferredFoundingFeeOwed`; this only
  // narrows the search to the ones that could.
  async getOrgIdsWithDeferredFoundingSetup() {
    const rows = await this._usedCodes.model.usedCodes.findMany({
      where: { code: { startsWith: 'lifetime-setup:' } },
      select: { orgId: true },
      distinct: ['orgId'],
    });
    return rows.map((row) => row.orgId);
  }

  createUsedCode(orgId: string, code: string) {
    return this._usedCodes.model.usedCodes.create({
      data: { code, orgId },
    });
  }

  updateAccount(userId: string, account: string) {
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        account,
      },
    });
  }

  getSubscriptionByOrganizationId(organizationId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId,
        deletedAt: null,
      },
    });
  }

  updateConnectedStatus(account: string, accountCharges: boolean) {
    return this._user.model.user.updateMany({
      where: {
        account,
      },
      data: {
        connectedAccount: accountCharges,
      },
    });
  }

  getCustomerIdByOrgId(organizationId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        id: organizationId,
      },
      select: {
        paymentId: true,
      },
    });
  }

  checkSubscription(organizationId: string, subscriptionId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId,
        identifier: subscriptionId,
        deletedAt: null,
      },
    });
  }

  deleteSubscriptionByCustomerId(customerId: string, provider: string) {
    return this._subscription.model.subscription.deleteMany({
      where: {
        provider,
        organization: {
          paymentId: customerId,
        },
      },
    });
  }

  deleteSubscriptionByOrganizationId(organizationId: string) {
    return this._subscription.model.subscription.deleteMany({
      where: {
        organizationId,
      },
    });
  }

  /** Remember when access ended — Subscription row is hard-deleted next. */
  recordSubscriptionEndedByCustomerId(customerId: string, endedAt: Date) {
    return this._organization.model.organization.updateMany({
      where: {
        paymentId: customerId,
      },
      data: {
        subscriptionEndedAt: endedAt,
      },
    });
  }

  recordSubscriptionEndedByOrganizationId(
    organizationId: string,
    endedAt: Date
  ) {
    return this._organization.model.organization.update({
      where: {
        id: organizationId,
      },
      data: {
        subscriptionEndedAt: endedAt,
      },
    });
  }

  deleteSubscriptionByOrgId(organizationId: string, provider: string) {
    return this._subscription.model.subscription.deleteMany({
      where: {
        organizationId,
        provider,
      },
    });
  }

  updateCustomerId(organizationId: string, customerId: string) {
    return this._organization.model.organization.update({
      where: {
        id: organizationId,
      },
      data: {
        paymentId: customerId,
      },
    });
  }

  /**
   * Sets the organization's Stripe customer only while it has none, and says
   * whether this call was the one that set it. Two first-time billing requests
   * can race; whichever write lands first is the customer both end up using.
   */
  async setCustomerIdIfEmpty(organizationId: string, customerId: string) {
    const { count } = await this._organization.model.organization.updateMany({
      where: {
        id: organizationId,
        OR: [{ paymentId: null }, { paymentId: '' }],
      },
      data: {
        paymentId: customerId,
      },
    });
    return count > 0;
  }

  async getSubscriptionByOrgId(orgId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId: orgId,
      },
    });
  }

  async getSubscriptionByCustomerId(customerId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organization: {
          paymentId: customerId,
        },
      },
    });
  }

  async getOrganizationByCustomerId(customerId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        paymentId: customerId,
      },
    });
  }

  async createOrUpdateSubscription(
    provider: string,
    isTrailing: boolean,
    identifier: string,
    customerId: string,
    totalChannels: number,
    billing: 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE' | 'CREATOR' | 'GROWTH' | 'AGENCY',
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null,
    code?: string,
    org?: { id: string }
  ) {
    const findOrg =
      org || (await this.getOrganizationByCustomerId(customerId))!;

    if (!findOrg) {
      return;
    }

    await this._subscription.model.subscription.upsert({
      where: {
        organizationId: findOrg.id,
        ...(!code && customerId
          ? {
              organization: {
                paymentId: customerId,
              },
            }
          : {}),
      },
      update: {
        subscriptionTier: billing,
        provider,
        totalChannels,
        period,
        identifier,
        isLifetime: !!code,
        cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
        deletedAt: null,
      },
      create: {
        organizationId: findOrg.id,
        subscriptionTier: billing,
        provider,
        isLifetime: !!code,
        totalChannels,
        period,
        cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
        identifier,
        deletedAt: null,
      },
    });

    await this._organization.model.organization.update({
      where: {
        id: findOrg.id,
      },
      data: {
        isTrailing,
        allowTrial: false,
        // New paid/lifetime row — clear the lapsed-paywall end date.
        subscriptionEndedAt: null,
      },
    });

    if (code) {
      await this._usedCodes.model.usedCodes.create({
        data: {
          code,
          orgId: findOrg.id,
        },
      });
    }
  }

  getSubscriptionByIdentifier(identifier: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        identifier,
        deletedAt: null,
      },
      include: {
        organization: true,
      },
    });
  }

  getSubscription(organizationId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId,
        deletedAt: null,
      },
    });
  }

  async getCreditsFrom(
    organizationId: string,
    from: dayjs.Dayjs,
    type = 'ai_images'
  ) {
    const load = await this._credits.model.credits.groupBy({
      by: ['organizationId'],
      where: {
        organizationId,
        type,
        createdAt: {
          gte: from.toDate(),
        },
      },
      _sum: {
        credits: true,
      },
    });

    return load?.[0]?._sum?.credits || 0;
  }

  async useCredit<T>(
    org: Organization,
    type = 'ai_images',
    func: () => Promise<T>
  ) {
    const data = await this._credits.model.credits.create({
      data: {
        organizationId: org.id,
        credits: 1,
        type,
      },
    });

    try {
      return await func();
    } catch (err) {
      await this._credits.model.credits.delete({
        where: {
          id: data.id,
        },
      });
      throw err;
    }
  }

  setCustomerId(orgId: string, customerId: string) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        paymentId: customerId,
      },
    });
  }
}
