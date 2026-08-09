#!/usr/bin/env node
/**
 * Brings a Stripe account up to the configuration this app expects.
 *
 * Everything here is idempotent: run it twice and the second run reports SKIP on
 * every step. Run it against test first, then against live with the live key —
 * the two accounts hold separate tax registrations, webhooks and portal configs,
 * so both need it.
 *
 *   node scripts/stripe-setup.mjs --dry-run
 *   node scripts/stripe-setup.mjs
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs --live-confirm
 *
 * Nothing secret is hardcoded — this repository is public. The VAT number, the
 * webhook URL and the policy URLs all come from the environment, and the script
 * reads the repo's .env as a fallback so the usual dev run needs no arguments.
 *
 * Env:
 *   STRIPE_SECRET_KEY  required; decides which account (and mode) is configured
 *   PQ_VAT_NUMBER      seller's own VAT number, e.g. EE123456789. Put on every
 *                      invoice you issue — an EU B2B invoice is not valid without it
 *   PQ_TAX_COUNTRY     home country for the tax registration, default EE
 *   PQ_WEBHOOK_URL     public URL of POST /stripe, e.g. https://api.example.com/stripe
 *   PQ_TOS_URL         terms of service, shown in the billing portal
 *   PQ_PRIVACY_URL     privacy policy, shown in the billing portal
 *
 * Flags:
 *   --dry-run       report what would change, touch nothing
 *   --oss           register the EU One Stop Shop scheme instead of small_seller.
 *                   Only once you actually hold an OSS registration — see below
 *   --live-confirm  required when the key is a live key, so a live account is
 *                   never reconfigured by a stray shell history entry
 *
 * On the tax scheme. Under the EU's EUR 10 000/year distance-selling threshold a
 * seller charges their OWN country's VAT on B2C sales to other member states,
 * which is Stripe's `small_seller` place-of-supply scheme and the default here.
 * Above it you must charge the destination country's rate, which means either an
 * OSS registration (--oss) or a VAT registration in every member state. The
 * threshold counts B2C only: sales outside the EU and B2B sales to a valid VAT
 * number do not count toward it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const Stripe = require('stripe');

const has = (name) => process.argv.includes(`--${name}`);
const DRY = has('dry-run');
const OSS = has('oss');

/** process.env wins; the repo .env is the convenience fallback for dev runs. */
function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = fs
      .readFileSync(path.join(ROOT, '.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${name}=`));
    return line
      ? line.slice(name.length + 1).replace(/^"|"$/g, '') || undefined
      : undefined;
  } catch {
    return undefined;
  }
}

const key = env('STRIPE_SECRET_KEY');
if (!key) {
  console.error('STRIPE_SECRET_KEY is not set (env or .env).');
  process.exit(1);
}
const LIVE = key.startsWith('sk_live');
if (LIVE && !has('live-confirm')) {
  console.error(
    'This is a LIVE key. Re-run with --live-confirm once you mean it.'
  );
  process.exit(1);
}

// Pinned for the same reason stripe.service.ts is: an SDK bump should not
// quietly change what this script writes to a live account.
const stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' });
const results = [];
const say = (step, state, detail) => {
  results.push({ step, state });
  const mark = { SKIP: '  =', DONE: '  +', WARN: '  !', FAIL: '  x' }[state];
  console.log(`${mark} ${step}${detail ? ` — ${detail}` : ''}`);
};

console.log(
  `\nStripe setup — ${LIVE ? 'LIVE' : 'TEST'} mode${DRY ? ' (dry run)' : ''}\n`
);

// --- 1. the seller's own VAT number, so it lands on every invoice ------------
const vat = env('PQ_VAT_NUMBER');
if (!vat) {
  say('own VAT number', 'WARN', 'PQ_VAT_NUMBER not set, skipping');
} else {
  const existing = await stripe.taxIds.list({ owner: { type: 'self' }, limit: 20 });
  const match = existing.data.find((t) => t.value === vat);
  if (match) {
    say('own VAT number', 'SKIP', `${vat} already on the account`);
  } else if (DRY) {
    say('own VAT number', 'DONE', `would add ${vat}`);
  } else {
    const created = await stripe.taxIds.create({
      type: 'eu_vat',
      value: vat,
      owner: { type: 'self' },
    });
    say('own VAT number', 'DONE', `${created.value} (${created.id})`);
  }
}

// --- 2. tax registration ----------------------------------------------------
// Without one Stripe calculates zero tax everywhere, however "automatic" the
// account looks: charging VAT where you are not registered would be illegal, so
// it never guesses.
const country = env('PQ_TAX_COUNTRY') || 'EE';
const wanted = OSS
  ? { type: 'oss_union' }
  : { type: 'standard', standard: { place_of_supply_scheme: 'small_seller' } };

const regs = await stripe.tax.registrations.list({ limit: 100 });
const live = regs.data.filter(
  (r) => r.country === country && r.status !== 'expired'
);
// The scheme has to match too, not just the type. `standard` taxes only
// domestic sales while `small_seller` applies the seller's rate across the EU —
// the entire point of this registration. Comparing `type` alone reported an
// existing domestic-only registration as already correct, certifying the exact
// misconfiguration this is here to fix.
const schemeOf = (r) =>
  r?.country_options?.[country.toLowerCase()]?.standard?.place_of_supply_scheme;
const already = live.find(
  (r) =>
    r.country_options?.[country.toLowerCase()]?.type === wanted.type &&
    schemeOf(r) === wanted.standard?.place_of_supply_scheme
);

if (already) {
  say('tax registration', 'SKIP', `${country} ${wanted.type} already active`);
} else if (live.length) {
  // Scheme changes are expire-then-create, not an update. Too consequential to
  // do unattended: crossing the threshold is a decision, not a config drift.
  say(
    'tax registration',
    'WARN',
    `${country} already registered as ` +
      live
        .map((r) => r.country_options?.[country.toLowerCase()]?.type)
        .join(', ') +
      `; wanted ${wanted.type}. Expire the old one in the Dashboard first.`
  );
} else if (DRY) {
  say('tax registration', 'DONE', `would create ${country} ${wanted.type}`);
} else {
  const created = await stripe.tax.registrations.create({
    country,
    country_options: { [country.toLowerCase()]: wanted },
    active_from: 'now',
  });
  say('tax registration', 'DONE', `${country} ${wanted.type} (${created.id})`);
}

// --- 3. prices left on tax_behavior: unspecified ----------------------------
// Only settable while unspecified — once it is inclusive or exclusive Stripe
// freezes it. Duplicates are reported, never archived: an archive on a price a
// live subscription still bills is not something to do unattended.
const prices = await stripe.prices.list({ active: true, limit: 100 });
const vague = prices.data.filter((p) => p.tax_behavior === 'unspecified');
if (!vague.length) {
  say('price tax_behavior', 'SKIP', 'no unspecified prices');
} else if (DRY) {
  say('price tax_behavior', 'DONE', `would set ${vague.length} to exclusive`);
} else {
  for (const p of vague) {
    await stripe.prices.update(p.id, { tax_behavior: 'exclusive' });
  }
  say('price tax_behavior', 'DONE', `${vague.length} set to exclusive`);
}

// Deliberately keyed WITHOUT the product: the duplication that actually bites is
// a second product holding the same amounts, because the code matches a price by
// amount + interval + tax_behavior and picks whichever it meets first.
const products = await stripe.products.list({ active: true, limit: 100 });
const nameOf = (id) => products.data.find((p) => p.id === id)?.name ?? id;
const byShape = new Map();
for (const p of prices.data) {
  const k = `${p.unit_amount}/${p.currency}/${p.recurring?.interval ?? 'once'}`;
  byShape.set(k, [...(byShape.get(k) ?? []), p]);
}
const dupes = [...byShape.entries()].filter(([, ps]) => ps.length > 1);
if (!dupes.length) {
  say('duplicate prices', 'SKIP', 'every amount appears once');
} else {
  say(
    'duplicate prices',
    'WARN',
    `${dupes.length} amount(s) exist on more than one product — archive the ` +
      `stray product in the Dashboard, this script will not guess which: ` +
      dupes
        .map(
          ([k, ps]) =>
            `${k} on [${ps
              .map((p) => nameOf(typeof p.product === 'string' ? p.product : p.product?.id))
              .join(' + ')}]`
        )
        .join(' | ')
  );
}

// --- 4. webhook endpoint ----------------------------------------------------
// Every entitlement in this app is granted by a webhook. No endpoint, no tier.
const EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.dispute.created',
  'charge.refunded',
];
const hookUrl = env('PQ_WEBHOOK_URL');
if (!hookUrl) {
  say(
    'webhook endpoint',
    'WARN',
    'PQ_WEBHOOK_URL not set. Locally use: stripe listen --forward-to localhost:3000/stripe'
  );
} else {
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  const mine = hooks.data.find((h) => h.url === hookUrl);
  if (mine) {
    const missing = EVENTS.filter((e) => !mine.enabled_events.includes(e));
    if (!missing.length) {
      say('webhook endpoint', 'SKIP', `${hookUrl} already carries every event`);
    } else if (DRY) {
      say('webhook endpoint', 'DONE', `would add ${missing.join(', ')}`);
    } else {
      // Union, not replacement. Sending EVENTS alone silently unsubscribed
      // anything else already on this endpoint while reporting that it had
      // "added" events.
      await stripe.webhookEndpoints.update(mine.id, {
        enabled_events: [...new Set([...mine.enabled_events, ...EVENTS])],
      });
      say('webhook endpoint', 'DONE', `added ${missing.join(', ')}`);
    }
  } else if (DRY) {
    say('webhook endpoint', 'DONE', `would create ${hookUrl}`);
  } else {
    const created = await stripe.webhookEndpoints.create({
      url: hookUrl,
      enabled_events: EVENTS,
    });
    say('webhook endpoint', 'DONE', `${hookUrl} created`);
    console.log(`\n    STRIPE_SIGNING_KEY="${created.secret}"\n`);
  }
}

// --- 5. billing portal policy links -----------------------------------------
const tos = env('PQ_TOS_URL');
const privacy = env('PQ_PRIVACY_URL');
if (!tos && !privacy) {
  say('portal policy links', 'WARN', 'PQ_TOS_URL / PQ_PRIVACY_URL not set');
} else {
  const configs = await stripe.billingPortal.configurations.list({ limit: 10 });
  const def = configs.data.find((c) => c.is_default) ?? configs.data[0];
  if (!def) {
    say('portal policy links', 'WARN', 'no portal configuration exists yet');
  } else {
    const bp = def.business_profile ?? {};
    const need =
      (tos && bp.terms_of_service_url !== tos) ||
      (privacy && bp.privacy_policy_url !== privacy);
    if (!need) {
      say('portal policy links', 'SKIP', 'already set');
    } else if (DRY) {
      say('portal policy links', 'DONE', 'would set tos/privacy');
    } else {
      await stripe.billingPortal.configurations.update(def.id, {
        business_profile: {
          ...(tos ? { terms_of_service_url: tos } : {}),
          ...(privacy ? { privacy_policy_url: privacy } : {}),
        },
      });
      say('portal policy links', 'DONE', 'set');
    }
  }
}

// --- what only a human can do -----------------------------------------------
console.log(`
Stripe keeps these out of the API. Do them in the Dashboard, per mode:

  Billing > Revenue recovery > Retries
      Smart Retries on, 8 attempts over 2 weeks, then "Cancel the subscription".
      Not a preference: this app treats past_due as entitled and only revokes on
      customer.subscription.deleted, which "mark unpaid" never sends. The retry
      window IS the grace period.
  Settings > Billing > Customer emails
      failed payment, card expiring, receipts, refunds, upcoming renewal.
  Settings > Public details
      business name, support email, support URL, website — Checkout's legal and
      contact links read from here.
  Settings > Invoice template
      footer and numbering.
`);

const failed = results.filter((r) => r.state === 'FAIL').length;
const warned = results.filter((r) => r.state === 'WARN').length;
console.log(
  `${DRY ? 'Dry run' : 'Done'} — ${results.filter((r) => r.state === 'DONE').length} changed, ` +
    `${results.filter((r) => r.state === 'SKIP').length} already correct, ${warned} needing attention.`
);
process.exit(failed ? 1 : 0);
