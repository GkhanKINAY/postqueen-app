/**
 * Whether this installation has working billing.
 *
 * Billing needs BOTH keys: the publishable key drives the tier/quota gates and
 * the checkout UI, the secret key makes the Stripe SDK and the subscription
 * lookups work. They used to be checked independently, so a half-configured
 * install ended up in a state that is neither "self-hosted and unlimited" nor
 * "paying customer".
 *
 * The damaging case was a secret key with no publishable key: the app reported
 * the unlimited self-hosted tier and showed no billing UI at all, while the
 * publish worker threw "No active subscription found" on every scheduled post
 * and the public API answered 401. Requiring both means a partial config is
 * treated as "billing off" — the same behaviour as a plain self-hosted install,
 * which is always safe because it only ever grants more than it withholds.
 */
export const isBillingEnabled = () =>
  !!process.env.STRIPE_PUBLISHABLE_KEY && !!process.env.STRIPE_SECRET_KEY;
