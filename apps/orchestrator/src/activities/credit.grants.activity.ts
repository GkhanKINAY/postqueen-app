import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { PaymentService } from '@gitroom/nestjs-libraries/services/payment/payment.service';

@Injectable()
@Activity()
export class CreditGrantsActivity {
  constructor(private _paymentService: PaymentService) {}

  /** See `PaymentService.grantScheduledCredits`. */
  @ActivityMethod()
  async grantScheduledCredits() {
    const result = await this._paymentService.grantScheduledCredits();
    if (result.granted || result.failed) {
      Logger.log(
        `[credits] daily grants: checked ${result.checked}, granted ${result.granted}, failed ${result.failed}`
      );
    }
    return result;
  }
}
