import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  LIFETIME_PRICE,
  LIFETIME_RETENTION_PRICE,
  PREVIOUS_LIFETIME_PRICE,
  TRIAL_DAYS,
  effectiveIsTrailing,
  foundingChargeCents,
  lifetimeCheckoutQuotedCents,
  pricing,
} from './pricing.ts';

describe('lifetime vs monthly Pro prices', () => {
  it('keeps founding at 99 and monthly Pro at 49', () => {
    assert.equal(LIFETIME_PRICE, 99);
    assert.equal(pricing.PRO.month_price, 49);
  });

  it('halves the founding fee for retention', () => {
    assert.equal(LIFETIME_RETENTION_PRICE, LIFETIME_PRICE / 2);
  });

  it('freezes in-flight deferred charges at the previous quote', () => {
    assert.equal(PREVIOUS_LIFETIME_PRICE, 49);
    assert.equal(foundingChargeCents(undefined), PREVIOUS_LIFETIME_PRICE * 100);
    assert.equal(foundingChargeCents(null), PREVIOUS_LIFETIME_PRICE * 100);
    assert.equal(
      foundingChargeCents(String(PREVIOUS_LIFETIME_PRICE * 100)),
      PREVIOUS_LIFETIME_PRICE * 100
    );
  });

  it('charges new purchases at the current founding price', () => {
    assert.equal(lifetimeCheckoutQuotedCents(undefined), LIFETIME_PRICE * 100);
    assert.equal(foundingChargeCents(LIFETIME_PRICE * 100), LIFETIME_PRICE * 100);
    assert.equal(
      lifetimeCheckoutQuotedCents(String(PREVIOUS_LIFETIME_PRICE * 100)),
      PREVIOUS_LIFETIME_PRICE * 100
    );
  });
});

describe('effectiveIsTrailing', () => {
  const KEYS = ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'];
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test';
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it('is on trial while the flag is set and the window is open', () => {
    assert.equal(
      effectiveIsTrailing({ isTrailing: true, createdAt: daysAgo(1) }),
      true
    );
  });

  it('ignores a flag nobody cleared once the window has closed', () => {
    // A founding member past the seven days: no webhook ever clears the row.
    assert.equal(
      effectiveIsTrailing({
        isTrailing: true,
        createdAt: daysAgo(TRIAL_DAYS + 1),
      }),
      false
    );
  });

  it('reads the date an MCP organization carries as a string', () => {
    // The MCP request context holds the organization as JSON.
    const org = JSON.parse(
      JSON.stringify({ isTrailing: true, createdAt: daysAgo(TRIAL_DAYS + 1) })
    );
    assert.equal(effectiveIsTrailing(org), false);
  });

  it('gives an already derived flag the same answer again', () => {
    const org = { isTrailing: true, createdAt: daysAgo(TRIAL_DAYS + 1) };
    const derived = { ...org, isTrailing: effectiveIsTrailing(org) };
    assert.equal(effectiveIsTrailing(derived), effectiveIsTrailing(org));
  });

  it('is never on trial without the flag, or without billing', () => {
    assert.equal(
      effectiveIsTrailing({ isTrailing: false, createdAt: daysAgo(1) }),
      false
    );
    assert.equal(effectiveIsTrailing(null), false);
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(
      effectiveIsTrailing({ isTrailing: true, createdAt: daysAgo(1) }),
      false
    );
  });
});
