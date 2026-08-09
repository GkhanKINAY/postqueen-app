import { Injectable } from '@nestjs/common';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { SubscriptionRepository } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { Organization } from '@prisma/client';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly _subscriptionRepository: SubscriptionRepository,
    private readonly _integrationService: IntegrationService,
    private readonly _organizationService: OrganizationService
  ) {}

  getSubscriptionByOrganizationId(organizationId: string) {
    return this._subscriptionRepository.getSubscriptionByOrganizationId(
      organizationId
    );
  }

  useCredit<T>(
    organization: Organization,
    type = 'ai_images',
    func: () => Promise<T>
  ): Promise<T> {
    return this._subscriptionRepository.useCredit(organization, type, func);
  }

  getCode(code: string) {
    return this._subscriptionRepository.getCode(code);
  }

  getCodesByOrgId(orgId: string) {
    return this._subscriptionRepository.getCodesByOrgId(orgId);
  }

  createUsedCode(orgId: string, code: string) {
    return this._subscriptionRepository.createUsedCode(orgId, code);
  }

  async deleteSubscription(customerId: string) {
    // A founding-member row is a local entitlement, not a mirror of a Stripe
    // subscription. Cancelling (or exhausting) a leftover Stripe sub must not
    // wipe lifetime — that used to happen after a mid-trial convert, because
    // `customer.subscription.deleted` always hard-deleted the org's row.
    const current =
      await this._subscriptionRepository.getSubscriptionByCustomerId(
        customerId
      );
    if (current?.isLifetime) {
      return false;
    }

    // Persist end date on the org before the Subscription row is hard-deleted
    // — First Billing needs it for paid-then-cancelled copy.
    await this._subscriptionRepository.recordSubscriptionEndedByCustomerId(
      customerId,
      current?.cancelAt ?? new Date()
    );

    await this.modifySubscription(
      customerId,
      pricing.FREE.channel || 0,
      'FREE'
    );
    return this._subscriptionRepository.deleteSubscriptionByCustomerId(
      customerId
    );
  }

  /** Immediate revoke of a local subscription row (founding-member trial cancel). */
  async revokeLocalSubscription(organizationId: string) {
    const current =
      await this._subscriptionRepository.getSubscriptionByOrganizationId(
        organizationId
      );
    await this._subscriptionRepository.recordSubscriptionEndedByOrganizationId(
      organizationId,
      current?.cancelAt ?? new Date()
    );
    await this.modifySubscriptionByOrg(
      organizationId,
      pricing.FREE.channel || 0,
      'FREE'
    );
    return this._subscriptionRepository.deleteSubscriptionByOrganizationId(
      organizationId
    );
  }

  updateCustomerId(organizationId: string, customerId: string) {
    return this._subscriptionRepository.updateCustomerId(
      organizationId,
      customerId
    );
  }

  async checkSubscription(organizationId: string, subscriptionId: string) {
    return await this._subscriptionRepository.checkSubscription(
      organizationId,
      subscriptionId
    );
  }

  /**
   * Brings the number of live channels in line with what the plan allows, in
   * both directions.
   *
   * Only the disable half existed. A customer who downgraded had channels
   * switched off and, on coming back, found them still off with no way through
   * but the toggle on each one — while team members, disabled two branches
   * further down, were re-enabled for them. Only channels a plan change turned
   * off are given back; see `autoDisabledAt` in the schema for how that is told
   * apart from the user's own choice.
   *
   * Autopost rules are deliberately not resumed the same way. Enabling a
   * channel publishes nothing by itself; an autopost rule does, and quietly
   * restarting unattended publishing after a gap in billing is not a surprise
   * anyone wants. `changeActiveCron` switches them off on the way down and the
   * user switches them back on.
   */
  private async syncChannelsToPlan(orgId: string, totalChannels: number) {
    if (!orgId) {
      return;
    }

    const live = await this.liveChannelCount(orgId);

    if (live > totalChannels) {
      await this._integrationService.disableIntegrations(
        orgId,
        live - totalChannels
      );
      return;
    }

    await this.restoreChannelsUpTo(orgId, totalChannels);
  }

  /**
   * The give-back half on its own, for callers that must never take a channel
   * away.
   *
   * Split out rather than reusing the two-way sync, which is what this was
   * first written as and was wrong: the redeemed-code path below grants PRO,
   * and a trialing organization reads as AGENCY, so a customer converting to a
   * founding purchase with more than PRO's thirty live channels would have had
   * the excess switched off. Nothing happened on that path before, so that
   * would have been a loss introduced by the fix for the opposite problem.
   */
  private async restoreChannelsUpTo(orgId: string, totalChannels: number) {
    if (!orgId) {
      return;
    }

    const live = await this.liveChannelCount(orgId);
    if (live >= totalChannels) {
      return;
    }

    await this._integrationService.enableAutoDisabledIntegrations(
      orgId,
      totalChannels - live
    );
  }

  private async liveChannelCount(orgId: string) {
    return (await this._integrationService.getIntegrationsList(orgId)).filter(
      (f) => !f.disabled
    ).length;
  }

  async modifySubscriptionByOrg(
    organizationId: string,
    totalChannels: number,
    billing: 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE' | 'CREATOR' | 'GROWTH' | 'AGENCY'
  ) {
    if (!organizationId) {
      return false;
    }

    const getCurrentSubscription =
      (await this._subscriptionRepository.getSubscriptionByOrgId(
        organizationId
      ))!;

    const from = pricing[getCurrentSubscription?.subscriptionTier || 'FREE'];
    const to = pricing[billing];

    await this.syncChannelsToPlan(organizationId, totalChannels);

    if (from.team_members && !to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        organizationId,
        true
      );
    }

    if (!from.team_members && to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        organizationId,
        false
      );
    }

    if (billing === 'FREE') {
      await this._integrationService.changeActiveCron(organizationId);
    }

    return true;
  }

  async modifySubscription(
    customerId: string,
    totalChannels: number,
    billing: 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE' | 'CREATOR' | 'GROWTH' | 'AGENCY'
  ) {
    if (!customerId) {
      return false;
    }

    const getOrgByCustomerId =
      await this._subscriptionRepository.getOrganizationByCustomerId(
        customerId
      );

    const getCurrentSubscription =
      (await this._subscriptionRepository.getSubscriptionByCustomerId(
        customerId
      ))!;

    if (
      !getOrgByCustomerId ||
      (getCurrentSubscription && getCurrentSubscription?.isLifetime)
    ) {
      return false;
    }

    const from = pricing[getCurrentSubscription?.subscriptionTier || 'FREE'];
    const to = pricing[billing];

    await this.syncChannelsToPlan(getOrgByCustomerId?.id!, totalChannels);

    if (from.team_members && !to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        getOrgByCustomerId?.id!,
        true
      );
    }

    if (!from.team_members && to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        getOrgByCustomerId?.id!,
        false
      );
    }

    if (billing === 'FREE') {
      await this._integrationService.changeActiveCron(getOrgByCustomerId?.id!);
    }

    return true;
  }

  async createOrUpdateSubscription(
    isTrailing: boolean,
    identifier: string,
    customerId: string,
    totalChannels: number,
    billing:
      | 'STANDARD'
      | 'TEAM'
      | 'PRO'
      | 'ULTIMATE'
      | 'CREATOR'
      | 'GROWTH'
      | 'AGENCY',
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null,
    code?: string,
    org?: string
  ) {
    if (!code) {
      // Both of these used to `return {}`, which the webhook then answered as
      // 2xx — so a customer could be charged, the row never written, and Stripe
      // never retry, with nothing in the logs. `modifySubscription` returns
      // false only when no organization matches the Stripe customer, and it
      // throws on a database or Temporal failure. Neither is a reason to tell
      // Stripe the event was handled; both want the retry.
      const load = await this.modifySubscription(
        customerId,
        totalChannels,
        billing
      );
      if (!load) {
        throw new Error(
          `No organization matches Stripe customer ${customerId}; refusing to acknowledge the webhook so Stripe retries`
        );
      }
    } else if (org) {
      // The redeemed-code and founding-purchase path skips modifySubscription
      // entirely, so it skipped the channel sync with it: someone who lapsed
      // and then bought a lifetime deal was left with every channel off. It
      // takes the org id directly because there is no Stripe customer to look
      // one up from.
      //
      // Restore only, never the two-way sync: this grant is always PRO, a
      // trialing organization reads as AGENCY, and taking channels off someone
      // at the moment they pay is not a trade worth making.
      await this.restoreChannelsUpTo(org, totalChannels);
    }
    return this._subscriptionRepository.createOrUpdateSubscription(
      isTrailing,
      identifier,
      customerId,
      totalChannels,
      billing,
      period,
      cancelAt,
      code,
      org ? { id: org } : undefined
    );
  }

  getSubscriptionByIdentifier(identifier: string) {
    return this._subscriptionRepository.getSubscriptionByIdentifier(identifier);
  }

  async getSubscription(organizationId: string) {
    return this._subscriptionRepository.getSubscription(organizationId);
  }

  async checkCredits(organization: Organization, checkType = 'ai_images') {
    // @ts-ignore
    const type = organization?.subscription?.subscriptionTier || 'FREE';

    if (type === 'FREE') {
      return { credits: 0 };
    }

    // @ts-ignore
    let date = dayjs(organization.subscription.createdAt);
    while (date.isBefore(dayjs())) {
      date = date.add(1, 'month');
    }

    const checkFromMonth = date.subtract(1, 'month');
    const imageGenerationCount =
      checkType === 'ai_images'
        ? pricing[type].image_generation_count
        : pricing[type].generate_videos;

    const totalUse = await this._subscriptionRepository.getCreditsFrom(
      organization.id,
      checkFromMonth,
      checkType
    );

    return {
      credits: imageGenerationCount - totalUse,
    };
  }

  async addSubscription(orgId: string, userId: string, subscription: any) {
    await this._subscriptionRepository.setCustomerId(orgId, userId);
    return this.createOrUpdateSubscription(
      false,
      makeId(5),
      userId,
      pricing[subscription].channel!,
      subscription,
      'MONTHLY',
      null,
      undefined,
      orgId
    );
  }
}
