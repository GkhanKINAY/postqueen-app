import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';

@Injectable()
@Activity()
export class BillingReconcileActivity {
  constructor(private _stripeService: StripeService) {}

  /**
   * Revokes local plans that Stripe no longer backs (see
   * `reconcileSubscriptions`), so a lost or out-of-order webhook cannot leave
   * paid access behind for good.
   */
  @ActivityMethod()
  async reconcileStripeSubscriptions() {
    const result = await this._stripeService.reconcileSubscriptions();
    if (result.revoked) {
      Logger.warn(
        `[billing] reconcile checked ${result.checked}, revoked ${result.revoked}`
      );
    }
    return result;
  }
}
