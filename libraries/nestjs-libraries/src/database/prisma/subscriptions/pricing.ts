import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

export interface PricingInnerInterface {
  current: string;
  /**
   * Commercial name shown in the UI. The identifier (`current` / object key)
   * can differ, e.g. the retired `LEGACY_ULTIMATE` row is still labeled
   * "Ultimate (legacy)".
   */
  label: string;
  /**
   * Kept so live subscriptions on an old tier still resolve, but never offered
   * for sale again. Anything that *lists plans to buy* must filter these out;
   * anything that *looks a subscriber's tier up* must not.
   */
  retired?: boolean;
  month_price: number;
  year_price: number;
  channel?: number;
  posts_per_month: number;
  team_members: boolean;
  community_features: boolean;
  featured: boolean;
  ai: boolean;
  import_from_channels: boolean;
  image_generator?: boolean;
  image_generation_count: number;
  generate_videos: number;
  /**
   * Minutes of source video this plan may clip a month (one minute of the
   * YouTube video is one minute, whatever the clips come to). See
   * CLIPPING_MINUTES_PROPOSAL.
   */
  clipping_minutes: number;
  /**
   * Credits the plan adds each month, in whole credits. A yearly plan gets
   * twelve months of them at once, a trial gets one month. See `planCredits`.
   */
  monthly_credits: number;
  public_api: boolean;
  webhooks: number;
  autoPost: boolean;
}
export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}

/**
 * PROPOSAL, NOT DECIDED: the owner sets these before clipping is switched on.
 *
 * Upstream Postiz ships 60 / 120 / 300 / 600 minutes on its four plans
 * (9aad99cd). They are mapped here by rung, cheapest to dearest; retired
 * tiers take the numbers of the tier that replaced them. Nothing meters or
 * shows them while clipping is not configured (`isClippingEnabled`): the
 * routes and tools refuse first, and the plan cards leave the line out.
 */
export const CLIPPING_MINUTES_PROPOSAL = {
  CREATOR: 60,
  GROWTH: 120,
  PRO: 300,
  ULTIMATE: 600,
};
export const pricing: PricingInterface = {
  FREE: {
    current: 'FREE',
    label: 'Free',
    month_price: 0,
    year_price: 0,
    channel: 0,
    image_generation_count: 0,
    posts_per_month: 0,
    team_members: false,
    community_features: false,
    featured: false,
    ai: false,
    import_from_channels: false,
    image_generator: false,
    public_api: false,
    webhooks: 0,
    autoPost: false,
    generate_videos: 0,
    clipping_minutes: 0,
    monthly_credits: 0,
  },
  // Current sellable tiers (CREATOR / GROWTH / PRO / ULTIMATE).
  // Retired STANDARD / TEAM / LEGACY_ULTIMATE rows below keep old prices so any
  // unmigrated subscription still resolves without lying about the charge.
  CREATOR: {
    current: 'CREATOR',
    label: 'Creator',
    month_price: 20,
    // Intentional: 6.6× monthly ($132/yr ≈ $11/mo), not 8× like the other tiers.
    year_price: 132,
    channel: 5,
    posts_per_month: 1000000,
    image_generation_count: 20,
    team_members: false,
    ai: true,
    community_features: false,
    featured: false,
    import_from_channels: true,
    // `image_generation_count` above is the entitlement; this flag only decides
    // whether the plan card lists it and whether the picture editor shows its
    // generator panel. False hid 20 generations a month that Creator has.
    image_generator: true,
    public_api: true,
    webhooks: 2,
    // Every paid tier has Auto Post (owner, 2026-08-08). It read false here
    // while nothing on the backend consulted the flag, so Creator had the
    // feature anyway; the gate that now exists would have taken it away from
    // customers using it today. Same reason on retired STANDARD below.
    autoPost: true,
    generate_videos: 3,
    clipping_minutes: CLIPPING_MINUTES_PROPOSAL.CREATOR,
    monthly_credits: 150,
  },
  GROWTH: {
    current: 'GROWTH',
    label: 'Growth',
    month_price: 33,
    year_price: 264,
    channel: 10,
    posts_per_month: 1000000,
    image_generation_count: 100,
    community_features: true,
    team_members: true,
    featured: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10,
    autoPost: true,
    generate_videos: 10,
    clipping_minutes: CLIPPING_MINUTES_PROPOSAL.GROWTH,
    monthly_credits: 300,
  },
  PRO: {
    current: 'PRO',
    label: 'Pro',
    month_price: 49,
    // 470 -> 396, the design's number, which is the 8x that makes the yearly
    // badge honest. PRO is the one tier that keeps its name, so unlike the
    // other three there is nowhere to park the legacy price: an existing
    // yearly PRO subscriber will see 396 while Stripe keeps charging them 470
    // until they change plan. Called out in the log.
    year_price: 396,
    channel: 30,
    posts_per_month: 1000000,
    image_generation_count: 300,
    community_features: true,
    team_members: true,
    featured: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 30,
    autoPost: true,
    generate_videos: 30,
    clipping_minutes: CLIPPING_MINUTES_PROPOSAL.PRO,
    monthly_credits: 500,
  },
  ULTIMATE: {
    current: 'ULTIMATE',
    label: 'Ultimate',
    month_price: 99,
    year_price: 792,
    // Unlimited, decided by the owner on 2026-08-04. It was left at 100 while
    // nobody owned the call, because a channel is recurring API load and not a
    // label — unlimited channels means unlimited recurring background work.
    // Same very-large-number idiom as posts_per_month, so the display's
    // "> 10000 -> Unlimited" branch renders it without a special case.
    channel: 1000000,
    posts_per_month: 1000000,
    image_generation_count: 500,
    community_features: true,
    team_members: true,
    featured: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10000,
    autoPost: true,
    generate_videos: 60,
    clipping_minutes: CLIPPING_MINUTES_PROPOSAL.ULTIMATE,
    monthly_credits: 1000,
  },

  // --- retired: kept so existing subscriptions still resolve ---------------
  STANDARD: {
    current: 'STANDARD',
    label: 'Standard',
    retired: true,
    month_price: 29,
    year_price: 278,
    channel: 5,
    posts_per_month: 1000000,
    image_generation_count: 20,
    team_members: false,
    ai: true,
    community_features: false,
    featured: false,
    import_from_channels: true,
    // See CREATOR: the same 20 generations, hidden by the same flag.
    image_generator: true,
    public_api: true,
    webhooks: 2,
    autoPost: true,
    generate_videos: 3,
    clipping_minutes: CLIPPING_MINUTES_PROPOSAL.CREATOR,
    monthly_credits: 150,
  },
  TEAM: {
    current: 'TEAM',
    label: 'Team',
    retired: true,
    month_price: 39,
    year_price: 374,
    channel: 10,
    posts_per_month: 1000000,
    image_generation_count: 100,
    community_features: true,
    team_members: true,
    featured: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10,
    autoPost: true,
    generate_videos: 10,
    clipping_minutes: CLIPPING_MINUTES_PROPOSAL.GROWTH,
    monthly_credits: 300,
  },
  // The tier upstream sold as ULTIMATE before the fork. Renamed so the top
  // plan could take the name (migration 20260924120000).
  LEGACY_ULTIMATE: {
    current: 'LEGACY_ULTIMATE',
    label: 'Ultimate (legacy)',
    retired: true,
    month_price: 99,
    year_price: 950,
    channel: 100,
    posts_per_month: 1000000,
    image_generation_count: 500,
    community_features: true,
    team_members: true,
    featured: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10000,
    autoPost: true,
    generate_videos: 60,
    clipping_minutes: CLIPPING_MINUTES_PROPOSAL.ULTIMATE,
    monthly_credits: 1000,
  },
};

/**
 * Every tier a *subscription row* can hold — retired ones included, because
 * live subscriptions still hold them and the code has to be able to read one.
 */
export type PaidTier =
  | 'STANDARD'
  | 'TEAM'
  | 'PRO'
  | 'LEGACY_ULTIMATE'
  | 'CREATOR'
  | 'GROWTH'
  | 'ULTIMATE';

/** What a *user* can be on, which includes having no subscription at all. */
export type AnyTier = 'FREE' | PaidTier;

/**
 * Founding-member / lifetime purchase always grants Pro — not the trial tier
 * and not one rung up the old ladder. Owner 2026-08-07.
 */
export const LIFETIME_GRANT_TIER: PaidTier = 'PRO';

/**
 * Tier granted by a founding purchase. Argument kept so call sites stay
 * stable; the current subscription no longer changes the grant.
 */
export const nextLifetimeTier = (_current?: string | null): PaidTier =>
  LIFETIME_GRANT_TIER;

/**
 * Old spellings of a tier that are still accepted as input. The top plan was
 * keyed AGENCY until 2026-09-24, and that key lives on outside this code:
 * Stripe subscription metadata, `?plan=` links, a `selectedPlan` stashed in
 * localStorage, and resellers calling `/public/modify-subscription`.
 */
export const TIER_ALIASES: Record<string, string> = {
  AGENCY: 'ULTIMATE',
};

export const normalizeTier = <T extends string | undefined | null>(tier: T) =>
  ((tier && TIER_ALIASES[tier.toUpperCase()]) || tier) as T;

/** Commercial plan name for UI. Falls back to the raw key if unknown. */
export function tierLabel(tier: string | undefined | null): string {
  if (!tier) return '';
  return pricing[normalizeTier(tier)]?.label ?? tier;
}

/**
 * What a yearly plan works out to per month. Every tier is priced so this lands
 * on a whole number — 11 / 22 / 33 / 66 — which is why CREATOR's yearly is 6.6x
 * its monthly and not 8x like the rest.
 */
export const effectiveMonthly = (tier: string) => {
  const plan = pricing[tier] || pricing.PRO;
  const perMonth = plan.year_price / 12;
  return perMonth % 1 === 0 ? String(perMonth) : perMonth.toFixed(2);
};

/**
 * How many months of a year a customer does not pay for by billing yearly.
 * Derived rather than written down: the badge used to be a hardcoded "20% Off",
 * which was true of the old prices and understates every current one — CREATOR
 * is 45% off, the rest are 33%.
 */
export const monthsFree = (tier: string) => {
  const plan = pricing[tier] || pricing.PRO;
  if (!plan.month_price) return 0;
  return Math.round(
    (plan.month_price * 12 - plan.year_price) / plan.month_price
  );
};

/**
 * How long the founding-member offer stays open after somebody signs up.
 *
 * The offer is genuinely time-boxed — twenty-four hours from registration — so
 * a countdown here is a fact rather than the scarcity theatre this migration
 * refused to build earlier. That refusal stands for a fabricated deadline; this
 * one is derived from `User.createdAt` and enforced below.
 */
export const LIFETIME_WINDOW_HOURS = 24;

/**
 * What the founding-member offer costs, in whole dollars.
 *
 * One figure for everybody. The tier it grants is always Pro
 * (`LIFETIME_GRANT_TIER`) — channels, AI images/videos, and plan limits come
 * from `pricing.PRO`, independent of the account's current trial or paid tier.
 *
 * Here rather than in the checkout code because the screen that shows the price
 * and the session that charges it must not be able to disagree.
 */
export const LIFETIME_PRICE = 99;

/**
 * Whether the founding-member offer is sold to anyone new. Off since
 * 2026-09-25 (owner): new signups pick a subscription instead. Existing
 * founding members, and founding fees already deferred to the end of a trial,
 * are not affected — only the checkout, the upsells and the cancel-flow offer
 * (hidden in the UI; its endpoint stays open so a paid-but-unfinished
 * retention can still complete).
 * Flip back to `true` to sell it again.
 */
export const LIFETIME_ON_SALE = false;

/**
 * Cancel-flow retention price for a founding-member trial: 50% off the one-time
 * founding fee (`LIFETIME_PRICE / 2`). Shown instead of the monthly 50%×3 coupon.
 */
export const LIFETIME_RETENTION_PRICE = LIFETIME_PRICE / 2;

/**
 * Founding price in force before `LIFETIME_PRICE` moved to 99. Deferred
 * checkouts that predate a quote snapshot showed this amount and must settle
 * at it — not at the new price — when the trial ends.
 */
export const PREVIOUS_LIFETIME_PRICE = 49;

const quotedCents = (raw?: string | number | null): number | null => {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    return Math.round(n);
  }
  return null;
};

/**
 * Cents to charge for a deferred founding fee.
 *
 * Prefer the amount snapshotted at checkout (`lifetime_quoted_cents` on the
 * Stripe customer). A missing snapshot means the checkout predated quoting, so
 * settle at `PREVIOUS_LIFETIME_PRICE` rather than whatever `LIFETIME_PRICE` is
 * now.
 */
export const foundingChargeCents = (quoted?: string | number | null): number =>
  quotedCents(quoted) ?? PREVIOUS_LIFETIME_PRICE * 100;

/**
 * Cents to freeze on a new founding checkout. Keep an existing snapshot so a
 * later `LIFETIME_PRICE` change cannot raise an in-flight quote. New purchases
 * freeze `LIFETIME_PRICE * 100`.
 */
export const lifetimeCheckoutQuotedCents = (
  existing?: string | number | null
): number => quotedCents(existing) ?? LIFETIME_PRICE * 100;

/**
 * The founding-member window for an account, from its registration date.
 *
 * Shared rather than computed in the UI, because the screen that draws the
 * countdown and the route that takes the money have to agree about when the
 * offer closed. A clock the frontend owns alone is a clock the backend will
 * eventually disagree with.
 */
export const lifetimeWindow = (createdAt?: string | Date | null) => {
  const started = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!started || Number.isNaN(started)) {
    // No registration date means no window to be inside of. Closed is the safe
    // reading: it withholds an offer rather than granting one on bad data.
    return { endsAt: null, msLeft: 0, open: false };
  }
  const endsAt = new Date(started + LIFETIME_WINDOW_HOURS * 60 * 60 * 1000);
  const msLeft = endsAt.getTime() - Date.now();
  return { endsAt, msLeft: Math.max(0, msLeft), open: msLeft > 0 };
};

/** How long a free trial runs, from the organization's registration. */
export const TRIAL_DAYS = 7;

/**
 * The free-trial window for an organization, from its registration date.
 *
 * `Organization.isTrailing` records that a trial **started**. Nothing recorded
 * that one had ended: the flag is cleared in exactly two places — Stripe's
 * `customer.subscription.updated`, and the "End free trial" button. A founding
 * member has no Stripe subscription, so no webhook is ever coming for them, and
 * nothing is scheduled anywhere in this codebase to notice. Somebody who bought
 * the lifetime deal and never pressed the button therefore stayed on trial
 * forever, with X locked and the trial banner up.
 *
 * So the end is derived, the same way `lifetimeWindow` derives the 24-hour
 * offer: the row says a trial began, this says whether it is still running. No
 * column, no cron, and nothing to drift.
 *
 * Every trial lock reads it through `effectiveIsTrailing` below, so the app,
 * the public API, MCP and the orchestrator all get the same answer.
 */
export const trialWindow = (
  createdAt?: string | Date | null,
  days: number = TRIAL_DAYS
) => {
  const started = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!started || Number.isNaN(started)) {
    // Unlike the lifetime offer, the safe reading here is *open*: a missing
    // registration date must not cut somebody's trial short.
    return { endsAt: null, msLeft: 0, open: true };
  }
  const endsAt = new Date(started + days * 24 * 60 * 60 * 1000);
  const msLeft = endsAt.getTime() - Date.now();
  return { endsAt, msLeft: Math.max(0, msLeft), open: msLeft > 0 };
};

/**
 * Whether an organization is on its free trial right now: the stored flag says
 * a trial *started*, `trialWindow` says whether it is still running.
 *
 * Every trial lock goes through this — `auth.middleware.ts` when it assembles
 * `req.org` for the app, and the services that are also reached with an
 * organization read straight from the database: the public API, MCP and the
 * orchestrator. When the app derived the flag and those read the raw row, an
 * organization whose flag was never cleared (a founding member past its seven
 * days) was let through by the app and then refused by the video job the app
 * had just started. Deriving an already derived flag changes nothing, so a
 * caller never has to know which kind it was handed.
 *
 * Read-only on purpose. The row is left alone — Stripe's webhook and the "End
 * free trial" button are still the only things that write it.
 *
 * Billing off: there is no trial to be in, whatever the row says (every
 * organization is created with the flag set).
 */
export const effectiveIsTrailing = (
  org?: {
    isTrailing?: boolean | null;
    createdAt?: Date | string | null;
    subscription?: { isLifetime?: boolean | null } | null;
  } | null
) =>
  isBillingEnabled() &&
  !!org?.isTrailing &&
  // A Stripe trial starts at checkout, not at signup: somebody who checks out
  // on day 6 is trialing until day 13, and a window counted from signup lifted
  // the trial locks on day 7 for six days of the paid plan's locked features,
  // free for anyone who then cancels. With a Stripe plan the flag, which the
  // webhook clears on conversion, decides, capped at twice the trial so a
  // missed webhook cannot keep the locks on for good.
  trialWindow(
    org.createdAt,
    org.subscription && !org.subscription.isLifetime
      ? TRIAL_DAYS * 2
      : TRIAL_DAYS
  ).open;

/**
 * Credit amounts are stored and passed around as whole hundredths of a credit,
 * so fractional costs (an X post is 0.4) add up without float drift. Only the
 * edges that show a number to a person divide by this.
 */
export const CREDIT_UNIT = 100;

/** Hundredths of a credit as the credits a person reads. */
export const toCredits = (units: number) =>
  Math.round(units) / CREDIT_UNIT;

/** How long credits handed back by a refund stay spendable when the grant
 * they came from has already expired. */
export const CREDIT_REFUND_DAYS = 30;

/** Credits every organization on a paid plan is given each calendar month,
 * on top of the plan's own, whole credits. They expire at the month's end. */
export const CREDIT_GIFT_MONTHLY = 5;

/** Days a plan's credits stay spendable past the end of the period they were
 * granted for, so a renewal paid a little late does not leave a gap. */
export const CREDIT_PLAN_GRACE_DAYS = 3;

/**
 * What a plan period adds to the balance, in hundredths: the monthly amount,
 * or twelve of them for a yearly period. A trial is one month whatever the
 * period, so a yearly trial is not a year of free credits.
 */
export const planCredits = (
  tier: string | undefined | null,
  period: 'MONTHLY' | 'YEARLY',
  trial = false
) =>
  (pricing[normalizeTier(tier) || '']?.monthly_credits || 0) *
  (period === 'YEARLY' && !trial ? 12 : 1) *
  CREDIT_UNIT;
