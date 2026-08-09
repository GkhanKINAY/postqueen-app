import Stripe from 'stripe';
import { Injectable, Logger } from '@nestjs/common';
import { Organization, User } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { BillingSubscribeDto } from '@gitroom/nestjs-libraries/dtos/billing/billing.subscribe.dto';
import { groupBy } from 'lodash';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import {
  LIFETIME_GRANT_TIER,
  LIFETIME_PRICE,
  LIFETIME_RETENTION_PRICE,
  PaidTier,
  pricing,
  trialWindow,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';

/**
 * Pinned on purpose. This file reads deep, version-sensitive shapes —
 * `invoice.parent.subscription_details.subscription`, `discount.source.coupon` —
 * that a Stripe API version bump can move without any type error, because the
 * SDK types travel with the SDK. Unpinned, the version in force is whatever the
 * installed SDK happens to default to, so `pnpm update stripe` silently becomes
 * a billing change. This is the version the account and stripe@20.4.0 already
 * agree on today, so pinning it changes nothing now and freezes the contract.
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_nothing', {
  apiVersion: '2026-02-25.clover',
});

/**
 * Stamped on every subscription this app creates. The webhook uses it to ignore
 * events from other integrations that share the same Stripe account, so the
 * value written here and the value accepted there must always agree — if they
 * drift apart, subscription events are silently discarded and nothing errors.
 */
export const SUBSCRIPTION_SERVICE_TAG = 'postqueen';

/**
 * Stripe subscription statuses that mean "this customer is entitled right now".
 *
 * `past_due` is in deliberately: Stripe is still retrying, and dunning is the
 * grace period. Whether it ever ends is a Dashboard setting — with "mark unpaid"
 * no `customer.subscription.deleted` is ever sent, which is why `updateSubscription`
 * revokes on the terminal statuses itself rather than waiting for one.
 */
const ENTITLED_STATUSES: Stripe.Subscription.Status[] = [
  'active',
  'trialing',
  'past_due',
];

@Injectable()
export class StripeService {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _organizationService: OrganizationService,
    private _userService: UsersService,
    private _trackService: TrackService,
    // For `paymentFailed` — a failed renewal has to reach the customer, and
    // this is the same service the cancellation email already goes through.
    private _notificationService: NotificationService
  ) {}
  validateRequest(rawBody: Buffer, signature: string, endpointSecret: string) {
    return stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  }

  /**
   * Whether this event may be processed now.
   *
   * Stripe redelivers on any non-2xx and may deliver twice regardless, and no
   * handler here is naturally idempotent — a second `invoice.payment_succeeded`
   * fires the purchase conversion again, a second `invoice.payment_failed`
   * re-notifies the customer.
   */
  claimEvent(id: string, type: string) {
    return this._subscriptionService.claimStripeEvent(id, type);
  }

  /** Stamp a claimed event as finished so redeliveries are dropped. */
  completeEvent(id: string) {
    return this._subscriptionService.completeStripeEvent(id);
  }

  /** Undo a claim so a failed handler still gets Stripe's retry. */
  releaseEvent(id: string) {
    return this._subscriptionService.releaseStripeEvent(id);
  }

  /**
   * Whether Stripe still shows something entitling this customer.
   *
   * Every revoke path here is keyed by customer, not by the object that
   * triggered it, so without this a terminal event for ONE subscription — or a
   * refund of ONE old charge — takes the whole account down. The concrete case:
   * a card fails at signup, the customer retries on a working one, and ~23 hours
   * later the abandoned attempt turns `incomplete_expired` and cuts off somebody
   * who has been paying ever since.
   *
   * A founding member has no Stripe subscription at all, so this correctly
   * reports false for them — a disputed or refunded founding payment should
   * revoke.
   *
   * Deliberately does NOT exclude the subscription that triggered the event.
   * Excluding it looked right — "ignore the one that just died" — but it blinds
   * the check to that subscription's *live* status, which is the only status
   * worth reading. Stripe promises no event ordering, so a subscription that
   * went `paused` and then `active` again can deliver `paused` last; excluding
   * it would find nothing else entitling and revoke a customer who is, right
   * now, active. Reading every subscription's current state answers both cases:
   * the abandoned `incomplete_expired` attempt is skipped because the *other*
   * subscription is live, and the out-of-order case is skipped because the
   * subscription itself is.
   */
  private async hasEntitlingSubscription(customer: string) {
    const all = await stripe.subscriptions.list({
      customer,
      status: 'all',
      limit: 100,
    });
    return all.data.some((s) => ENTITLED_STATUSES.includes(s.status));
  }

  /**
   * A $1 off-session authorization against the card, for trial signups.
   *
   * It no longer cancels anything. It used to: if the probe came back as
   * anything other than `requires_capture`, or threw, it detached the card and
   * called `subscriptions.cancel` on the subscription the customer had just
   * completed Checkout for. Every new organization carries `allowTrial: true`
   * until this webhook clears it, so that branch was on the path of the *first*
   * subscription of every account.
   *
   * Three ways it fired on a perfectly good card: `off_session: true` throws
   * `authentication_required` for any card that wants 3DS, which in an EU
   * account is most of them; `currency: 'usd'` is hardcoded, and some issuers
   * refuse a foreign-currency zero-value-style auth; and the detach used
   * `paymentMethods.data[0].id` while the probe used `latestMethod.id`, so it
   * could unlink a different card than the one that failed.
   *
   * Stripe Checkout has already validated and, where required, 3DS-verified the
   * card before this event exists. A second off-session probe adds no signal
   * worth a false positive that cancels a paid subscription, so the result is
   * now advisory: logged, never acted on.
   */
  async checkValidCard(
    event:
      | Stripe.CustomerSubscriptionCreatedEvent
      | Stripe.CustomerSubscriptionUpdatedEvent
  ) {
    if (event.data.object.status === 'incomplete') {
      return false;
    }

    const getOrgFromCustomer =
      await this._organizationService.getOrgByCustomerId(
        event.data.object.customer as string
      );

    if (!getOrgFromCustomer?.allowTrial) {
      return true;
    }

    console.log('Checking card');

    const paymentMethods = await stripe.paymentMethods.list({
      customer: event.data.object.customer as string,
    });

    // find the last one created
    const latestMethod = paymentMethods.data.reduce(
      (prev, current) => {
        if (prev.created < current.created) {
          return current;
        }
        return prev;
      },
      { created: -100 } as Stripe.PaymentMethod
    );

    if (!latestMethod.id) {
      Logger.warn(
        `[stripe] no payment method on customer ${event.data.object.customer}; granting anyway`
      );
      return true;
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 100,
        currency: 'usd',
        payment_method: latestMethod.id,
        customer: event.data.object.customer as string,
        off_session: true,
        capture_method: 'manual', // Authorize without capturing
        confirm: true, // Confirm the PaymentIntent
      });

      if (paymentIntent.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(paymentIntent.id as string);
      } else {
        // Release the hold if one was placed. Without this a failed probe left
        // a $1 authorization sitting on the card until it expired.
        try {
          await stripe.paymentIntents.cancel(paymentIntent.id as string);
        } catch {
          /* nothing to release */
        }
        Logger.warn(
          `[stripe] card probe for ${event.data.object.customer} came back ${paymentIntent.status}; granting anyway`
        );
      }
    } catch (err) {
      Logger.warn(
        `[stripe] card probe for ${event.data.object.customer} threw (${
          (err as Error)?.message || err
        }); granting anyway`
      );
    }

    return true;
  }

  async createSubscription(event: Stripe.CustomerSubscriptionCreatedEvent) {
    const {
      uniqueId,
      billing,
      period,
    } = event.data.object.metadata as {
      // Stripe hands this back as whatever was written when the subscription
      // was created, so it has to name every tier that can be sold, not the
      // two that could when this was written.
      billing: PaidTier;
      period: 'MONTHLY' | 'YEARLY';
      uniqueId: string;
    };

    // `pricing[billing]` used to be dereferenced unguarded a few lines down.
    // `billing` comes from Stripe metadata, so a subscription created outside
    // this app — in the Dashboard, say — that still carries our service tag
    // threw a TypeError, which the webhook answered as 500 and Stripe then
    // retried every few hours for three days. A retry cannot conjure the
    // missing metadata, so this is acknowledged and dropped instead.
    if (!pricing[billing]) {
      Logger.warn(
        `[stripe] subscription ${event.data.object.id} has no usable billing metadata (${billing}); ignoring`
      );
      return { ok: true, granted: false, reason: 'unknown tier' };
    }

    // `checkValidCard` now returns false for exactly one reason: the
    // subscription is still `incomplete`, meaning Stripe has not taken the
    // money yet and will send another event when it does. Answering 2xx there
    // is right — there is nothing to retry.
    //
    // What must NOT happen is answering 2xx after failing to grant. Stripe
    // treats any 2xx as delivered and never sends the event again, so a
    // swallowed error here is a customer who paid and stayed on FREE with no
    // second chance. Anything unexpected is rethrown so the webhook 500s and
    // Stripe retries it for three days.
    if (!(await this.checkValidCard(event))) {
      return { ok: true, granted: false, reason: 'incomplete' };
    }

    return this._subscriptionService.createOrUpdateSubscription(
      // This argument is the organization's trial flag, and it used to read
      // `status !== 'active'` — which is true of `past_due`, `unpaid`,
      // `incomplete` and `paused` as well as `trialing`. A test clock caught it:
      // advancing to a renewal the card refused left the subscription
      // `past_due`, and the customer was written back into a **trial they were
      // not on** — re-locking X and putting the trial banner in front of
      // somebody who had been paying for a month. Only one status is a trial.
      event.data.object.status === 'trialing',
      uniqueId,
      event.data.object.customer as string,
      pricing[billing].channel!,
      billing,
      period,
      event.data.object.cancel_at
    );
  }

  async updateSubscription(event: Stripe.CustomerSubscriptionUpdatedEvent) {
    const {
      uniqueId,
      billing,
      period,
    } = event.data.object.metadata as {
      // Stripe hands this back as whatever was written when the subscription
      // was created, so it has to name every tier that can be sold, not the
      // two that could when this was written.
      billing: PaidTier;
      period: 'MONTHLY' | 'YEARLY';
      uniqueId: string;
    };

    // Terminal statuses are handled FIRST, before the metadata and card checks
    // below. Both of those exist to decide what to *grant*, and neither has any
    // bearing on taking access away — running them first meant a subscription
    // with unusable metadata could never be revoked at all, and that every
    // revoke fired a $1 off-session authorization against the card of the very
    // customer being cut off.
    //
    // These three are terminal — Stripe has finished trying and is not coming
    // back — and for `unpaid` and `paused` **no `customer.subscription.deleted`
    // is ever sent**. Merely refusing to re-grant left whatever was already
    // written in place, so the account kept its paid plan, for free, with no
    // further event able to correct it.
    //
    // `canceled` is deliberately absent: it always arrives with a `deleted`
    // event of its own, and revoking twice would race it.
    const TERMINAL: Stripe.Subscription.Status[] = [
      'unpaid',
      'paused',
      'incomplete_expired',
    ];
    if (TERMINAL.includes(event.data.object.status)) {
      const customer = event.data.object.customer as string;

      if (await this.hasEntitlingSubscription(customer)) {
        return {
          ok: true,
          granted: false,
          revoked: false,
          reason: `status ${event.data.object.status}, another subscription is still active`,
        };
      }

      await this._subscriptionService.deleteSubscription(customer);
      return {
        ok: true,
        granted: false,
        revoked: true,
        reason: `status ${event.data.object.status}`,
      };
    }

    // Same guard as createSubscription — see the note there.
    if (!pricing[billing]) {
      Logger.warn(
        `[stripe] subscription ${event.data.object.id} has no usable billing metadata (${billing}); ignoring`
      );
      return { ok: true, granted: false, reason: 'unknown tier' };
    }

    // Same reasoning as createSubscription: false here means `incomplete`, so
    // nothing to grant and nothing to retry.
    if (!(await this.checkValidCard(event))) {
      return { ok: true, granted: false, reason: 'incomplete' };
    }

    // Only `ENTITLED_STATUSES` writes the paid tier. The gate used to be
    // `status !== 'incomplete'`, which let `canceled`, `unpaid`,
    // `incomplete_expired` and `paused` all through and wrote the full tier back
    // with `deletedAt: null`. Stripe does not promise event ordering either, so
    // a `deleted` processed before a trailing `updated` had its row deleted and
    // then recreated — permanently entitled, with nothing left to correct it.
    if (!ENTITLED_STATUSES.includes(event.data.object.status)) {
      return {
        ok: true,
        granted: false,
        reason: `status ${event.data.object.status}`,
      };
    }

    return this._subscriptionService.createOrUpdateSubscription(
      event.data.object.status === 'trialing',
      uniqueId,
      event.data.object.customer as string,
      pricing[billing].channel!,
      billing,
      period,
      event.data.object.cancel_at
    );
  }

  async deleteSubscription(event: Stripe.CustomerSubscriptionDeletedEvent) {
    await this._subscriptionService.deleteSubscription(
      event.data.object.customer as string
    );
  }

  // After a login swap, move each Stripe customer's email to the login that
  // now owns it. Owner-only so a member's switch can't rewrite a shared org's
  // billing email, deduped per customer, and skipping admin-granted
  // subscriptions (their paymentId is a user id, not a `cus_...` customer).
  async syncCustomerEmailsAfterSwitch(
    accounts: { id: string; email: string }[]
  ) {
    if (!process.env.STRIPE_PUBLISHABLE_KEY) {
      return;
    }
    const emailByCustomer = new Map<string, string>();
    for (const account of accounts) {
      const organizations = await this._organizationService.getOrgsByUserId(
        account.id
      );
      for (const org of organizations) {
        if (
          org.users?.[0]?.role === 'SUPERADMIN' &&
          org.paymentId?.startsWith('cus_') &&
          !emailByCustomer.has(org.paymentId)
        ) {
          emailByCustomer.set(org.paymentId, account.email);
        }
      }
    }
    await Promise.all(
      [...emailByCustomer].map(([customerId, email]) =>
        stripe.customers
          .update(customerId, {
            email: email.indexOf('@') > -1 ? email : `${email}@postqueen.ai`,
          })
          .catch(() => {})
      )
    );
  }

  async createOrGetCustomer(organization: Organization) {
    if (organization.paymentId) {
      return organization.paymentId;
    }

    const users = await this._organizationService.getTeam(organization.id);
    const customer = await stripe.customers.create({
      email: users.users[0].user.email.indexOf('@') > -1 ? users.users[0].user.email : `${users.users[0].user.email}@no-reply.invalid`,
      name: organization.name,
    });
    await this._subscriptionService.updateCustomerId(
      organization.id,
      customer.id
    );
    return customer.id;
  }

  async getPackages() {
    // A self-hosted install has no key, so line 19 hands Stripe the string
    // 'sk_nothing' and this call comes back 401. That 401 is not harmless: the
    // frontend treats any 401 as an expired session, clears the auth cookie and
    // sends the browser to the login page — so opening /billing on an install
    // with billing switched off *signs the user out*. Billing is hidden from
    // the navigation there, but the route is still reachable by URL.
    //
    // There are no packages to list when nobody can buy one, so say that
    // instead of asking Stripe.
    if (!isBillingEnabled()) {
      return {};
    }

    const products = await stripe.prices.list({
      active: true,
      expand: ['data.tiers', 'data.product'],
      // Lookup keys for tiers still on sale (`!retired`).
      lookup_keys: Object.entries(pricing)
        .filter(([name, plan]) => name !== 'FREE' && !plan.retired)
        .flatMap(([name]) => [
          `${name.toLowerCase()}_monthly`,
          `${name.toLowerCase()}_yearly`,
        ]),
    });

    const productsList = groupBy(
      products.data.map((p) => ({
        name: (p.product as Stripe.Product)?.name,
        recurring: p?.recurring?.interval!,
        // Tiered prices keep the amount on the first tier; a flat price keeps
        // it on the price itself. This read only handled the first, so an
        // ordinary flat price came back with no amount at all — which is what
        // the whole packages list did until the fixtures exposed it.
        price: (p?.tiers?.[0]?.unit_amount ?? p?.unit_amount ?? 0) / 100,
      })),
      'recurring'
    );

    return { ...productsList };
  }

  async prorate(organizationId: string, body: BillingSubscribeDto) {
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const priceData = pricing[body.billing];
    const allProducts = await stripe.products.list({
      active: true,
      // Stripe defaults to 10 and sorts newest-first. The lifetime checkout
      // mints a fresh Product on every purchase, so after a handful of
      // founding-member sales the four tier products fall off page one, the
      // find below misses, and this creates a duplicate CREATOR/GROWTH/PRO
      // alongside the real one. Same unit_amount, so nobody is overcharged,
      // but the catalog and every report built on it stop making sense.
      limit: 100,
      expand: ['data.prices'],
    });

    const findProduct =
      allProducts.data.find(
        (product) => product.name.toUpperCase() === body.billing.toUpperCase()
      ) ||
      (await stripe.products.create({
        active: true,
        name: body.billing,
        // Cloud software, business use. Stripe Tax needs this to pick the right
        // treatment per jurisdiction; the generic services code under-collects.
        tax_code: 'txcd_10103001',
      }));

    const pricesList = await stripe.prices.list({
      active: true,
      product: findProduct!.id,
    });

    const findPrice =
      pricesList.data.find(
        (p) =>
          p?.tax_behavior === 'exclusive' &&
          p?.recurring?.interval?.toLowerCase() ===
            (body.period === 'MONTHLY' ? 'month' : 'year') &&
          p?.nickname === body.billing + ' ' + body.period &&
          p?.unit_amount ===
            (body.period === 'MONTHLY'
              ? priceData.month_price
              : priceData.year_price) *
              100
      ) ||
      (await stripe.prices.create({
        active: true,
        product: findProduct!.id,
        currency: 'usd',
        nickname: body.billing + ' ' + body.period,
        unit_amount:
          (body.period === 'MONTHLY'
            ? priceData.month_price
            : priceData.year_price) * 100,
        // Listed prices are pre-tax; automatic_tax adds it on top. A price with
        // no tax_behavior makes Checkout fail once automatic tax is enabled.
        tax_behavior: 'exclusive',
        recurring: {
          interval: body.period === 'MONTHLY' ? 'month' : 'year',
        },
      }));

    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
        })
      ).data.filter((f) => f.status === 'active' || f.status === 'trialing'),
    };

    try {
      const price = await stripe.invoices.createPreview({
        customer,
        subscription: currentUserSubscription?.data?.[0]?.id,
        subscription_details: {
          proration_behavior: 'create_prorations',
          // `proration_date` used to be passed here as well. Stripe rejects the
          // pair — "You cannot specify `proration_date` when
          // `billing_cycle_anchor=now`" — so **every** call threw, the catch
          // below swallowed it, and the plan cards told everyone that every
          // upgrade cost "(Pay Today $0)". Anchoring to now already means the
          // proration is calculated at this moment; the date was redundant as
          // well as fatal.
          billing_cycle_anchor: 'now',
          items: [
            {
              id: currentUserSubscription?.data?.[0]?.items?.data?.[0]?.id,
              price: findPrice?.id!,
              quantity: 1,
            },
          ],
        },
      });

      return {
        price: price?.amount_remaining ? price?.amount_remaining / 100 : 0,
      };
    } catch (err) {
      // Kept, so a Stripe outage cannot take the Billing screen down with it —
      // but it is no longer hiding a permanent failure.
      return { price: 0 };
    }
  }

  async getCustomerSubscriptions(organizationId: string) {
    const org = (await this._organizationService.getOrgById(organizationId))!;
    const customer = org.paymentId;
    return stripe.subscriptions.list({
      customer: customer!,
      status: 'all',
    });
  }

  async setToCancel(organizationId: string) {
    const id = makeId(10);
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const localSub =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );

    // Founding-member trial is a local row (often with no Stripe subscription).
    // The Plans cancel copy promises an immediate return to FREE — honour that
    // instead of reporting success while leaving `isLifetime` intact.
    if (localSub?.isLifetime && org?.isTrailing) {
      await this.cancelOpenStripeSubscriptions(customer);
      await this._subscriptionService.revokeLocalSubscription(organizationId);
      await this._organizationService.endTrial(organizationId);
      return {
        id,
        cancel_at: new Date(),
      };
    }

    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
          expand: ['data.latest_invoice'],
        })
      ).data.filter((f) => f.status !== 'canceled'),
    };

    const sub = currentUserSubscription.data[0];

    // Nothing left to cancel — a retry of a cancel that already went through.
    // Report it as cancelled rather than throwing; the outcome the caller
    // asked for is already true.
    if (!sub) {
      return {
        id,
        cancel_at: new Date(),
      };
    }

    // If the user is toggling back (un-cancelling), just remove the cancel
    if (sub.cancel_at_period_end) {
      const { cancel_at } = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: false,
        metadata: { service: SUBSCRIPTION_SERVICE_TAG, id },
      });

      return {
        id,
        cancel_at: cancel_at ? new Date(cancel_at * 1000) : undefined,
      };
    }

    // Check if the latest invoice has a failed payment
    const latestInvoice = sub.latest_invoice as Stripe.Invoice | null;
    const hasFailedPayment =
      sub.status === 'past_due' ||
      latestInvoice?.status === 'open' ||
      latestInvoice?.status === 'uncollectible';

    if (hasFailedPayment) {
      // Payment already failed — cancel immediately and delete subscription
      await stripe.subscriptions.cancel(sub.id);
      await this._subscriptionService.deleteSubscription(customer);

      return {
        id,
        cancel_at: new Date(),
      };
    }

    // Payment succeeded — cancel at end of billing period
    const { cancel_at } = await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
      metadata: { service: SUBSCRIPTION_SERVICE_TAG, id },
    });

    return {
      id,
      cancel_at: cancel_at ? new Date(cancel_at * 1000) : undefined,
    };
  }

  /**
   * Cancel every non-canceled Stripe subscription on a customer.
   * Used when converting to lifetime so the recurring sub cannot also bill.
   */
  private async cancelOpenStripeSubscriptions(customer: string) {
    const list = await stripe.subscriptions.list({
      customer,
      status: 'all',
    });
    for (const sub of list.data.filter((f) => f.status !== 'canceled')) {
      await stripe.subscriptions.cancel(sub.id);
    }
  }

  async getCustomerByOrganizationId(organizationId: string) {
    const org = (await this._organizationService.getOrgById(organizationId))!;
    return org.paymentId;
  }

  async createBillingPortalLink(customer: string) {
    return stripe.billingPortal.sessions.create({
      customer,
      return_url: process.env['FRONTEND_URL'] + '/billing',
    });
  }

  /**
   * Find an active promotion code with autoapply: true metadata
   * Only returns codes that are active and not expired
   * Returns the promotion code string (not the ID) for frontend auto-apply
   */
  private async findAutoApplyPromotionCode(): Promise<string | null> {
    try {
      const promotionCodes = await stripe.promotionCodes.list({
        active: true,
        limit: 100,
        // Without this the coupon arrives as an id string, so the two checks
        // below that read it — coupon-level `autoapply` metadata, and
        // `redeem_by` — were dead code. Marking the *coupon* rather than the
        // promotion code silently did nothing at all.
        expand: ['data.promotion.coupon'],
      });

      const now = Math.floor(Date.now() / 1000);

      for (const promoCode of promotionCodes.data) {
        const coupon =
          typeof promoCode.promotion.coupon === 'string'
            ? null
            : promoCode.promotion.coupon;

        // Check if it has autoapply metadata set to true (check both promo and coupon metadata)
        const autoApply = Object.assign(
          {},
          promoCode.metadata,
          coupon?.metadata
        )?.autoapply;
        if (autoApply !== 'true') continue;

        // Check if the promotion code has expired
        if (promoCode.expires_at && promoCode.expires_at < now) continue;

        // Check if the coupon has expired (redeem_by)
        if (coupon?.redeem_by && coupon.redeem_by < now) continue;

        // Check if max redemptions reached
        if (
          promoCode.max_redemptions &&
          promoCode.times_redeemed >= promoCode.max_redemptions
        )
          continue;

        // Found a valid auto-apply promotion code - return the code string for frontend
        return promoCode.code;
      }

      return null;
    } catch (err) {
      console.error('Error finding auto-apply promotion code:', err);
      return null;
    }
  }

  private async createEmbeddedCheckout(
    ud: string,
    uniqueId: string,
    customer: string,
    body: BillingSubscribeDto,
    price: string,
    userId: string,
    allowTrial: boolean
  ) {
    const user = await this._userService.getUserById(userId);

    try {
      await stripe.customers.update(customer, {
        email:
          (user?.email ?? '').indexOf('@') > -1
            ? user!.email
            : `${user?.email}@no-reply.invalid`,
        ...(body.dub
          ? {
              metadata: {
                dubCustomerExternalId: userId,
                dubClickId: body.dub,
              },
            }
          : {}),
      });
    } catch (err) {}

    // Check for auto-apply promotion code (only for monthly plans)
    let autoApplyPromoCode: string | null = null;
    if (body.period === 'MONTHLY') {
      autoApplyPromoCode = await this.findAutoApplyPromotionCode();
    }

    const isUtm = body.utm ? `&utm_source=${body.utm}` : '';
    const { client_secret } = await stripe.checkout.sessions.create({
      ui_mode: 'custom',
      customer,
      return_url:
        process.env['FRONTEND_URL'] +
        `/launches?onboarding=true&trialStart=true&check=${uniqueId}${isUtm}`,
      mode: 'subscription',
      // Tax needs a location. The customer already exists, so customer_update
      // tells Checkout to write the collected billing address back to it.
      automatic_tax: { enabled: true },
      // Optional business identity for company invoices. Under ui_mode 'custom'
      // this only permits collection — TaxIdElement in embedded.billing.tsx is
      // what actually draws the fields. `required` is deliberately unset: the
      // field stays optional, and the SDK forbids it under ui_mode 'custom'.
      tax_id_collection: { enabled: true },
      // Without name: 'auto' the legal entity name is collected and then
      // dropped, so the invoice would keep showing the signup org name.
      customer_update: { address: 'auto', name: 'auto' },
      billing_address_collection: 'required',
      subscription_data: {
        ...(allowTrial ? { trial_period_days: 7 } : {}),
        metadata: {
          service: SUBSCRIPTION_SERVICE_TAG,
          ...body,
          userId,
          uniqueId,
          ud,
        },
      },
      ...(body.datafast_session_id && body.datafast_visitor_id
        ? {
            metadata: {
              datafast_visitor_id: body.datafast_visitor_id,
              datafast_session_id: body.datafast_session_id,
            },
          }
        : {}),
      // Yearly and monthly both accept promotion codes (checkout fidelity).
      allow_promotion_codes: true,
      line_items: [
        {
          price,
          quantity: 1,
        },
      ],
    });

    // Return auto-apply promo code for frontend to apply
    return {
      client_secret,
      ...(autoApplyPromoCode ? { auto_apply_coupon: autoApplyPromoCode } : {}),
    };
  }

  private async createCheckoutSession(
    ud: string,
    uniqueId: string,
    customer: string,
    body: BillingSubscribeDto,
    price: string,
    userId: string,
    allowTrial: boolean
  ) {
    const isUtm = body.utm ? `&utm_source=${body.utm}` : '';

    if (body.dub) {
      await stripe.customers.update(customer, {
        metadata: {
          dubCustomerExternalId: userId,
          dubClickId: body.dub,
        },
      });
    }

    const { url } = await stripe.checkout.sessions.create({
      customer,
      cancel_url: process.env['FRONTEND_URL'] + `/billing?cancel=true${isUtm}`,
      success_url:
        process.env['FRONTEND_URL'] +
        `/launches?onboarding=true&trialStart=true&check=${uniqueId}${isUtm}`,
      mode: 'subscription',
      automatic_tax: { enabled: true },
      // Hosted Checkout draws the business name / tax ID fields itself, so the
      // server flag is the whole change on this path.
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      billing_address_collection: 'required',
      subscription_data: {
        ...(allowTrial ? { trial_period_days: 7 } : {}),
        metadata: {
          service: SUBSCRIPTION_SERVICE_TAG,
          ...body,
          userId,
          uniqueId,
          ud,
        },
      },
      allow_promotion_codes: true,
      line_items: [
        {
          price,
          quantity: 1,
        },
      ],
    });

    return { url };
  }

  /**
   * Ends a Stripe trial early, and says whether there was one.
   *
   * It used to index `list[0].id` unconditionally, which throws when the
   * customer has no trialing subscription — and a founding member has none at
   * all, because a lifetime entitlement is a local row rather than a Stripe
   * subscription. The controller swallowed the throw and reported success, so
   * the caller polled `is-trial-finished` forever against a flag nothing had
   * cleared. The spinner never stopped.
   *
   * `ended: false` is not a failure. It means Stripe had nothing to end, which
   * the caller needs in order to finish the job locally. An actual error still
   * throws, because "the API call failed" and "there was no trial" must not
   * look the same to whoever decides to clear somebody's trial flag.
   */
  async finishTrial(paymentId: string) {
    if (!paymentId) {
      return { ended: false };
    }

    const list = (
      await stripe.subscriptions.list({
        customer: paymentId,
      })
    ).data.filter((f) => f.status === 'trialing');

    if (!list.length) {
      return { ended: false };
    }

    await stripe.subscriptions.update(list[0].id, {
      trial_end: 'now',
    });

    return { ended: true };
  }

  /**
   * The discount currently running on a subscription, if any.
   *
   * `applyDiscount` puts the retention coupon on the Stripe subscription and
   * nothing read it back, so somebody who accepted 50% off saw a toast and then
   * a Billing screen that looked exactly as it had a moment earlier. Doc 03
   * calls for "a visible active-discount state on Billing"; this is what the
   * banner is drawn from.
   *
   * Returns null rather than throwing when billing is off or the customer has
   * no subscription — the Billing screen must render either way.
   */
  async getActiveDiscount(customer?: string | null) {
    if (!isBillingEnabled() || !customer) {
      return null;
    }

    try {
      const subscription = (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
          expand: ['data.discounts'],
        })
      ).data.find((f) => f.status === 'active' || f.status === 'trialing');

      const discount = subscription?.discounts?.[0];
      if (!discount || typeof discount === 'string') {
        return null;
      }

      // The coupon hangs off `source` in this API version, and expansion only
      // reaches one level in — so it arrives as an id about as often as an
      // object, and both have to be handled.
      const source = discount.source?.coupon;
      const coupon =
        typeof source === 'string' ? await stripe.coupons.retrieve(source) : source;

      const percentOff = coupon?.percent_off ?? null;
      if (!percentOff) {
        return null;
      }

      return {
        percentOff,
        // Stripe reports the end of a repeating coupon as a timestamp; a
        // `forever` one has none, and the banner says so by leaving it out.
        endsAt: discount.end ? new Date(discount.end * 1000).toISOString() : null,
        months: coupon?.duration_in_months ?? null,
      };
    } catch (err) {
      return null;
    }
  }

  async checkDiscount(customer?: string | null) {
    // `getActiveDiscount` has always guarded this; these two never did, and
    // `strictNullChecks` is off so nothing caught it at compile time. An org
    // that never reached checkout has no `paymentId`, and the resulting
    // `subscriptions.list({ customer: null })` threw — a 500 on the Billing
    // screen for the exact population least able to explain it.
    if (!isBillingEnabled() || !customer || !process.env.STRIPE_DISCOUNT_ID) {
      return false;
    }

    // The env var being non-empty says nothing about the coupon existing.
    // Coupon ids are per-mode, so the id that works in test is absent in live —
    // and without this the offer was shown, the customer accepted it, and the
    // apply threw `resource_missing` into an unguarded controller.
    try {
      const coupon = await stripe.coupons.retrieve(
        process.env.STRIPE_DISCOUNT_ID
      );
      if (!coupon?.valid) {
        return false;
      }
    } catch (err) {
      Logger.warn(
        `[stripe] STRIPE_DISCOUNT_ID ${process.env.STRIPE_DISCOUNT_ID} does not resolve in this mode; retention offer disabled`
      );
      return false;
    }

    // Monthly active|trialing only — no prior-charge gate so normal trials can
    // see the 50%×3 retention offer (trials usually have no paid charge yet).
    const currentUserSubscription = (
      await stripe.subscriptions.list({
        customer,
        status: 'all',
        expand: ['data.discounts'],
      })
    ).data.find((f) => f.status === 'active' || f.status === 'trialing');

    if (!currentUserSubscription) {
      return false;
    }

    if (
      currentUserSubscription.items.data[0]?.price.recurring?.interval ===
        'year' ||
      currentUserSubscription.discounts.length
    ) {
      return false;
    }

    return true;
  }

  async applyDiscount(customer?: string | null) {
    const check = await this.checkDiscount(customer);
    if (!check) {
      return false;
    }

    const currentUserSubscription = (
      await stripe.subscriptions.list({
        customer,
        status: 'all',
        expand: ['data.discounts'],
      })
    ).data.find((f) => f.status === 'active' || f.status === 'trialing');

    if (!currentUserSubscription) {
      return false;
    }

    await stripe.subscriptions.update(currentUserSubscription.id, {
      discounts: [
        {
          coupon: process.env.STRIPE_DISCOUNT_ID!,
        },
      ],
    });

    return true;
  }

  async checkSubscription(organizationId: string, subscriptionId: string) {
    const orgValue = await this._subscriptionService.checkSubscription(
      organizationId,
      subscriptionId
    );

    if (orgValue) {
      return 2;
    }

    const getCustomerSubscriptions = await this.getCustomerSubscriptions(
      organizationId
    );
    if (getCustomerSubscriptions.data.length === 0) {
      return 0;
    }

    if (
      getCustomerSubscriptions.data.find(
        (p) => p.metadata.uniqueId === subscriptionId
      )?.canceled_at
    ) {
      return 1;
    }

    return 0;
  }

  async embedded(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto,
    allowTrial: boolean
  ) {
    // First-run checkout only. Without this, an org that already pays could
    // reach it again (direct POST, or a stale render that still thinks the tier
    // is FREE) and Stripe would create a *second* subscription on the same
    // customer, billing both. The Subscription row is unique per organization,
    // so it would only ever show whichever webhook landed last, and cancelling
    // acts on one subscription — leaving the other charging invisibly.
    // Plan changes belong to subscribe(), which updates in place.
    const existingSubscription =
      await this._subscriptionService.getSubscription(organizationId);

    if (existingSubscription) {
      throw new Error('This organization already has an active subscription');
    }

    const id = makeId(10);
    const priceData = pricing[body.billing];
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const allProducts = await stripe.products.list({
      active: true,
      // Stripe defaults to 10 and sorts newest-first. The lifetime checkout
      // mints a fresh Product on every purchase, so after a handful of
      // founding-member sales the four tier products fall off page one, the
      // find below misses, and this creates a duplicate CREATOR/GROWTH/PRO
      // alongside the real one. Same unit_amount, so nobody is overcharged,
      // but the catalog and every report built on it stop making sense.
      limit: 100,
      expand: ['data.prices'],
    });

    const findProduct =
      allProducts.data.find(
        (product) => product.name.toUpperCase() === body.billing.toUpperCase()
      ) ||
      (await stripe.products.create({
        active: true,
        name: body.billing,
        // Cloud software, business use. Stripe Tax needs this to pick the right
        // treatment per jurisdiction; the generic services code under-collects.
        tax_code: 'txcd_10103001',
      }));

    const pricesList = await stripe.prices.list({
      active: true,
      product: findProduct!.id,
    });

    const findPrice =
      pricesList.data.find(
        (p) =>
          p?.tax_behavior === 'exclusive' &&
          p?.recurring?.interval?.toLowerCase() ===
            (body.period === 'MONTHLY' ? 'month' : 'year') &&
          p?.unit_amount ===
            (body.period === 'MONTHLY'
              ? priceData.month_price
              : priceData.year_price) *
              100
      ) ||
      (await stripe.prices.create({
        active: true,
        product: findProduct!.id,
        currency: 'usd',
        nickname: body.billing + ' ' + body.period,
        unit_amount:
          (body.period === 'MONTHLY'
            ? priceData.month_price
            : priceData.year_price) * 100,
        // Listed prices are pre-tax; automatic_tax adds it on top. A price with
        // no tax_behavior makes Checkout fail once automatic tax is enabled.
        tax_behavior: 'exclusive',
        recurring: {
          interval: body.period === 'MONTHLY' ? 'month' : 'year',
        },
      }));

    return this.createEmbeddedCheckout(
      uniqueId,
      id,
      customer,
      body,
      findPrice!.id,
      userId,
      allowTrial
    );
  }

  async subscribe(
    uniqueId: string,
    organizationId: string,
    userId: string,
    body: BillingSubscribeDto,
    allowTrial: boolean
  ) {
    const id = makeId(10);
    const priceData = pricing[body.billing];
    const org = await this._organizationService.getOrgById(organizationId);
    const customer = await this.createOrGetCustomer(org!);
    const allProducts = await stripe.products.list({
      active: true,
      // Stripe defaults to 10 and sorts newest-first. The lifetime checkout
      // mints a fresh Product on every purchase, so after a handful of
      // founding-member sales the four tier products fall off page one, the
      // find below misses, and this creates a duplicate CREATOR/GROWTH/PRO
      // alongside the real one. Same unit_amount, so nobody is overcharged,
      // but the catalog and every report built on it stop making sense.
      limit: 100,
      expand: ['data.prices'],
    });

    const findProduct =
      allProducts.data.find(
        (product) => product.name.toUpperCase() === body.billing.toUpperCase()
      ) ||
      (await stripe.products.create({
        active: true,
        name: body.billing,
        // Cloud software, business use. Stripe Tax needs this to pick the right
        // treatment per jurisdiction; the generic services code under-collects.
        tax_code: 'txcd_10103001',
      }));

    const pricesList = await stripe.prices.list({
      active: true,
      product: findProduct!.id,
    });

    const findPrice =
      pricesList.data.find(
        (p) =>
          p?.tax_behavior === 'exclusive' &&
          p?.recurring?.interval?.toLowerCase() ===
            (body.period === 'MONTHLY' ? 'month' : 'year') &&
          p?.unit_amount ===
            (body.period === 'MONTHLY'
              ? priceData.month_price
              : priceData.year_price) *
              100
      ) ||
      (await stripe.prices.create({
        active: true,
        product: findProduct!.id,
        currency: 'usd',
        nickname: body.billing + ' ' + body.period,
        unit_amount:
          (body.period === 'MONTHLY'
            ? priceData.month_price
            : priceData.year_price) * 100,
        // Listed prices are pre-tax; automatic_tax adds it on top. A price with
        // no tax_behavior makes Checkout fail once automatic tax is enabled.
        tax_behavior: 'exclusive',
        recurring: {
          interval: body.period === 'MONTHLY' ? 'month' : 'year',
        },
      }));

    const getCurrentSubscriptions =
      await this._subscriptionService.getSubscription(organizationId);

    if (!getCurrentSubscriptions) {
      return this.createCheckoutSession(
        uniqueId,
        id,
        customer,
        body,
        findPrice!.id,
        userId,
        allowTrial
      );
    }

    const currentUserSubscription = {
      data: (
        await stripe.subscriptions.list({
          customer,
          status: 'all',
        })
      ).data.filter((f) => f.status === 'active' || f.status === 'trialing'),
    };

    try {
      await stripe.subscriptions.update(currentUserSubscription.data[0].id, {
        cancel_at_period_end: false,
        metadata: {
          service: SUBSCRIPTION_SERVICE_TAG,
          ...body,
          userId,
          id,
          // Both webhook handlers read `metadata.uniqueId`. This wrote `id` and
          // `ud` and no `uniqueId`, so the resulting subscription.updated
          // carried `identifier: undefined` — Prisma reads undefined as "leave
          // this column alone", so the row silently kept the previous
          // identifier and `/billing/check/<new id>` could never resolve. The
          // customer had already been invoiced by `always_invoice` below.
          uniqueId,
          ud: uniqueId,
        },
        proration_behavior: 'always_invoice',
        items: [
          {
            id: currentUserSubscription.data[0].items.data[0].id,
            price: findPrice!.id,
            quantity: 1,
          },
        ],
      });

      return { id };
    } catch (err) {
      const { url } = await this.createBillingPortalLink(customer);
      return {
        portal: url,
      };
    }
  }

  async paymentSucceeded(event: Stripe.InvoicePaymentSucceededEvent) {
    // get subscription from payment
    const subscriptionId =
      event.data.object.parent?.subscription_details?.subscription;
    if (!subscriptionId) {
      return { ok: true };
    }
    const subscription = await stripe.subscriptions.retrieve(
      typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id
    );

    const { userId, ud } = subscription.metadata;
    const user = await this._userService.getUserById(userId);
    if (user && user.ip && user.agent) {
      this._trackService.track(ud, user.ip, user.agent, TrackEnum.Purchase, {
        value: event.data.object.amount_paid / 100,
      });
    }

    return { ok: true };
  }

  /**
   * A renewal Stripe could not charge.
   *
   * Nothing handled this before, so the customer's first sign that anything was
   * wrong was the app dropping to the paywall weeks later, when Stripe gave up
   * retrying and cancelled the subscription. Now they are told, and the Billing
   * screen has something to draw (`hasFailedPayment` below).
   *
   * Deliberately does not touch the subscription: Stripe retries a failed
   * invoice on its own schedule and most of them succeed on the second attempt.
   * Cancelling here would take the plan away from somebody whose bank simply
   * asked for a confirmation.
   */
  async paymentFailed(event: Stripe.InvoicePaymentFailedEvent) {
    const customer = event.data.object.customer as string;
    if (!customer) {
      return { ok: true };
    }

    const org = await this._organizationService.getOrgByCustomerId(customer);
    if (!org) {
      return { ok: true };
    }

    // `type` defaults to 'success', and sendEmailsToOrg then skips anyone with
    // `sendSuccessEmails: false` — so a customer who had turned success emails
    // off got no email at all about a failed renewal, and the in-app entry was
    // styled as good news. 'info' is the right class: it is neither, and it is
    // the one type the preference filter always lets through. Losing your
    // subscription because a notice was filed as a success is not a preference
    // anyone expressed.
    await this._notificationService.inAppNotification(
      org.id,
      'Payment failed',
      "We could not charge your card for PostQueen. Update your payment method from Billing and we'll try again — nothing is cancelled yet.",
      true,
      false,
      'info'
    );

    return { ok: true };
  }

  /**
   * A chargeback. The money is already gone and the bank has taken a fee on top,
   * so access goes with it — until now a disputed charge cost the payment, the
   * fee, and continued service.
   *
   * `revokeLocalSubscription` rather than `deleteSubscription` because the
   * latter refuses to touch a founding-member row, and a disputed founding
   * payment is exactly the case that most needs revoking.
   */
  async disputeCreated(event: Stripe.ChargeDisputeCreatedEvent) {
    // A Dispute carries the charge, not the customer, so the charge has to be
    // fetched to find out whose plan this is.
    const dispute = event.data.object;

    // Not every dispute event is a chargeback. Card networks send retrieval
    // requests and fraud warnings through the same event with a `warning_`
    // status and no money withdrawn — revoking on those suspends a customer who
    // is still paying, and tells them their bank disputed a payment that was
    // never disputed.
    if (dispute.status?.startsWith('warning_')) {
      return { ok: true, revoked: false, reason: dispute.status };
    }

    const chargeId =
      typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    if (!chargeId) {
      return { ok: true };
    }
    const charge = await stripe.charges.retrieve(chargeId);
    const customer = charge?.customer as string | null;
    if (!customer) {
      return { ok: true };
    }

    const org = await this._organizationService.getOrgByCustomerId(customer);
    if (!org) {
      return { ok: true };
    }

    // A dispute on an old charge must not cut off someone who is currently
    // paying on a live subscription.
    if (await this.hasEntitlingSubscription(customer)) {
      return { ok: true, revoked: false, reason: 'still subscribed' };
    }

    await this._subscriptionService.revokeLocalSubscription(org.id);
    await this._notificationService.inAppNotification(
      org.id,
      'Payment disputed',
      'A payment for PostQueen was disputed with your bank, so your plan has been suspended. Contact support if this was not you.',
      true,
      false,
      'info'
    );

    return { ok: true, revoked: true };
  }

  /**
   * Only a FULL refund revokes. Partial refunds are a normal part of this
   * system — the founding-member retention offer and prorated credits are both
   * partial — and taking someone's plan away because they were given $5 back
   * would be worse than the gap this closes.
   */
  async chargeRefunded(event: Stripe.ChargeRefundedEvent) {
    const charge = event.data.object;
    const customer = charge.customer as string | null;
    // `charge.refunded` is Stripe's own "fully refunded" flag. Comparing
    // `amount_refunded` against `amount` gets a partially-captured charge wrong:
    // there the total that can be refunded is `amount_captured`, so a full
    // refund of a partial capture would read as partial and never revoke.
    if (!customer || !charge.refunded) {
      return { ok: true, revoked: false };
    }

    const org = await this._organizationService.getOrgByCustomerId(customer);
    if (!org) {
      return { ok: true };
    }

    // Refunding one past invoice is not a reason to end a running subscription.
    if (await this.hasEntitlingSubscription(customer)) {
      return { ok: true, revoked: false, reason: 'still subscribed' };
    }

    await this._subscriptionService.revokeLocalSubscription(org.id);
    // Told, not just done. A refund that silently takes the plan away reads as
    // a bug to the person it happens to.
    await this._notificationService.inAppNotification(
      org.id,
      'Payment refunded',
      'Your PostQueen payment was refunded, so the plan it paid for has ended. Subscribe again any time from Billing.',
      true,
      false,
      'info'
    );
    return { ok: true, revoked: true };
  }

  /**
   * Whether the most recent invoice on this customer failed to be paid.
   *
   * Read from Stripe rather than stored, for the same reason the active
   * discount is: the fact lives there, and a copy here is a copy that goes
   * stale the moment Stripe's own retry succeeds.
   */
  async hasFailedPayment(customer?: string | null) {
    if (!isBillingEnabled() || !customer) {
      return false;
    }

    try {
      const invoices = await stripe.invoices.list({ customer, limit: 1 });
      const latest = invoices.data[0];
      return latest?.status === 'open' && (latest?.attempt_count ?? 0) > 0;
    } catch (err) {
      return false;
    }
  }

  async getCharges(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      return [];
    }

    const charges = await stripe.charges.list({
      customer: org.paymentId,
      limit: 100,
    });

    const chargeList = charges.data
      .filter((f) => f.status === 'succeeded')
      .map((charge) => ({
        id: charge.id,
        amount: charge.amount,
        currency: charge.currency,
        created: charge.created,
        status: charge.status,
        refunded: charge.refunded,
        amount_refunded: charge.amount_refunded,
        description: charge.description,
        receipt_url: charge.receipt_url || null,
        invoice: (charge as any).invoice || null,
      }));

    const invoiceIds = chargeList
      .map((c) => c.invoice)
      .filter((id): id is string => !!id && typeof id === 'string');

    const invoicePdfMap: Record<string, string> = {};
    for (const invoiceId of invoiceIds) {
      try {
        const inv = await stripe.invoices.retrieve(invoiceId);
        if (inv.invoice_pdf) {
          invoicePdfMap[invoiceId] = inv.invoice_pdf;
        }
      } catch {
        // ignore if invoice can't be fetched
      }
    }

    return chargeList.map((charge) => ({
      ...charge,
      invoice_pdf:
        charge.invoice && invoicePdfMap[charge.invoice as string]
          ? invoicePdfMap[charge.invoice as string]
          : null,
    }));
  }

  async refundCharges(organizationId: string, chargeIds: string[]) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      throw new Error('No payment customer found for this organization');
    }

    const refunded: string[] = [];
    const failed: string[] = [];

    for (const chargeId of chargeIds) {
      try {
        await stripe.refunds.create({ charge: chargeId });
        refunded.push(chargeId);
      } catch (err) {
        failed.push(chargeId);
      }
    }

    return { refunded, failed };
  }

  async cancelSubscription(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      throw new Error('No payment customer found for this organization');
    }

    const customer = org.paymentId;

    const subscriptions = (
      await stripe.subscriptions.list({
        customer,
        status: 'all',
      })
    ).data.filter((f) => f.status !== 'canceled');

    if (!subscriptions.length) {
      throw new Error('No active subscription found');
    }

    await stripe.subscriptions.cancel(subscriptions[0].id);
    await this._subscriptionService.deleteSubscription(customer);

    return { cancelled: true };
  }

  private mapSubscriptionDiscounts(subscription?: Stripe.Subscription) {
    return (subscription?.discounts || [])
      .filter(
        (discount): discount is Stripe.Discount => typeof discount !== 'string'
      )
      .map((discount) => {
        const coupon =
          typeof discount.source?.coupon === 'string'
            ? null
            : discount.source?.coupon;
        return {
          type: coupon?.percent_off ? 'percentage' : 'amount',
          value: coupon?.percent_off || (coupon?.amount_off || 0) / 100,
          duration: coupon?.duration || 'once',
          durationInMonths: coupon?.duration_in_months || null,
          remainingMonths: discount.end
            ? Math.max(
                0,
                Math.ceil(
                  (discount.end - Date.now() / 1000) / (30 * 24 * 60 * 60)
                )
              )
            : null,
        };
      });
  }

  private async getActiveStripeSubscription(paymentId?: string | null) {
    if (!paymentId || !paymentId.startsWith('cus_')) {
      return undefined;
    }

    return (
      await stripe.subscriptions.list({
        customer: paymentId,
        status: 'all',
        expand: ['data.discounts.source.coupon'],
      })
    ).data.find((f) => f.status === 'active' || f.status === 'trialing');
  }

  async getCouponInfo(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );

    const stripeSubscription = await this.getActiveStripeSubscription(
      org?.paymentId
    );

    const coupons = this.mapSubscriptionDiscounts(stripeSubscription);
    const priceData = subscription
      ? pricing[subscription.subscriptionTier]
      : undefined;
    const monthlyPrice = priceData?.month_price || 0;

    let nextPayment: number | null = null;
    if (stripeSubscription) {
      try {
        const preview = await stripe.invoices.createPreview({
          customer: org!.paymentId!,
          subscription: stripeSubscription.id,
        });
        nextPayment = preview.total / 100;
      } catch (err) {
        /* no upcoming invoice */
      }
    }

    return {
      tier: subscription?.subscriptionTier || null,
      period: subscription?.period || null,
      isLifetime: !!subscription?.isLifetime,
      monthlyPrice,
      planPrice:
        subscription?.period === 'YEARLY'
          ? priceData?.year_price || 0
          : monthlyPrice,
      nextPayment,
      coupons,
      supported:
        !!subscription &&
        !!stripeSubscription &&
        subscription.period === 'MONTHLY' &&
        !subscription.isLifetime &&
        !coupons.length,
    };
  }

  async applyCoupon(
    organizationId: string,
    body: { type: string; value: number; months: number }
  ) {
    const info = await this.getCouponInfo(organizationId);
    if (!info.supported) {
      return {
        applied: false,
        reason: 'Applying a coupon is not supported for this user',
      };
    }

    if (
      body.type === 'percentage'
        ? body.value < 1 || body.value > 100
        : body.value < 1 || body.value > info.monthlyPrice
    ) {
      return { applied: false, reason: 'Invalid coupon value' };
    }

    const org = await this._organizationService.getOrgById(organizationId);
    const stripeSubscription = await this.getActiveStripeSubscription(
      org?.paymentId
    );

    if (!stripeSubscription) {
      return {
        applied: false,
        reason: 'No active subscription found for this customer',
      };
    }

    const coupon = await stripe.coupons.create({
      name: `Admin coupon for ${org!.name}`,
      ...(body.type === 'percentage'
        ? { percent_off: body.value }
        : { amount_off: Math.round(body.value * 100), currency: 'usd' }),
      ...(body.months === 1
        ? { duration: 'once' }
        : { duration: 'repeating', duration_in_months: body.months }),
      // Was the literal 'gitroom' — the last one in the repo, and a violation
      // of the invariant documented on the constant itself. Nothing read it, so
      // nothing broke, but it hid every admin-issued coupon from any report
      // filtered on this tag.
      metadata: { service: SUBSCRIPTION_SERVICE_TAG, organizationId },
    });

    await stripe.subscriptions.update(stripeSubscription.id, {
      discounts: [
        {
          coupon: coupon.id,
        },
      ],
    });

    return { applied: true };
  }

  async cancelCoupon(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    const stripeSubscription = await this.getActiveStripeSubscription(
      org?.paymentId
    );

    if (!stripeSubscription) {
      return {
        cancelled: false,
        reason: 'No active subscription found for this customer',
      };
    }

    if (!stripeSubscription.discounts.length) {
      return {
        cancelled: false,
        reason: 'No coupon is applied to this subscription',
      };
    }

    await stripe.subscriptions.deleteDiscount(stripeSubscription.id);

    return { cancelled: true };
  }

  async chatbaseRefundPreview(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      return {
        eligible: false as const,
        reason: 'No payment customer found for this organization',
      };
    }

    const customer = org.paymentId;

    const subscriptions = (
      await stripe.subscriptions.list({
        customer,
        status: 'all',
      })
    ).data.filter((f) => f.status !== 'canceled');

    if (!subscriptions.length) {
      return {
        eligible: false as const,
        reason: 'No active subscription found for this customer',
      };
    }

    const charges = (
      await stripe.charges.list({
        customer,
        limit: 100,
      })
    ).data.filter((f) => f.status === 'succeeded');

    if (charges.some((f) => f.refunded || f.amount_refunded > 0)) {
      return {
        eligible: false as const,
        reason: 'A refund was already issued for this customer',
      };
    }

    // only refund a charge that was created by the active subscription,
    // never a one-off payment
    let lastCharge: (typeof charges)[number] | undefined = undefined;
    let chargeSubscription: (typeof subscriptions)[number] | undefined =
      undefined;

    for (const charge of charges) {
      const invoiceId = (charge as any).invoice;
      if (!invoiceId || typeof invoiceId !== 'string') {
        continue;
      }

      try {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        const invoiceSubscription =
          invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof invoiceSubscription === 'string'
            ? invoiceSubscription
            : invoiceSubscription?.id;

        chargeSubscription = subscriptions.find(
          (f) => f.id === subscriptionId
        );

        if (chargeSubscription) {
          lastCharge = charge;
          break;
        }
      } catch {
        // ignore if invoice can't be fetched
      }
    }

    if (!lastCharge || !chargeSubscription) {
      return {
        eligible: false as const,
        reason: 'No subscription payment found for this customer',
      };
    }

    const sixtyDaysAgo = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60;
    if (lastCharge.created < sixtyDaysAgo) {
      return {
        eligible: false as const,
        reason: 'The last subscription payment is older than 60 days',
      };
    }

    const interval =
      chargeSubscription.items?.data?.[0]?.price?.recurring?.interval;

    // maximum refund is one month worth of the subscription
    const amount =
      interval === 'year'
        ? Math.floor(lastCharge.amount / 12)
        : lastCharge.amount;

    const currentSubscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );

    return {
      eligible: true as const,
      chargeId: lastCharge.id,
      amount: amount / 100,
      currency: lastCharge.currency,
      tier: currentSubscription?.subscriptionTier || null,
      period: currentSubscription?.period || null,
      subscriptionIds: subscriptions.map((f) => f.id),
    };
  }

  async chatbaseRefund(organizationId: string) {
    const preview = await this.chatbaseRefundPreview(organizationId);
    if (!preview.eligible) {
      return {
        refunded: false,
        reason: preview.reason,
      };
    }

    const org = await this._organizationService.getOrgById(organizationId);

    await stripe.refunds.create({
      charge: preview.chargeId,
      amount: Math.round(preview.amount * 100),
      metadata: {
        reason: 'chatbase_refund',
        organizationId,
      },
    });

    for (const subscriptionId of preview.subscriptionIds) {
      await stripe.subscriptions.cancel(subscriptionId);
    }

    if (preview.subscriptionIds.length) {
      await this._subscriptionService.deleteSubscription(org?.paymentId!);
    }

    return {
      refunded: true,
      amount: preview.amount,
      currency: preview.currency,
      subscriptionCancelled: preview.subscriptionIds.length > 0,
    };
  }

  /**
   * A founding-member checkout session.
   *
   * When the org is trial-eligible (`allowTrial`), use `mode: 'setup'` so we
   * collect a card without charging today — `$0 due today` on the paywall must
   * match money. The founding fee is captured later via
   * `captureFoundingLifetimeIfDue` (finish-trial or trial window closed).
   *
   * When not trial-eligible, keep `mode: 'payment'` and charge `LIFETIME_PRICE`
   * immediately (lapsed / returning purchasers).
   *
   * Session metadata carries `service` (webhook filter) and `organizationId`.
   * Deferred sessions also set `lifetime_deferred: '1'`.
   */
  async createLifetimeCheckout(organization: Organization) {
    const customer = await this.createOrGetCustomer(organization);
    // Mid-trial converts are usually past `allowTrial` (trial already started).
    // Defer the $49 charge until trial end whenever the org is still trailing.
    const deferCharge =
      !!organization.isTrailing || !!organization.allowTrial;
    const urls = {
      cancel_url: process.env['FRONTEND_URL'] + '/billing/lifetime?cancel=true',
      success_url:
        process.env['FRONTEND_URL'] + '/billing/lifetime?purchased=true',
    };

    if (deferCharge) {
      const { url } = await stripe.checkout.sessions.create({
        customer,
        mode: 'setup',
        currency: 'usd',
        payment_method_types: ['card'],
        ...urls,
        billing_address_collection: 'required',
        // Nothing is charged here, so there is no tax to reverse-charge; this
        // only saves the entity name and tax ID onto the customer so the
        // deferred path records the same identity as the other three.
        tax_id_collection: { enabled: true },
        customer_update: { address: 'auto', name: 'auto' },
        metadata: {
          service: SUBSCRIPTION_SERVICE_TAG,
          organizationId: organization.id,
          lifetime_deferred: '1',
        },
      });
      return { url };
    }

    const { url } = await stripe.checkout.sessions.create({
      customer,
      mode: 'payment',
      ...urls,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      billing_address_collection: 'required',
      // A payment-mode session leaves only a charge unless this is set, so a
      // founding member who needs a company invoice had nothing to hand over.
      invoice_creation: { enabled: true },
      allow_promotion_codes: true,
      metadata: {
        service: SUBSCRIPTION_SERVICE_TAG,
        organizationId: organization.id,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: LIFETIME_PRICE * 100,
            // Same treatment as every subscription price. Without these the $49
            // was taxed as generic services under the account's default preset,
            // not as SaaS, and the listed price silently became tax-inclusive or
            // not depending on that preset rather than on this line.
            tax_behavior: 'exclusive',
            product_data: {
              name: 'PostQueen — founding member',
              description:
                'One payment. Your plan stays unlocked with nothing to renew.',
              tax_code: 'txcd_10103001',
            },
          },
        },
      ],
    });

    return { url };
  }

  /**
   * After a deferred (setup) founding checkout: attach the payment method as
   * the customer default, then grant lifetime while the trial is still running.
   * Money is not taken here — `captureFoundingLifetimeIfDue` does that later.
   */
  async completeDeferredLifetimeSetup(
    organizationId: string,
    session: {
      id: string;
      customer?: string | { id?: string } | null;
      setup_intent?: string | { id?: string } | null;
    }
  ) {
    const setupIntentId =
      typeof session.setup_intent === 'string'
        ? session.setup_intent
        : session.setup_intent?.id;
    if (!setupIntentId) {
      throw new Error('lifetime setup session missing setup_intent');
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
    const customerId =
      (typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id) ||
      (typeof setupIntent.customer === 'string'
        ? setupIntent.customer
        : setupIntent.customer?.id);

    if (customerId && paymentMethodId) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    return this.grantLifetimeFromPayment(
      organizationId,
      `lifetime-setup:${session.id}`
    );
  }

  /**
   * Charge the founding-member fee once when a deferred lifetime purchase's
   * trial ends (button or window). No-ops for code redemption, immediate
   * payment checkouts, or orgs already charged.
   *
   * `force: true` — finish-trial (early end while window still open).
   * `force: false` (default) — only charge once the trial window has closed.
   */
  /**
   * Deferred founding checkout (`lifetime-setup:`) that has not yet recorded a
   * charge (`lifetime-charge:` / immediate `cs_`). Used by FinishTrial polling
   * and `/user/self` lock-until-paid — does not talk to Stripe.
   */
  async isDeferredFoundingFeeOwed(organizationId: string): Promise<boolean> {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );
    if (!subscription?.isLifetime) {
      return false;
    }
    const codes = await this._subscriptionService.getCodesByOrgId(
      organizationId
    );
    const codeList = codes.map((c) => c.code);
    const hasDeferred = codeList.some((c) => c.startsWith('lifetime-setup:'));
    const alreadyPaid =
      codeList.some((c) => c.startsWith('lifetime-charge:')) ||
      codeList.some((c) => c.startsWith('lifetime-retention:')) ||
      codeList.some((c) => /^cs_/.test(c));
    return hasDeferred && !alreadyPaid;
  }

  /**
   * Take a one-off payment off-session through an Invoice instead of a bare
   * PaymentIntent.
   *
   * A PaymentIntent has no `automatic_tax` — the parameter does not exist on it
   * — so anything charged that way collects zero tax and leaves the customer no
   * document. That was invisible while the account held no tax registration and
   * every calculation came to zero. With one in place it became a live
   * under-collection on the founding-member path, and that is not a corner:
   * `deferCharge` is true whenever the org is trialing or trial-eligible, and
   * every new organization is created as both, so essentially every founding
   * purchase is billed here rather than through the taxed Checkout Session.
   *
   * The item is attached to an invoice created with
   * `pending_invoice_items_behavior: 'exclude'`. The default is to sweep every
   * pending invoice item the customer has into this invoice, which would bill a
   * founding member for unrelated amounts.
   *
   * Re-reads the invoice after creating it because an idempotent replay returns
   * the original response body, not the current state — so a retry would see
   * `draft` for an invoice that is already paid and try to finalize it again.
   */
  private async chargeOnceWithTax(opts: {
    customer: string;
    amountCents: number;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }) {
    const created = await stripe.invoices.create(
      {
        customer: opts.customer,
        // Explicit, and load-bearing. Left out, the invoice takes the account's
        // default currency — EUR on this account — while every amount in this
        // codebase is USD, and Stripe rejects the item with "You cannot combine
        // currencies on a single invoice". The old PaymentIntent set `currency`
        // per charge, so nothing surfaced the mismatch until the charge moved
        // onto an invoice.
        currency: 'usd',
        automatic_tax: { enabled: true },
        collection_method: 'charge_automatically',
        auto_advance: false,
        pending_invoice_items_behavior: 'exclude',
        description: opts.description,
        metadata: opts.metadata,
      },
      { idempotencyKey: `${opts.idempotencyKey}-invoice` }
    );

    let invoice = await stripe.invoices.retrieve(created.id!);

    if (invoice.status === 'draft') {
      await stripe.invoiceItems.create(
        {
          customer: opts.customer,
          invoice: invoice.id!,
          amount: opts.amountCents,
          currency: 'usd',
          description: opts.description,
          tax_behavior: 'exclusive',
          tax_code: 'txcd_10103001',
        },
        { idempotencyKey: `${opts.idempotencyKey}-item` }
      );
      invoice = await stripe.invoices.finalizeInvoice(invoice.id!);
    }

    if (invoice.status === 'open') {
      invoice = await stripe.invoices.pay(invoice.id!);
    }

    return invoice;
  }

  async captureFoundingLifetimeIfDue(
    organizationId: string,
    opts: { force?: boolean } = {}
  ) {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId) {
      return { charged: false };
    }

    if (!(await this.isDeferredFoundingFeeOwed(organizationId))) {
      return { charged: false };
    }

    const windowOpen = trialWindow(org.createdAt).open;
    if (windowOpen && !opts.force) {
      return { charged: false };
    }

    const customer = await stripe.customers.retrieve(org.paymentId);
    if ((customer as { deleted?: boolean }).deleted) {
      return { charged: false };
    }
    const live = customer as Stripe.Customer;
    const defaultPm =
      typeof live.invoice_settings?.default_payment_method === 'string'
        ? live.invoice_settings.default_payment_method
        : live.invoice_settings?.default_payment_method?.id;

    if (!defaultPm) {
      return { charged: false, error: 'no_payment_method' };
    }

    try {
      const invoice = await this.chargeOnceWithTax({
        customer: org.paymentId,
        amountCents: LIFETIME_PRICE * 100,
        description: 'PostQueen — founding member',
        metadata: {
          service: SUBSCRIPTION_SERVICE_TAG,
          organizationId,
          lifetime_charge: '1',
        },
        // Keyed by payment method, not by org alone. Stripe replays a cached
        // response — including a cached decline — for 24 hours, so an org-only
        // key meant a customer who was declined, fixed their card, and tried
        // again got the same decline played back at them for the rest of the
        // day. Same card still dedupes, which is the double-charge this guards.
        idempotencyKey: `lifetime-charge-${organizationId}-${defaultPm}`,
      });

      if (invoice.status === 'paid') {
        // The used code carries the invoice id now rather than a PaymentIntent
        // id. Only the `lifetime-charge:` prefix is ever matched
        // (`isDeferredFoundingFeeOwed`), so the change is transparent.
        const existing = await this._subscriptionService.getCode(
          `lifetime-charge:${invoice.id}`
        );
        if (!existing) {
          await this._subscriptionService.createUsedCode(
            organizationId,
            `lifetime-charge:${invoice.id}`
          );
        }
        return { charged: true };
      }
      return { charged: false, status: invoice.status ?? 'unknown' };
    } catch (err) {
      // This used to collapse every failure into the string 'stripe_error' with
      // nothing logged, so an expired card, a hard decline and a 3DS challenge
      // were indistinguishable — from the outside and from the logs. The
      // authentication case matters most: it is recoverable, but only if the
      // PaymentIntent's client secret survives long enough to re-present it
      // on-session.
      const e = err as Stripe.errors.StripeError;
      // `raw` is the untyped payload Stripe echoed back; on an SCA decline it
      // carries the PaymentIntent whose client secret can re-present the charge
      // on-session. Nothing else in the error object can.
      const raw = e?.raw as
        | { payment_intent?: { client_secret?: string } }
        | undefined;
      Logger.error(
        `[stripe] founding charge failed for org ${organizationId}: ` +
          `${e?.code ?? e?.type ?? 'unknown'}${
            e?.decline_code ? ` / ${e.decline_code}` : ''
          } — ${e?.message ?? ''}`
      );
      return {
        charged: false,
        error: 'stripe_error',
        code: e?.code,
        declineCode: e?.decline_code,
        requiresAction: e?.code === 'authentication_required',
        clientSecret: raw?.payment_intent?.client_secret,
      };
    }
  }

  /**
   * Cancel-flow retention for founding-member trial: charge half of
   * `LIFETIME_PRICE` ($24.50), mark the founding fee settled (so a later
   * `captureFoundingLifetimeIfDue` cannot bill $49), and end the trial.
   */
  async applyLifetimeRetentionOffer(organizationId: string): Promise<{
    ok: boolean;
    error?: 'not_eligible' | 'no_payment_method' | 'capture_failed' | 'stripe_error';
    status?: string;
    /** Stripe's own decline/error code, so the cause is not lost. */
    code?: string;
    /** 3DS was demanded: recoverable, but only on-session. */
    requiresAction?: boolean;
  }> {
    const org = await this._organizationService.getOrgById(organizationId);
    if (!org?.paymentId || !org.isTrailing) {
      return { ok: false, error: 'not_eligible' };
    }

    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );
    if (!subscription?.isLifetime) {
      return { ok: false, error: 'not_eligible' };
    }

    const codes = await this._subscriptionService.getCodesByOrgId(
      organizationId
    );
    const codeList = codes.map((c) => c.code);
    if (codeList.some((c) => c.startsWith('lifetime-retention:'))) {
      await this._organizationService.endTrial(organizationId);
      return { ok: true };
    }

    const customer = await stripe.customers.retrieve(org.paymentId);
    if ((customer as { deleted?: boolean }).deleted) {
      return { ok: false, error: 'no_payment_method' };
    }
    const live = customer as Stripe.Customer;
    const defaultPm =
      typeof live.invoice_settings?.default_payment_method === 'string'
        ? live.invoice_settings.default_payment_method
        : live.invoice_settings?.default_payment_method?.id;

    if (!defaultPm) {
      return { ok: false, error: 'no_payment_method' };
    }

    try {
      const invoice = await this.chargeOnceWithTax({
        customer: org.paymentId,
        amountCents: Math.round(LIFETIME_RETENTION_PRICE * 100),
        description: 'PostQueen — founding member (retention)',
        metadata: {
          service: SUBSCRIPTION_SERVICE_TAG,
          organizationId,
          lifetime_retention: '1',
          lifetime_charge: '1',
        },
        // Same reasoning as the founding charge: an org-only key replays a
        // cached decline for 24 hours, which on a save-the-customer flow means
        // the save cannot be retried on a working card.
        idempotencyKey: `lifetime-retention-${organizationId}-${defaultPm}`,
      });

      if (invoice.status === 'paid') {
        const chargeCode = `lifetime-charge:${invoice.id}`;
        const retentionCode = `lifetime-retention:${invoice.id}`;
        if (!(await this._subscriptionService.getCode(chargeCode))) {
          await this._subscriptionService.createUsedCode(
            organizationId,
            chargeCode
          );
        }
        if (!(await this._subscriptionService.getCode(retentionCode))) {
          await this._subscriptionService.createUsedCode(
            organizationId,
            retentionCode
          );
        }
        await this._organizationService.endTrial(organizationId);
        return { ok: true };
      }
      return {
        ok: false,
        error: 'capture_failed',
        status: invoice.status ?? 'unknown',
      };
    } catch (err) {
      // See the founding charge above: swallowing this made a 3DS challenge
      // look identical to a dead card, on the one flow whose entire purpose is
      // to keep a customer who is already trying to leave.
      const e = err as Stripe.errors.StripeError;
      Logger.error(
        `[stripe] retention charge failed for org ${organizationId}: ` +
          `${e?.code ?? e?.type ?? 'unknown'}${
            e?.decline_code ? ` / ${e.decline_code}` : ''
          } — ${e?.message ?? ''}`
      );
      return {
        ok: false,
        error: 'stripe_error',
        code: e?.code,
        requiresAction: e?.code === 'authentication_required',
      };
    }
  }

  /**
   * Lazy settlement when a deferred founding purchase's trial window has
   * closed: charge once (idempotent), then clear the DB trial flag.
   *
   * Needed because `captureFoundingLifetimeIfDue` used to run only from
   * `/billing/is-trial-finished`, which the FinishTrial overlay alone polls —
   * somebody who waited out the seven days and never pressed the button kept
   * lifetime without ever being charged. Auth middleware derives `isTrailing`
   * read-only and cannot write or charge.
   *
   * If the founding fee is still owed and the charge fails, leave `isTrailing`
   * set in the DB. Middleware already hides the trial UI once the window
   * closes; clearing the flag here would unlock a founding member who never
   * paid.
   */
  async settleFoundingLifetimeAfterTrial(organizationId: string) {
    const capture = await this.captureFoundingLifetimeIfDue(organizationId, {
      force: false,
    });
    const captureBlocked = !!(
      ('error' in capture && capture.error) ||
      ('status' in capture && capture.status)
    );
    if (captureBlocked) {
      return capture;
    }
    const org = await this._organizationService.getOrgById(organizationId);
    if (org?.isTrailing && !trialWindow(org.createdAt).open) {
      await this._organizationService.endTrial(organizationId);
    }
    return capture;
  }

  /**
   * Whether this organization's free trial is still running.
   *
   * Both lifetime grants below used to hardcode `false` here, which ended the
   * trial the instant somebody bought the founding-member deal. The owner's
   * rule is the opposite: buying it leaves the trial running, and the person
   * becomes a founding member when it expires — or sooner, from the "End free
   * trial" button that the X panel and the Billing screen both offer.
   */
  private async stillTrialing(organizationId: string) {
    const org = await this._organizationService.getOrgById(organizationId);
    return !!org?.isTrailing && trialWindow(org.createdAt).open;
  }

  /**
   * Grants a lifetime entitlement that was paid for rather than redeemed.
   *
   * Deliberately the *same* effect as `lifetimeDeal` — same Pro grant, same
   * `createOrUpdateSubscription` call — so there is one way to become a
   * founding member and not two that can drift apart.
   *
   * `paymentRef` stands in for the redemption code. The repository derives
   * `isLifetime` from that argument being present, and using the Stripe session
   * id (or `lifetime-setup:…`) means the row records which checkout granted it.
   *
   * Idempotent by the same route redemption is: a ref already stored as a used
   * code is a webhook Stripe delivered twice, and it grants nothing the second
   * time.
   */
  async grantLifetimeFromPayment(organizationId: string, paymentRef: string) {
    const existing = await this._subscriptionService.getCode(paymentRef);
    if (existing) {
      return { success: true, duplicate: true };
    }

    // Founding purchase always grants Pro — not the trial tier, not one rung up.
    const nextPackage = LIFETIME_GRANT_TIER;
    const findPricing = pricing[nextPackage];

    await this._subscriptionService.createOrUpdateSubscription(
      await this.stillTrialing(organizationId),
      makeId(10),
      organizationId,
      findPricing.channel!,
      nextPackage,
      'MONTHLY',
      null,
      paymentRef,
      organizationId
    );

    // Mid-trial convert: cancel any recurring Stripe subscription so trial-end
    // cannot bill the plan price *and* the founding fee. Safe now that
    // `deleteSubscription` leaves lifetime rows alone.
    const org = await this._organizationService.getOrgById(organizationId);
    if (org?.paymentId) {
      await this.cancelOpenStripeSubscriptions(org.paymentId);
    }

    return { success: true, tier: nextPackage };
  }

  async lifetimeDeal(organizationId: string, code: string) {
    const getCurrentSubscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(
        organizationId
      );
    if (getCurrentSubscription && !getCurrentSubscription?.isLifetime) {
      throw new Error('You already have a non lifetime subscription');
    }

    try {
      const testCode = AuthService.fixedDecryption(code);
      const findCode = await this._subscriptionService.getCode(testCode);
      if (findCode) {
        return {
          success: false,
        };
      }

      // Same grant as paid founding: always Pro (30 channels).
      const nextPackage = LIFETIME_GRANT_TIER;
      const findPricing = pricing[nextPackage];

      await this._subscriptionService.createOrUpdateSubscription(
        // Same rule as the paid grant above: redeeming a code does not cut a
        // running trial short.
        await this.stillTrialing(organizationId),
        makeId(10),
        organizationId,
        findPricing.channel!,
        nextPackage,
        'MONTHLY',
        null,
        testCode,
        organizationId
      );
      return {
        success: true,
      };
    } catch (err) {
      console.log(err);
      return {
        success: false,
      };
    }
  }
}
