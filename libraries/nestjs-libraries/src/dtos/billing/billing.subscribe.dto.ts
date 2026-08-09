import { IsIn } from 'class-validator';
import {
  pricing,
  PaidTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

/**
 * Tiers this endpoint will actually sell.
 *
 * `pricing` still carries STANDARD / TEAM / ULTIMATE so existing subscribers on
 * them keep resolving, but they are `retired` and not offered anywhere in the
 * UI. Accepting them here meant a hand-made POST could buy a retired tier at its
 * legacy price — and, because the checkout builder creates whatever product it
 * cannot find, mint that product in Stripe on the way through.
 *
 * Derived rather than written out, for the reason `SELECTABLE_PLANS` in
 * `utm.saver.tsx` is: a hardcoded list stops matching the moment a tier is
 * renamed or retired, and nothing errors when it does.
 */
export const SELLABLE_TIERS = Object.keys(pricing).filter(
  (plan) => plan !== 'FREE' && !pricing[plan].retired
);

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  @IsIn(SELLABLE_TIERS)
  billing: PaidTier;

  utm: string;

  dub: string;

  datafast_session_id: string;
  datafast_visitor_id: string;
}
