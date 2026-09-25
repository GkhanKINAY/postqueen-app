import { Equals, IsIn } from 'class-validator';
import {
  CREDIT_PACKS,
  CreditPackId,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

export class BuyCreditsDto {
  @IsIn(CREDIT_PACKS.map((pack) => pack.id))
  pack: CreditPackId;

  /**
   * Bought credits can be used the moment they arrive, so the customer asks
   * for that and acknowledges the 14-day right of withdrawal ends once they
   * are used. There is no pack without it.
   */
  @Equals(true)
  withdrawalWaiver: true;
}
