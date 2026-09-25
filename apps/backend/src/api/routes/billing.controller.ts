import { Body, Controller, Get, HttpException, HttpStatus, Logger, Param, Post, Req } from '@nestjs/common';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization, User } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { BillingSubscribeDto } from '@gitroom/nestjs-libraries/dtos/billing/billing.subscribe.dto';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import {
  LIFETIME_ON_SALE,
  lifetimeWindow,
  trialWindow,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { AdminApplyCouponDto } from '@gitroom/nestjs-libraries/dtos/billing/admin.apply.coupon.dto';
import { ApiTags } from '@nestjs/swagger';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Request } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import { PaymentService } from '@gitroom/nestjs-libraries/services/payment/payment.service';
import { BillingSyncDto } from '@gitroom/nestjs-libraries/dtos/billing/billing.sync.dto';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { CreditsService } from '@gitroom/nestjs-libraries/database/prisma/credits/credits.service';

@ApiTags('Billing')
@Controller('/billing')
export class BillingController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _notificationService: NotificationService,
    private _usersService: UsersService,
    private _organizationService: OrganizationService,
    private _paymentService: PaymentService,
    // Stripe-only flows (lifetime, the founding fee, the retention offer) have
    // no counterpart on the other payment providers, so they stay on Stripe.
    private _stripeService: StripeService,
    private _creditsService: CreditsService
  ) {}

  // Billing routes are the web platform; the org's own provider (or the web
  // default when it has none) handles the action.
  private provider(org: Organization) {
    return this._paymentService.getProviderForOrganization(org.id, 'web');
  }

  // With billing off there is nothing to buy, manage or charge, and these
  // routes would reach Stripe with the `sk_nothing` placeholder from
  // stripe.service.ts: an error the caller cannot act on, or a 401 that signs
  // them out. Hiding the pages in the nav is not a control — the routes are
  // reachable. RevenueCat's /sync and /check/:id are left alone; that provider
  // does not depend on the Stripe keys.
  private assertBillingEnabled() {
    if (!isBillingEnabled()) {
      throw new HttpException(
        'Billing is not configured on this installation',
        HttpStatus.NOT_IMPLEMENTED
      );
    }
  }

  private async assertNoOtherSubscribedAccount(user: User) {
    const other = await this._usersService.getUserWithActiveSubscriptionByEmail(
      user.email,
      user.id
    );
    return !!other;
  }

  @Get('/check/:id')
  async checkId(
    @GetOrgFromRequest() org: Organization,
    @Param('id') body: string
  ) {
    return {
      status: await (await this.provider(org)).checkSubscription(org.id, body),
    };
  }

  @Get('/check-discount')
  async checkDiscount(@GetOrgFromRequest() org: Organization) {
    if (!isBillingEnabled()) {
      return { offerCoupon: false };
    }
    return {
      offerCoupon: !(await (await this.provider(org)).checkDiscount(org))
        ? false
        : AuthService.signJWT({ discount: true }),
    };
  }

  @Post('/apply-discount')
  // It changes what the organization's card is charged, so admins only,
  // like every other billing action.
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async applyDiscount(@GetOrgFromRequest() org: Organization) {
    this.assertBillingEnabled();
    // Returns the result, like `apply-lifetime-retention` right below. It used
    // to `await` and discard it, so a 200 with an empty body meant both "the
    // coupon is on" and "nothing was applied" — and the cancel dialog read the
    // HTTP status alone, told the customer "50% discount applied successfully"
    // and closed as `applied`. They got neither the discount nor the
    // cancellation they came for.
    try {
      return { ok: await (await this.provider(org)).applyDiscount(org) };
    } catch (err) {
      Logger.error(
        `[billing] apply-discount failed for org ${org.id}: ${
          (err as Error)?.message ?? err
        }`
      );
      return { ok: false };
    }
  }

  @Post('/apply-lifetime-retention')
  // It changes what the organization's card is charged, so admins only,
  // like every other billing action.
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async applyLifetimeRetention(@GetOrgFromRequest() org: Organization) {
    this.assertBillingEnabled();
    return this._stripeService.applyLifetimeRetentionOffer(org.id);
  }

  @Post('/finish-trial')
  // It changes what the organization's card is charged, so admins only,
  // like every other billing action.
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async finishTrial(@GetOrgFromRequest() org: Organization) {
    this.assertBillingEnabled();
    // Two ways a trial ends, and the caller polls `is-trial-finished` until the
    // organization's flag clears either way.
    //
    // When Stripe has a trialing subscription, ending it there is enough: the
    // webhook clears the flag. When it has none — a founding member, whose
    // entitlement is a local row and never a Stripe subscription — no webhook
    // is ever coming, so the flag is cleared here. Without this the caller
    // polled forever and the "End free trial" dialog never closed.
    //
    // Deferred founding purchases charge the founding fee here (force) before the flag
    // clears, so "End free trial" matches money the same way a Stripe
    // subscription trial does. If that charge fails (dead card), leave the
    // trial flag alone — clearing it would unlock a founding member who never
    // paid. The FinishTrial overlay keeps polling until money clears or the
    // window closes and settleFoundingLifetimeAfterTrial runs.
    //
    // The error is still swallowed, as before, so a Stripe outage cannot leave
    // somebody stuck in a dialog. But `ended: false` is not an error, and only
    // that specific answer clears the flag locally.
    const provider = await this.provider(org);
    let captureBlocked = false;
    let error: string | undefined;
    let status: string | undefined;
    try {
      const { ended } = await provider.finishTrial(org);
      const capture = await this._stripeService.captureFoundingLifetimeIfDue(
        org.id,
        {
          force: true,
        }
      );
      captureBlocked = !!(
        ('error' in capture && capture.error) ||
        ('status' in capture && capture.status)
      );
      if ('error' in capture && capture.error) error = String(capture.error);
      if ('status' in capture && capture.status) status = String(capture.status);
      if (!ended && !captureBlocked) {
        await this._organizationService.endTrial(org.id);
      }
    } catch (err) {}
    return {
      finish: true,
      captureBlocked,
      ...(error ? { error } : {}),
      ...(status ? { status } : {}),
    };
  }

  // The organization's credits balance, in credits (not hundredths).
  @Get('/credits')
  credits(@GetOrgFromRequest() org: Organization) {
    return this._creditsService.balance(org.id);
  }

  @Get('/is-trial-finished')
  async isTrialFinished(@GetOrgFromRequest() org: Organization) {
    // Billing off: there is no trial, so it is always over.
    if (!isBillingEnabled()) {
      return { finished: true, captureBlocked: false };
    }

    // Lazy capture when the derived trial window has already closed (no
    // finish-trial click). force:false so we never charge mid-trial.
    //
    // Use settleFoundingLifetimeAfterTrial (raw DB isTrailing) — the request
    // org's isTrailing is middleware-derived, so `org.isTrailing && !window`
    // was dead code and never cleared the row after natural expiry.
    let captureBlocked = false;
    let error: string | undefined;
    let status: string | undefined;
    try {
      const capture =
        await this._stripeService.settleFoundingLifetimeAfterTrial(org.id);
      captureBlocked = !!(
        ('error' in capture && capture.error) ||
        ('status' in capture && capture.status)
      );
      if ('error' in capture && capture.error) error = String(capture.error);
      if ('status' in capture && capture.status) status = String(capture.status);
    } catch (err) {}

    // Deferred founding still unpaid after the window — never report finished
    // (avoids false thank-you). Mid-trial owed alone is fine: finish-trial uses
    // force:true and surfaces captureBlocked on the POST itself.
    const windowOpen = trialWindow(org.createdAt).open;
    const owed = await this._stripeService.isDeferredFoundingFeeOwed(org.id);
    if (captureBlocked || (owed && !windowOpen)) {
      return {
        finished: false,
        captureBlocked: true,
        ...(error ? { error } : {}),
        ...(status ? { status } : {}),
      };
    }

    return {
      finished: !org.isTrailing || !windowOpen,
      captureBlocked: false,
    };
  }

  @Post('/embedded')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async embedded(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BillingSubscribeDto,
    @Req() req: Request
  ) {
    this.assertBillingEnabled();
    if (await this.assertNoOtherSubscribedAccount(user)) {
      return { blocked: true };
    }

    const uniqueId = req?.cookies?.track;
    return (await this.provider(org)).embedded(
      uniqueId,
      org.id,
      user.id,
      body,
      org.allowTrial
    );
  }

  @Post('/subscribe')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async subscribe(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BillingSubscribeDto,
    @Req() req: Request
  ) {
    this.assertBillingEnabled();

    if (await this.assertNoOtherSubscribedAccount(user)) {
      return { blocked: true };
    }

    const uniqueId = req?.cookies?.track;
    return (await this.provider(org)).subscribe(
      uniqueId,
      org.id,
      user.id,
      body,
      org.allowTrial
    );
  }

  @Post('/sync')
  async sync(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BillingSyncDto
  ) {
    if (await this.assertNoOtherSubscribedAccount(user)) {
      return { blocked: true };
    }
    await this._paymentService.assertCanUseProvider(org.id, body.provider);

    try {
      return await this._paymentService.syncSubscription(body.provider, org.id);
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException((e as Error)?.message || 'Sync failed', 400);
    }
  }

  @Get('/portal')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async modifyPayment(@GetOrgFromRequest() org: Organization) {
    this.assertBillingEnabled();
    // Stripe Customer Portal is how web customers update the card, tax IDs,
    // and download invoices — including founding members. Those entitlements
    // are often a local `manual` subscription row (admin gift / impersonate),
    // not a Stripe Price. Routing this through getProviderForOrganization
    // throws "Payment provider manual not found" and the button looks dead.
    // Mobile (RevenueCat) still has to manage billing in the store.
    await this._paymentService.assertWebPortal(org.id);
    const { url } = await this._stripeService.portalLink(org.id);
    return {
      portal: url,
    };
  }

  // The open invoice of a subscription whose payment failed, shown by the
  // paywall in place of a new checkout. `{}` when there is nothing to pay.
  // Straight to Stripe, like `/portal`: the provider lookup throws for an
  // organization on a local `manual` row, and only Stripe keeps retrying.
  @Get('/pending-payment')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async pendingPayment(@GetOrgFromRequest() org: Organization) {
    if (!isBillingEnabled()) {
      return {};
    }
    return (await this._stripeService.pendingPayment(org)) || {};
  }

  @Get('/')
  getCurrentBilling(@GetOrgFromRequest() org: Organization) {
    if (!isBillingEnabled()) {
      return null;
    }
    return this._paymentService.getSubscription(org.id);
  }

  @Post('/cancel')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async cancel(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: { feedback: string }
  ) {
    this.assertBillingEnabled();
    // The same call un-cancels a cancelled plan, and then `cancel_at` is
    // empty: only a cancellation tells the team and confirms to the customer.
    const result = await (await this.provider(org)).setToCancel(org.id);
    if (result?.cancel_at) {
      await this._organizationService.sendCancellationFeedback(
        org,
        user.email,
        body.feedback
      );
      await this._organizationService.sendCancellationConfirmation(
        org,
        user.email,
        result.cancel_at
      );
    }
    return result;
  }

  @Post('/prorate')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async prorate(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BillingSubscribeDto
  ) {
    this.assertBillingEnabled();
    return (await this.provider(org)).prorate(org.id, body);
  }

  @Get('/charges')
  async getCharges(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return (await this.provider(org)).getCharges(org.id);
  }

  @Post('/refund-charges')
  async refundCharges(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @Body() body: { chargeIds: string[] }
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return (await this.provider(org)).refundCharges(org.id, body.chargeIds);
  }

  @Post('/cancel-subscription')
  async cancelSubscription(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return (await this.provider(org)).cancelSubscription(org.id);
  }

  @Get('/coupon-info')
  async couponInfo(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return (await this.provider(org)).getCouponInfo(org.id);
  }

  @Post('/apply-coupon')
  async applyCoupon(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @Body() body: AdminApplyCouponDto
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return (await this.provider(org)).applyCoupon(org.id, body);
  }

  @Post('/cancel-coupon')
  async cancelCoupon(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Unauthorized', 400);
    }

    return (await this.provider(org)).cancelCoupon(org.id);
  }

  @Post('/lifetime-checkout')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async lifetimeCheckout(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    this.assertBillingEnabled();
    const sub =
      await this._subscriptionService.getSubscriptionByOrganizationId(org.id);
    // Paid founding member: no second purchase. Lifetime-on-trial already converted.
    if (sub?.isLifetime && !org.isTrailing) {
      throw new HttpException(
        { success: false, message: 'Already a founding member.' },
        HttpStatus.CONFLICT
      );
    }
    if (sub?.isLifetime && org.isTrailing) {
      throw new HttpException(
        { success: false, message: 'Already on the founding-member trial.' },
        HttpStatus.CONFLICT
      );
    }
    if (!LIFETIME_ON_SALE) {
      throw new HttpException(
        { success: false, message: 'The founding-member offer has closed.' },
        HttpStatus.GONE
      );
    }
    // Trial convert (design): entire trial, not only the 24h founding window.
    // Founding window still covers free / non-trial signups on /billing/lifetime.
    const trialConvert = !!org.isTrailing;
    if (!trialConvert && !lifetimeWindow(user.createdAt).open) {
      throw new HttpException(
        { success: false, message: 'The founding-member offer has closed.' },
        HttpStatus.GONE
      );
    }

    return this._stripeService.createLifetimeCheckout(org);
  }

  @Post('/add-subscription')
  async addSubscription(
    @Body() body: { subscription: string },
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    if (!user.isSuperAdmin) {
      throw new Error('Unauthorized');
    }

    await this._subscriptionService.addSubscription(
      org.id,
      user.id,
      body.subscription,
      this._paymentService.getDefaultProviderName('web')
    );
  }
}
