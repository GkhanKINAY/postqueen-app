import { Injectable } from '@nestjs/common';
import {
  CREDIT_GIFT_MONTHLY,
  CREDIT_PLAN_GRACE_DAYS,
  CREDIT_UNIT,
  effectiveIsTrailing,
  normalizeTier,
  planCredits,
  pricing,
  trialWindow,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { CreditsService } from '@gitroom/nestjs-libraries/database/prisma/credits/credits.service';
import { SubscriptionRepository } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly _subscriptionRepository: SubscriptionRepository,
    private readonly _integrationService: IntegrationService,
    private readonly _organizationService: OrganizationService,
    private readonly _creditsService: CreditsService
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
    return this._subscriptionRepository.useCredit(
      organization,
      type,
      func,
      this.creditWindow(organization, type)
    );
  }

  /**
   * This month's allowance of `type` and the day the month started, or null
   * when nothing is metered (billing off). Shared by the read (`checkCredits`)
   * and the write (`useCredit`), so the two cannot count different months.
   */
  private creditWindow(organization: Organization, type: string) {
    if (!isBillingEnabled()) {
      return null;
    }

    // @ts-ignore
    const tier = organization?.subscription?.subscriptionTier || 'FREE';

    if (tier === 'FREE') {
      return { limit: 0, from: dayjs() };
    }

    return {
      limit:
        type === 'ai_images'
          ? pricing[tier].image_generation_count
          : type === 'clipping_minutes'
          ? pricing[tier].clipping_minutes
          : pricing[tier].generate_videos,
      // @ts-ignore
      from: this.monthlyWindow(organization.subscription.createdAt).start,
    };
  }

  /** The month, counted from `anchor`'s day of the month, that today is in. */
  private monthlyWindow(anchor: Date | string) {
    let date = dayjs(anchor);
    while (date.isBefore(dayjs())) {
      date = date.add(1, 'month');
    }
    return { start: date.subtract(1, 'month'), end: date };
  }

  /**
   * Adds a plan period's credits: every provider's paid period and trial comes
   * through here, so they all follow one set of rules.
   *
   * - A trial gets one month's allowance, raised (never lowered) when the plan
   *   changes during it. It ends with the trial.
   * - A new period replaces what the last one left: plan credits do not roll
   *   over. They stay spendable `CREDIT_PLAN_GRACE_DAYS` past the period, so a
   *   renewal paid a day late leaves no gap.
   * - The same period again is an upgrade part-way through it, topped up by the
   *   difference between the two plans for the time that is left, which is how
   *   Stripe prorates the charge for it.
   * - A period older than the current one (a late, out-of-order event) is
   *   ignored.
   *
   * `ref` makes each step happen once. `prorate` is for plans that were already
   * running when credits started: a yearly plan gets the months it has left,
   * not a whole year of credits for a year that is partly over. The decision
   * is taken under the ledger's lock, against the grants in force at that
   * moment, so two events for one period cannot both add to it.
   */
  async grantPlanPeriod(
    organizationId: string,
    period: {
      tier: string;
      period: 'MONTHLY' | 'YEARLY';
      start: Date;
      end: Date;
      ref: string;
      trial?: boolean;
      prorate?: boolean;
    }
  ) {
    const tier = normalizeTier(period.tier);
    const allowance = planCredits(tier, period.period, period.trial);
    if (!allowance || dayjs(period.end).isBefore(dayjs())) {
      return false;
    }
    const dates = {
      tier,
      periodStart: period.start,
      periodEnd: period.end,
    };

    const { granted } = await this._creditsService.grantWith(
      organizationId,
      ['plan', 'trial'],
      (current) => {
        if (period.trial) {
          const prefix = `trial:${period.ref}:`;
          const given = current
            .filter((grant) => grant.externalRef?.startsWith(prefix))
            .reduce((sum, grant) => sum + grant.amount, 0);
          return allowance > given
            ? {
                grant: {
                  source: 'trial',
                  amount: allowance - given,
                  expiresAt: period.end,
                  externalRef: `${prefix}${allowance}`,
                  ...dates,
                },
              }
            : null;
        }

        const expiresAt = dayjs(period.end)
          .add(CREDIT_PLAN_GRACE_DAYS, 'day')
          .toDate();
        const plans = current.filter((grant) => grant.source === 'plan');
        // Newest first, so this is the plan the period was last topped up to.
        const samePeriod = plans.find(
          (grant) => grant.periodEnd?.getTime() === period.end.getTime()
        );

        if (samePeriod) {
          const left =
            dayjs(period.end).diff(dayjs()) /
            dayjs(period.end).diff(dayjs(period.start));
          const difference = Math.floor(
            (allowance - planCredits(samePeriod.tier, period.period)) *
              Math.min(Math.max(left, 0), 1)
          );
          return difference > 0
            ? {
                grant: {
                  source: 'plan',
                  amount: difference,
                  expiresAt,
                  externalRef: period.ref,
                  ...dates,
                },
              }
            : null;
        }

        if (
          plans.some((grant) => grant.periodEnd && grant.periodEnd > period.end)
        ) {
          return null;
        }

        return {
          grant: {
            source: 'plan',
            amount:
              period.prorate && period.period === 'YEARLY'
                ? planCredits(tier, 'MONTHLY') *
                  Math.min(
                    Math.ceil(dayjs(period.end).diff(dayjs(), 'month', true)),
                    12
                  )
                : allowance,
            expiresAt,
            externalRef: period.ref,
            ...dates,
          },
          close: ['plan', 'trial'],
        };
      }
    );
    return granted;
  }

  /**
   * A plan no invoice renews (a founding member's lifetime Pro, a plan an
   * admin granted) gets its credits a month at a time, counted from the day
   * the plan started, the same month the per-feature quotas count.
   *
   * A founding member whose fee waits for the end of the trial gets the
   * month as trial credits, ending with the trial: if the fee is never paid,
   * nothing is left over to spend. Once it is paid, the next pass turns them
   * into the plan's month.
   */
  async grantScheduledPlanCredits(target: {
    organizationId: string;
    subscriptionTier: string;
    createdAt: Date;
    organization: { createdAt: Date };
  }) {
    if (await this.isFoundingFeeUnpaid(target.organizationId)) {
      const trial = trialWindow(target.organization.createdAt);
      if (!trial.endsAt) {
        return false;
      }
      return this.grantPlanPeriod(target.organizationId, {
        tier: target.subscriptionTier,
        period: 'MONTHLY',
        start: new Date(target.organization.createdAt),
        end: trial.endsAt,
        ref: `founding:${target.organizationId}`,
        trial: true,
      });
    }

    const { start, end } = this.monthlyWindow(target.createdAt);
    return this.grantPlanPeriod(target.organizationId, {
      tier: target.subscriptionTier,
      period: 'MONTHLY',
      start: start.toDate(),
      end: end.toDate(),
      ref: `plan:${target.organizationId}:${start.toISOString()}`,
    });
  }

  /** The small monthly gift, once per calendar month (UTC), to a paid plan
   * that is past its trial. */
  async grantMonthlyGift(target: {
    organizationId: string;
    subscriptionTier: string;
    isLifetime: boolean;
    organization: { isTrailing: boolean; createdAt: Date };
  }) {
    // A sold plan's trial is the flag its provider keeps; a window counted
    // from signup reads a trial started weeks after signing up as over. A
    // founding member has no provider to keep it, so the window decides.
    const trialing = target.isLifetime
      ? effectiveIsTrailing({
          ...target.organization,
          subscription: { isLifetime: true },
        })
      : target.organization.isTrailing;
    if (
      !pricing[normalizeTier(target.subscriptionTier)]?.monthly_credits ||
      trialing
    ) {
      return false;
    }
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1
    ).padStart(2, '0')}`;
    const { granted } = await this._creditsService.grant(
      target.organizationId,
      {
        source: 'gift',
        amount: CREDIT_GIFT_MONTHLY * CREDIT_UNIT,
        expiresAt: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
        ),
        externalRef: `gift:${target.organizationId}:${month}`,
      }
    );
    return granted;
  }

  /** Whether this organization has a plan or trial period's credits in force. */
  async hasCurrentPlanCredits(organizationId: string) {
    return (
      (
        await this._creditsService.currentGrants(organizationId, [
          'plan',
          'trial',
        ])
      ).length > 0
    );
  }

  getCreditGrantTargets() {
    return this._subscriptionRepository.getCreditGrantTargets();
  }

  // What a plan gave ends with it. Purchased credits stay: they were paid for
  // separately and outlive the plan.
  private revokePlanCredits(organizationId: string) {
    return this._creditsService.revokeGrants(organizationId, [
      'plan',
      'trial',
      'gift',
    ]);
  }

  getCode(code: string) {
    return this._subscriptionRepository.getCode(code);
  }

  getCodesByOrgId(orgId: string) {
    return this._subscriptionRepository.getCodesByOrgId(orgId);
  }

  /** Every live, non-lifetime plan Stripe is the source of truth for. */
  getStripeSubscriptionCustomers() {
    return this._subscriptionRepository.getStripeSubscriptionCustomers();
  }

  /**
   * A founding-member fee was deferred to the end of a trial and nothing has
   * paid it yet: a `lifetime-setup:` code with no charge, retention or
   * immediate-checkout code beside it.
   */
  async isFoundingFeeUnpaid(orgId: string) {
    const codes = (await this.getCodesByOrgId(orgId)).map((c) => c.code);
    const deferred = codes.some((c) => c.startsWith('lifetime-setup:'));
    const paid = codes.some(
      (c) =>
        c.startsWith('lifetime-charge:') ||
        c.startsWith('lifetime-retention:') ||
        /^cs_/.test(c)
    );
    return deferred && !paid;
  }

  /**
   * The same fee, once the trial it waited for has ended. The founding row
   * stays in place so paying it restores everything, but until then the
   * account is treated as having no plan, the same as `lifetimePaymentPending`
   * already shows it in the app.
   */
  async isFoundingFeeOverdue(orgId: string) {
    if (!(await this.isFoundingFeeUnpaid(orgId))) {
      return false;
    }
    const org = await this._organizationService.getOrgById(orgId);
    return !trialWindow(org?.createdAt).open;
  }

  getOrgIdsWithDeferredFoundingSetup() {
    return this._subscriptionRepository.getOrgIdsWithDeferredFoundingSetup();
  }

  createUsedCode(orgId: string, code: string) {
    return this._subscriptionRepository.createUsedCode(orgId, code);
  }

  /** 'claimed' | 'duplicate' | 'in_flight' — see the repository for the rules. */
  claimStripeEvent(id: string, type: string) {
    return this._subscriptionRepository.claimStripeEvent(id, type);
  }

  completeStripeEvent(id: string) {
    return this._subscriptionRepository.completeStripeEvent(id);
  }

  releaseStripeEvent(id: string) {
    return this._subscriptionRepository.releaseStripeEvent(id);
  }

  // Customer-keyed flows must never touch a subscription owned by another provider
  async isManagedBy(customerId: string, provider: string) {
    const current =
      await this._subscriptionRepository.getSubscriptionByCustomerId(
        customerId
      );
    return !current || current.provider === provider;
  }

  async deleteSubscription(customerId: string, provider: string) {
    // A founding-member row is a local entitlement, not a mirror of a Stripe
    // subscription. Cancelling (or exhausting) a leftover Stripe sub must not
    // wipe lifetime — that used to happen after a mid-trial convert, because
    // `customer.subscription.deleted` always hard-deleted the org's row.
    const current =
      await this._subscriptionRepository.getSubscriptionByCustomerId(
        customerId
      );
    // Customer-keyed, so a subscription another provider owns (an app
    // store one, say) is not this caller's to end.
    if (current && current.provider !== provider) {
      return { count: 0 };
    }
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
    const deleted =
      await this._subscriptionRepository.deleteSubscriptionByCustomerId(
        customerId,
        provider
      );
    const org = await this.getOrganizationByCustomerId(customerId);
    if (org) {
      await this.revokePlanCredits(org.id);
    }
    return deleted;
  }

  // Store-managed subscriptions (RevenueCat etc.) have no Stripe customer, they are keyed by org
  async deleteSubscriptionByOrgId(organizationId: string, provider: string) {
    const current = await this._subscriptionRepository.getSubscriptionByOrgId(
      organizationId
    );
    if (!current || current.provider !== provider || current.isLifetime) {
      return false;
    }

    await this.modifySubscriptionByOrg(
      organizationId,
      pricing.FREE.channel || 0,
      'FREE'
    );
    const deleted = await this._subscriptionRepository.deleteSubscriptionByOrgId(
      organizationId,
      provider
    );
    await this.revokePlanCredits(organizationId);
    return deleted;
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
    const deleted =
      await this._subscriptionRepository.deleteSubscriptionByOrganizationId(
        organizationId
      );
    await this.revokePlanCredits(organizationId);
    return deleted;
  }

  updateCustomerId(organizationId: string, customerId: string) {
    return this._subscriptionRepository.updateCustomerId(
      organizationId,
      customerId
    );
  }

  setCustomerIdIfEmpty(organizationId: string, customerId: string) {
    return this._subscriptionRepository.setCustomerIdIfEmpty(
      organizationId,
      customerId
    );
  }

  getOrganizationByCustomerId(customerId: string) {
    return this._subscriptionRepository.getOrganizationByCustomerId(customerId);
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
   * Autopost rules follow the same rule on their own axis, the tier's
   * `autoPost` flag rather than the channel count, in the callers below:
   * `changeActiveCron` switches them off and stamps them on the way down to
   * FREE, and `restoreAutoDisabledAutoposts` restarts them when a plan with
   * autopost comes back. Nothing restarted them before, so a customer who
   * upgraded again found every rule off and had to find the toggle for each.
   * Only stamped rules come back, because a rule publishes by itself and one
   * the user stopped on purpose must stay stopped.
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
   * and a trialing organization reads as ULTIMATE, so a customer converting to a
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
    billing: 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'LEGACY_ULTIMATE' | 'CREATOR' | 'GROWTH' | 'ULTIMATE'
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
    } else if (!from.autoPost && to.autoPost) {
      // `to` comes from `billing`, not the organization's row: the row is
      // written after this returns, so it still holds the tier being left.
      await this._integrationService.restoreAutoDisabledAutoposts(
        organizationId
      );
    }

    return true;
  }

  async modifySubscription(
    customerId: string,
    totalChannels: number,
    billing: 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'LEGACY_ULTIMATE' | 'CREATOR' | 'GROWTH' | 'ULTIMATE'
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
    } else if (!from.autoPost && to.autoPost) {
      // `to` comes from `billing`, not the organization's row: the row is
      // written after this returns, so it still holds the tier being left.
      await this._integrationService.restoreAutoDisabledAutoposts(
        getOrgByCustomerId?.id!
      );
    }

    return true;
  }

  async createOrUpdateSubscription(
    provider: string,
    isTrailing: boolean,
    identifier: string,
    customerId: string,
    totalChannels: number,
    billing:
      | 'STANDARD'
      | 'TEAM'
      | 'PRO'
      | 'LEGACY_ULTIMATE'
      | 'CREATOR'
      | 'GROWTH'
      | 'ULTIMATE',
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null,
    code?: string,
    org?: string
  ) {
    if (!code) {
      if (!(await this.isManagedBy(customerId, provider))) {
        return {};
      }
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
      // trialing organization reads as ULTIMATE, and taking channels off someone
      // at the moment they pay is not a trade worth making.
      await this.restoreChannelsUpTo(org, totalChannels);
      // Restore only, like the channels. The rules that come back are the ones
      // a drop to FREE stamped, so there is no old tier to compare against.
      if (pricing[billing].autoPost) {
        await this._integrationService.restoreAutoDisabledAutoposts(org);
      }
    }
    return this._subscriptionRepository.createOrUpdateSubscription(
      provider,
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

  async createOrUpdateSubscriptionByOrg(
    isTrailing: boolean,
    organizationId: string,
    provider: string,
    identifier: string,
    totalChannels: number,
    billing: 'STANDARD' | 'TEAM' | 'PRO' | 'LEGACY_ULTIMATE',
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null
  ) {
    const current = await this._subscriptionRepository.getSubscriptionByOrgId(
      organizationId
    );
    if (current && (current.isLifetime || current.provider !== provider)) {
      return {};
    }

    try {
      const load = await this.modifySubscriptionByOrg(
        organizationId,
        totalChannels,
        billing
      );
      if (!load) {
        return {};
      }
    } catch (e) {
      return {};
    }

    return this._subscriptionRepository.createOrUpdateSubscription(
      provider,
      isTrailing,
      identifier,
      '',
      totalChannels,
      billing,
      period,
      cancelAt,
      undefined,
      { id: organizationId }
    );
  }

  getSubscriptionByIdentifier(identifier: string) {
    return this._subscriptionRepository.getSubscriptionByIdentifier(identifier);
  }

  // For work that is metered (minutes) and outlives a single call, so it can't
  // be wrapped in useCredit: the caller picks the id, charging twice is one
  // row, and the same id refunds it on failure
  chargeCredits(
    id: string,
    organizationId: string,
    type: string,
    credits: number
  ) {
    return this._subscriptionRepository.chargeCredits(
      id,
      organizationId,
      type,
      credits
    );
  }

  refundCredits(organizationId: string, id: string) {
    return this._subscriptionRepository.refundCredits(organizationId, id);
  }

  async getSubscription(organizationId: string) {
    return this._subscriptionRepository.getSubscription(organizationId);
  }

  async checkCredits(organization: Organization, checkType = 'ai_images') {
    // Billing off: nothing is metered. Without this a self-hosted organization,
    // which has no Subscription row, counted as FREE and got 0 credits, so every
    // video generation (dashboard, public API, MCP, the orchestrator) was refused
    // with a 402 asking it to upgrade.
    const window = this.creditWindow(organization, checkType);
    if (!window) {
      return { credits: 1000000 };
    }

    if (!window.limit) {
      return { credits: 0 };
    }

    const totalUse = await this._subscriptionRepository.getCreditsFrom(
      organization.id,
      window.from,
      checkType
    );

    return {
      credits: window.limit - totalUse,
    };
  }

  async addSubscription(
    orgId: string,
    userId: string,
    subscription: any,
    provider: string
  ) {
    await this._subscriptionRepository.setCustomerId(orgId, userId);
    return this.createOrUpdateSubscription(
      provider,
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
