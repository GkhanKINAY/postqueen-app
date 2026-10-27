import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  normalizeTier,
  pricing,
  PaidTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

/**
 * Tiers this endpoint will actually sell.
 *
 * `pricing` still carries STANDARD / TEAM / LEGACY_ULTIMATE so existing subscribers on
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

const clip = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.slice(0, 200) : value;

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  // A client still sending the old AGENCY key buys the same plan.
  @Transform(({ value }) => normalizeTier(value))
  @IsIn(SELLABLE_TIERS)
  billing: PaidTier;

  // The buyer's first visit, from UtmSaver. Everything in the body lands in
  // the subscription's metadata, where the sales channel's card reads it.
  // `utm` is utm_source (or `?utm=` / `?ref=`). Capped well under Stripe's 500
  // character limit for a metadata value, which would refuse the checkout.
  // Cut rather than refused: a longer `utm` was accepted before.
  @IsOptional()
  @IsString()
  @Transform(clip)
  utm: string;

  @IsOptional()
  @IsString()
  @Transform(clip)
  utm_medium?: string;

  @IsOptional()
  @IsString()
  @Transform(clip)
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  @Transform(clip)
  utm_content?: string;

  @IsOptional()
  @IsString()
  @Transform(clip)
  utm_term?: string;

  // Host only, e.g. "www.google.com".
  @IsOptional()
  @IsString()
  @Transform(clip)
  referrer?: string;

  // First path segment only, e.g. "/pricing": a first page can be an
  // activation or reset link with its token in the path.
  @IsOptional()
  @IsString()
  @Transform(clip)
  landing?: string;

  dub: string;

  datafast_session_id: string;
  datafast_visitor_id: string;

  /**
   * Ignored. The box that asked customers to give up their right of
   * withdrawal is gone; an app loaded before that still sends it.
   */
  @IsOptional()
  @IsBoolean()
  withdrawalWaiver?: boolean;

  // The Meta pixel's cookies (_fbc / _fbp), saved on the subscription for the
  // trial and purchase events the webhooks send. Dropped rather than cut when
  // longer than a Stripe metadata value (500): a cut one would not match.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.length <= 500 ? value : undefined
  )
  fbc?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.length <= 500 ? value : undefined
  )
  fbp?: string;
}
