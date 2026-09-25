import { HttpException, Injectable, Logger } from '@nestjs/common';
import { PaymentProviderManager } from '@gitroom/nestjs-libraries/services/payment/payment.provider.manager';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { PaymentPlatform } from '@gitroom/nestjs-libraries/services/payment/payment.provider.interface';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

@Injectable()
export class PaymentService {
  constructor(
    private _paymentProviderManager: PaymentProviderManager,
    private _subscriptionService: SubscriptionService
  ) {}

  async webhook(
    provider: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>
  ) {
    const paymentProvider = this._paymentProviderManager.getProvider(provider);
    const event = await paymentProvider.validateWebhook(rawBody, headers);
    return paymentProvider.processWebhook(event);
  }

  syncSubscription(provider: string, organizationId: string) {
    return this._paymentProviderManager
      .getProvider(provider)
      .syncSubscription(organizationId);
  }

  getDefaultProvider(platform: PaymentPlatform) {
    return this._paymentProviderManager.getDefaultProvider(platform).provider;
  }

  getDefaultProviderName(platform: PaymentPlatform) {
    return this._paymentProviderManager.getDefaultProvider(platform).name;
  }

  // Subscription row + the platform (web / mobile) of the provider that owns it,
  // so clients can tell the user where to manage the subscription.
  async getSubscription(organizationId: string) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );
    if (!subscription) {
      return null;
    }

    // A dangling provider name (provider removed from the build) must not
    // break reading the subscription
    let platform: PaymentPlatform | undefined;
    try {
      platform = this._paymentProviderManager.getProvider(
        subscription.provider
      ).platform;
    } catch (err) {
      platform = undefined;
    }

    return {
      ...subscription,
      platform,
    };
  }

  /**
   * Stripe Customer Portal is a web/Stripe surface. Block it only when the
   * live subscription is on another platform (RevenueCat / app stores).
   * Unknown historic providers (`manual` gifted lifetime) are treated as web:
   * those orgs still need card + invoice history, and looking them up as a
   * PaymentProvider throws.
   */
  async assertWebPortal(organizationId: string) {
    const subscription = await this.getSubscription(organizationId);
    if (subscription?.platform && subscription.platform !== 'web') {
      throw new HttpException(
        `Your subscription is managed on ${subscription.platform}, please use ${subscription.platform} to manage it`,
        400
      );
    }
  }

  // The provider that handles billing actions for this organization on the
  // given platform: the one owning the current subscription, otherwise the
  // platform default. Throws when the subscription lives on another platform.
  async getProviderForOrganization(
    organizationId: string,
    platform: PaymentPlatform
  ) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );

    if (!subscription) {
      return this._paymentProviderManager.getDefaultProvider(platform).provider;
    }

    const current = this._paymentProviderManager.getProvider(
      subscription.provider
    );
    if (current.platform !== platform) {
      throw new HttpException(
        `Your subscription is managed on ${current.platform}, please use ${current.platform} to manage it`,
        400
      );
    }

    return current;
  }

  // An organization subscribed through one provider cannot checkout, sync or
  // manage the subscription through another one.
  async assertCanUseProvider(organizationId: string, provider: string) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );

    if (!subscription || subscription.provider === provider) {
      return;
    }

    const current = this._paymentProviderManager.getProvider(
      subscription.provider
    );
    const requested = this._paymentProviderManager.getProvider(provider);

    throw new HttpException(
      current.platform !== requested.platform
        ? `Your subscription is managed on ${current.platform}, please use ${current.platform} to manage it`
        : `Your subscription is managed by ${subscription.provider}`,
      400
    );
  }

  // Account deletion: the provider owning the org's subscription, or - when
  // there is no row (missed webhook, cleaned up) - every provider, so nothing
  // keeps charging a deleted account. Providers no-op when they own nothing.
  async cancelAllSubscriptions(organizationId: string) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );

    if (subscription) {
      return this._paymentProviderManager
        .getProvider(subscription.provider)
        .cancelAllSubscriptions(organizationId);
    }

    for (const { provider } of this._paymentProviderManager.getProviders()) {
      await provider.cancelAllSubscriptions(organizationId);
    }
  }

  async syncCustomerEmailsAfterSwitch(
    accounts: { id: string; email: string }[]
  ) {
    for (const { provider } of this._paymentProviderManager.getProviders()) {
      await provider.syncCustomerEmailsAfterSwitch(accounts);
    }
  }

  /**
   * Keeps every plan's credits in place, once a day (`creditGrantsWorkflowV1`).
   * The provider that owns a plan grants whatever its own events have not
   * brought (`grantMissingPlanCredits`); a plan with no registered provider
   * gets its month from the plan's start day. Then every paid plan past its
   * trial gets the monthly gift. Idempotent throughout, and one organization
   * failing does not stop the rest.
   */
  async grantScheduledCredits() {
    const result = { checked: 0, granted: 0, failed: 0 };
    if (!isBillingEnabled()) {
      return result;
    }
    for (const target of await this._subscriptionService.getCreditGrantTargets()) {
      result.checked++;
      try {
        if (
          await this._subscriptionService.isFoundingFeeOverdue(
            target.organizationId
          )
        ) {
          continue;
        }
        // A plan no registered provider sells (one set by hand, such as the
        // "manual" rows in production) has no events to bring its credits,
        // so it gets them a month at a time, like a founding member's.
        const provider = this._paymentProviderManager
          .getProviders()
          .find((p) => p.name === target.provider)?.provider;
        if (
          provider
            ? await provider.grantMissingPlanCredits(target)
            : await this._subscriptionService.grantScheduledPlanCredits(target)
        ) {
          result.granted++;
        }
        if (await this._subscriptionService.grantMonthlyGift(target)) {
          result.granted++;
        }
      } catch (err) {
        result.failed++;
        Logger.warn(
          `[credits] grant failed for ${target.organizationId}: ${
            (err as Error)?.message || err
          }`
        );
      }
    }
    return result;
  }
}
