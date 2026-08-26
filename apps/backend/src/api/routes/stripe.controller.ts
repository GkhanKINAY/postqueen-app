import {
  Controller,
  HttpException,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentService } from '@gitroom/nestjs-libraries/services/payment/payment.service';
import { STRIPE_PROVIDER } from '@gitroom/nestjs-libraries/services/payment/payment.providers';

// Legacy webhook path, kept until the Stripe dashboard points at /payment/stripe
@ApiTags('Stripe')
@Controller('/stripe')
export class StripeController {
  constructor(private readonly _paymentService: PaymentService) {}

  @Post('/')
  async stripe(@Req() req: RawBodyRequest<Request>) {
    try {
      return await this._paymentService.webhook(
        STRIPE_PROVIDER,
        req.rawBody,
        // @ts-ignore
        req.headers
      );
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      // Everything the webhook refuses or fails on is already an
      // HttpException with a message. `new HttpException(e, 500)` would
      // serialise anything else to `{}`.
      throw new HttpException(
        (e as Error)?.message || 'Stripe webhook failed',
        500
      );
    }
  }
}
