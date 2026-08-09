import {
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import {
  StripeService,
  SUBSCRIPTION_SERVICE_TAG,
} from '@gitroom/nestjs-libraries/services/stripe.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Stripe')
@Controller('/stripe')
export class StripeController {
  constructor(
    private readonly _stripeService: StripeService,
  ) {}

  @Post('/')
  async stripe(@Req() req: RawBodyRequest<Request>) {
    let event: ReturnType<StripeService['validateRequest']>;
    try {
      event = this._stripeService.validateRequest(
        req.rawBody,
        // @ts-ignore
        req.headers['stripe-signature'],
        process.env.STRIPE_SIGNING_KEY
      );
    } catch (e) {
      // A bad or missing signature is the caller's fault, not ours. This used
      // to escape as a 500 with a full stack trace, so every scanner that POSTs
      // to this URL filled the logs with what looks like a crash — and a real
      // signing-key mismatch was indistinguishable from that noise.
      throw new HttpException(
        `Invalid Stripe signature: ${(e as Error)?.message}`,
        HttpStatus.BAD_REQUEST
      );
    }

    // One Stripe account can serve several integrations, so ignore anything we
    // did not create.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const service = event?.data?.object?.metadata?.service;
    const isOurs = service === SUBSCRIPTION_SERVICE_TAG;

    // Some objects never carry `metadata.service`: an invoice's lives on the
    // subscription it bills, and a charge's on nothing at all. Left to the check
    // above they are dropped before the switch ever sees them, which is why the
    // two invoice events were already exempt. The charge events join them for
    // the same reason — a dispute has to revoke access, and it cannot if it is
    // discarded here.
    //
    // Exempting them does mean events from another integration on the same
    // account reach the switch. That is safe because every handler below
    // resolves the customer to an organization first and returns when there is
    // none: the org lookup, not this tag, is what actually scopes them.
    const UNTAGGED_EVENTS = [
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'charge.dispute.created',
      'charge.refunded',
    ];

    if (!isOurs && !UNTAGGED_EVENTS.includes(event.type)) {
      return { ok: true };
    }

    // Claimed before the switch so a redelivery cannot run a handler twice, and
    // stamped complete only once one actually succeeds.
    const claim = await this._stripeService.claimEvent(event.id, event.type);
    if (claim === 'duplicate') {
      return { ok: true, duplicate: true };
    }
    if (claim === 'in_flight') {
      // Another attempt is still running. Answering 2xx here would tell Stripe
      // the event was delivered while that attempt can still fail, and no
      // redelivery would ever come. 409 keeps it in Stripe's retry schedule.
      throw new HttpException(
        `Stripe event ${event.id} is already being processed`,
        HttpStatus.CONFLICT
      );
    }

    // The switch lives in here so every `return` inside it is awaited by one
    // place. Two cases used to `return` a promise without awaiting, which put
    // their rejections outside the try below — so the release never ran and the
    // claim stranded the event for good.
    const handle = async () => {
      switch (event.type) {
        // Lifetime checkout: immediate `mode: 'payment'`, or deferred
        // `mode: 'setup'` (+ lifetime_deferred) that grants now and charges
        // $49 when the trial ends. Neither is a subscription event.
        // Async methods complete the session before the money lands, so the
        // grant has to wait for this second event. Both share a block because
        // the `payment_status` check below is the whole difference between them.
        case 'checkout.session.async_payment_succeeded':
        case 'checkout.session.completed': {
          // @ts-ignore — the session shape is narrower than Stripe.Event
          const session = event.data.object as any;
          const organizationId = session?.metadata?.organizationId;

          // Deferred founding checkout: card on file, charge later.
          if (
            session?.mode === 'setup' &&
            session?.metadata?.lifetime_deferred === '1'
          ) {
            if (!organizationId) {
              throw new Error(
                `${event.type} setup lifetime missing organizationId`
              );
            }
            return this._stripeService.completeDeferredLifetimeSetup(
              organizationId,
              session
            );
          }

          if (session?.mode !== 'payment') {
            return { ok: true };
          }
          if (!organizationId) {
            // Nothing to grant it to. Loud rather than silent: a paid session
            // with no organization is a bug in whatever created it.
            throw new Error(
              `${event.type} with mode=payment and no organizationId`
            );
          }
          // `completed` is not the same as settled. An async payment method
          // completes the session as `unpaid` and settles later, and granting
          // on that handed out lifetime PRO before the money landed —
          // `async_payment_succeeded` above is the event that closes it
          // properly.
          //
          // `no_payment_required` is the 100%-off case and IS grantable: a
          // promotion code only exists because the owner created one, so a
          // giveaway should work rather than silently give nothing. It is
          // logged because it is also the shape a mis-scoped code would take —
          // Stripe scopes promotion codes to products, not to this session, so
          // a code meant for a subscription can be typed in here.
          if (
            session?.payment_status !== 'paid' &&
            session?.payment_status !== 'no_payment_required'
          ) {
            return { ok: true, granted: false, reason: session?.payment_status };
          }
          if (session?.payment_status === 'no_payment_required') {
            Logger.warn(
              `[stripe] granting lifetime to org ${organizationId} on a fully discounted session (${session.id})`
            );
          }
          return this._stripeService.grantLifetimeFromPayment(
            organizationId,
            session.id
          );
        }
        case 'invoice.payment_succeeded':
          return await this._stripeService.paymentSucceeded(event);
        // A renewal that could not be charged. Unhandled until now, so the only
        // thing a customer with a dead card saw was nothing at all — until
        // Stripe gave up weeks later and cancelled the subscription, at which
        // point the app went to the paywall with no explanation.
        case 'invoice.payment_failed':
          return await this._stripeService.paymentFailed(event);
        case 'customer.subscription.created':
          return await this._stripeService.createSubscription(event);
        case 'customer.subscription.updated':
          return await this._stripeService.updateSubscription(event);
        case 'customer.subscription.deleted':
          return await this._stripeService.deleteSubscription(event);
        // Money leaving again. Neither of these used to be handled, so a
        // chargeback cost the payment, the bank's fee, and the plan stayed on.
        case 'charge.dispute.created':
          return await this._stripeService.disputeCreated(event);
        case 'charge.refunded':
          return await this._stripeService.chargeRefunded(event);
        default:
          return { ok: true };
      }
    };

    try {
      const result = await handle();
      await this._stripeService.completeEvent(event.id);
      return result;
    } catch (e) {
      // Log BEFORE releasing. The release is a database write, and the most
      // likely reason the handler just failed is that the database is unhappy —
      // so releasing first meant its own throw swallowed the original cause,
      // which is the one thing this block exists to record.
      //
      // The 500 is what makes Stripe retry, and that part always worked. What
      // did not: `new HttpException(e, 500)` serialises an Error to `{}`, and
      // Nest does not log HttpExceptions, so every webhook failure was a blank
      // 500 with no record anywhere of what broke.
      Logger.error(
        `[stripe] handler failed for ${event.type} (${event.id}): ${
          (e as Error)?.message ?? e
        }`,
        (e as Error)?.stack
      );
      try {
        // Hand the event back so Stripe's retry can have another go — the claim
        // is only meant to stop duplicates of work that actually succeeded. If
        // even this fails, the row goes stale and is taken over later.
        await this._stripeService.releaseEvent(event.id);
      } catch (releaseErr) {
        Logger.error(
          `[stripe] could not release ${event.id}: ${
            (releaseErr as Error)?.message ?? releaseErr
          }`
        );
      }
      throw new HttpException(
        `Stripe handler failed for ${event.type}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
