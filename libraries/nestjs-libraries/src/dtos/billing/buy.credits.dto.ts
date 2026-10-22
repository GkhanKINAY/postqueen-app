import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  CREDIT_PACKS,
  CreditPackId,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

export class BuyCreditsDto {
  @IsIn(CREDIT_PACKS.map((pack) => pack.id))
  pack: CreditPackId;

  /**
   * Ignored. The box that asked customers to give up their right of
   * withdrawal is gone; an app loaded before that still sends it.
   */
  @IsOptional()
  @IsBoolean()
  withdrawalWaiver?: boolean;
}
