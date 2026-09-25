import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SubscriptionService } from './subscription.service.ts';
import { CREDIT_UNIT, planCredits, pricing } from './pricing.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const stripe = read('../../../services/stripe.service.ts');
const revenuecat = read('../../../services/payment/providers/revenuecat.provider.ts');
const register = read('../../../temporal/infinite.workflow.register.ts');
const orchestrator = '../../../../../../apps/orchestrator/src';
const workflow = read(`${orchestrator}/workflows/credit.grants.workflow.v1.ts`);
const workflowIndex = read(`${orchestrator}/workflows/index.ts`);
const orchestratorModule = read(`${orchestrator}/app.module.ts`);

// The ledger faked in memory, with just enough of its rules (refs are unique,
// `close` ends what is live from those sources) to follow the grant logic.
type Grant = {
  org?: string;
  source: string;
  amount: number;
  tier?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  externalRef?: string | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: number;
};
let grants: Grant[];
let clock: number;
const live = (grant: Grant) =>
  !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > new Date());

const currentGrants = async (org: string, sources: string[]) =>
  grants
    .filter((grant) => grant.org === org && sources.includes(grant.source) && live(grant))
    .sort((a, b) => b.createdAt - a.createdAt);
const write = (org: string, grant: Grant, close: string[] = []) => {
  if (grant.externalRef && grants.some((g) => g.externalRef === grant.externalRef)) {
    return { id: 'existing', granted: false };
  }
  for (const g of grants) {
    if (g.org === org && close.includes(g.source) && live(g)) {
      g.expiresAt = new Date();
    }
  }
  grants.push({ ...grant, org, createdAt: clock++ });
  return { id: `grant-${grants.length}`, granted: true };
};
const credits = {
  currentGrants,
  grant: async (org: string, grant: Grant, close: string[] = []) =>
    write(org, grant, close),
  grantWith: async (
    org: string,
    sources: string[],
    decide: (current: Grant[]) => { grant: Grant; close?: string[] } | null
  ) => {
    const decision = decide(await currentGrants(org, sources));
    return decision
      ? write(org, decision.grant, decision.close)
      : { id: null, granted: false };
  },
  revokeGrants: async () => ({ count: 0 }),
};

let codes: { code: string }[];
const service = () =>
  new SubscriptionService(
    { getCodesByOrgId: async () => codes } as any,
    {} as any,
    {} as any,
    credits as any
  );

const DAY = 24 * 60 * 60 * 1000;
// Fixed per test: a period's end is one instant (Stripe sends whole seconds),
// so two events for the same period must carry the same date.
let base: number;
const days = (n: number) => new Date(base + n * DAY);
const period = (
  tier: string,
  kind: 'MONTHLY' | 'YEARLY',
  from: number,
  to: number,
  ref: string,
  extra: { trial?: boolean; prorate?: boolean } = {}
) => ({ tier, period: kind, start: days(from), end: days(to), ref, ...extra });
const hundredths = (monthly: number) => monthly * CREDIT_UNIT;

const KEYS = ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  grants = [];
  codes = [];
  clock = 1;
  base = Math.floor(Date.now() / 1000) * 1000;
  for (const key of KEYS) process.env[key] = `${key}-spec`;
});

afterEach(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

describe('planCredits', () => {
  it('is the monthly amount, twelve for a year, one month for any trial', () => {
    assert.equal(planCredits('PRO', 'MONTHLY'), hundredths(pricing.PRO.monthly_credits));
    assert.equal(planCredits('PRO', 'YEARLY'), 12 * hundredths(pricing.PRO.monthly_credits));
    assert.equal(planCredits('PRO', 'YEARLY', true), hundredths(pricing.PRO.monthly_credits));
    assert.equal(planCredits('AGENCY', 'MONTHLY'), planCredits('ULTIMATE', 'MONTHLY'));
    assert.equal(planCredits('FREE', 'MONTHLY'), 0);
    assert.equal(planCredits(undefined, 'MONTHLY'), 0);
  });

  it('gives every paid tier, retired ones too, a monthly amount', () => {
    for (const [tier, plan] of Object.entries(pricing)) {
      if (tier === 'FREE') continue;
      assert.ok(plan.monthly_credits > 0, tier);
    }
    assert.equal(pricing.STANDARD.monthly_credits, pricing.CREATOR.monthly_credits);
    assert.equal(pricing.TEAM.monthly_credits, pricing.GROWTH.monthly_credits);
    assert.equal(pricing.LEGACY_ULTIMATE.monthly_credits, pricing.ULTIMATE.monthly_credits);
  });
});

describe('grantPlanPeriod', () => {
  it('gives a yearly trial one month, raised when the plan changes during it', async () => {
    const s = service();
    assert.equal(await s.grantPlanPeriod('org', period('CREATOR', 'YEARLY', 0, 7, 'sub_1', { trial: true })), true);
    assert.equal(grants[0].amount, planCredits('CREATOR', 'MONTHLY'));
    assert.equal(grants[0].source, 'trial');
    assert.ok(Math.abs(grants[0].expiresAt!.getTime() - days(7).getTime()) < 1000, 'ends with the trial');
    // the same trial event again adds nothing
    assert.equal(await s.grantPlanPeriod('org', period('CREATOR', 'YEARLY', 0, 7, 'sub_1', { trial: true })), false);
    // moved to Pro during the trial: raised to Pro's month, never lowered
    await s.grantPlanPeriod('org', period('PRO', 'YEARLY', 0, 7, 'sub_1', { trial: true }));
    assert.equal(grants.reduce((sum, g) => sum + g.amount, 0), planCredits('PRO', 'MONTHLY'));
    assert.equal(await s.grantPlanPeriod('org', period('CREATOR', 'YEARLY', 0, 7, 'sub_1', { trial: true })), false);
  });

  it('replaces the trial with the first paid period, a year of it for a yearly plan', async () => {
    const s = service();
    await s.grantPlanPeriod('org', period('PRO', 'YEARLY', -7, 0.5, 'sub_1', { trial: true }));
    assert.equal(await s.grantPlanPeriod('org', period('PRO', 'YEARLY', 0, 365, 'in_1')), true);
    const [trial, plan] = grants;
    assert.ok(trial.expiresAt! <= new Date(), 'the trial credits end');
    assert.equal(plan.amount, 12 * planCredits('PRO', 'MONTHLY'));
    assert.equal(plan.source, 'plan');
    assert.equal(plan.tier, 'PRO');
    const grace = (plan.expiresAt!.getTime() - days(365).getTime()) / DAY;
    assert.ok(grace > 2.9 && grace < 3.1, 'spendable three days past the period');
  });

  it('adds nothing for the same period twice, whatever event brings it', async () => {
    const s = service();
    await s.grantPlanPeriod('org', period('GROWTH', 'MONTHLY', -3, 27, 'in_1'));
    assert.equal(await s.grantPlanPeriod('org', period('GROWTH', 'MONTHLY', -3, 27, 'in_1')), false);
    assert.equal(await s.grantPlanPeriod('org', period('GROWTH', 'MONTHLY', -3, 27, 'in_other')), false);
    assert.equal(grants.length, 1);
  });

  it('tops an upgrade up by the difference for the time that is left', async () => {
    const s = service();
    await s.grantPlanPeriod('org', period('CREATOR', 'MONTHLY', -15, 15, 'in_1'));
    await s.grantPlanPeriod('org', period('PRO', 'MONTHLY', -15, 15, 'in_2'));
    const half = (planCredits('PRO', 'MONTHLY') - planCredits('CREATOR', 'MONTHLY')) / 2;
    assert.ok(Math.abs(grants[1].amount - half) <= 1, `${grants[1].amount} vs ${half}`);
    assert.equal(grants[1].tier, 'PRO');
    // a second upgrade in the same period is measured from Pro, not Creator
    await s.grantPlanPeriod('org', period('ULTIMATE', 'MONTHLY', -15, 15, 'in_3'));
    const second = (planCredits('ULTIMATE', 'MONTHLY') - planCredits('PRO', 'MONTHLY')) / 2;
    assert.ok(Math.abs(grants[2].amount - second) <= 1, `${grants[2].amount} vs ${second}`);
    // the first grant is still in force: an upgrade adds, it does not replace
    assert.ok(grants.every((g) => !g.expiresAt || g.expiresAt > new Date()));
  });

  it('starts a new period fresh: last month does not roll over', async () => {
    const s = service();
    await s.grantPlanPeriod('org', period('PRO', 'MONTHLY', -30, 0.2, 'in_1'));
    await s.grantPlanPeriod('org', period('PRO', 'MONTHLY', 0.2, 30, 'in_2'));
    assert.ok(grants[0].expiresAt! <= new Date());
    assert.equal(grants[1].amount, planCredits('PRO', 'MONTHLY'));
  });

  it('ignores a period older than the current one, and one already over', async () => {
    const s = service();
    await s.grantPlanPeriod('org', period('PRO', 'MONTHLY', 0, 30, 'in_2'));
    assert.equal(await s.grantPlanPeriod('org', period('PRO', 'MONTHLY', -30, 0.5, 'in_1')), false);
    assert.equal(await s.grantPlanPeriod('org', period('PRO', 'MONTHLY', -60, -30, 'in_0')), false);
    assert.equal(grants.length, 1);
    assert.ok(grants[0].expiresAt! > new Date());
  });

  it('gives a yearly plan already running only the months it has left', async () => {
    const s = service();
    await s.grantPlanPeriod('org', period('PRO', 'YEARLY', -230, 135, 'in_1', { prorate: true }));
    assert.equal(grants[0].amount, 5 * planCredits('PRO', 'MONTHLY'));
    // a monthly plan already running gets its month whole
    await s.grantPlanPeriod('org-2', period('GROWTH', 'MONTHLY', -20, 10, 'in_2', { prorate: true }));
    assert.equal(grants[1].amount, planCredits('GROWTH', 'MONTHLY'));
  });

  it('grants nothing for a plan with no credits', async () => {
    const s = service();
    assert.equal(await s.grantPlanPeriod('org', period('FREE', 'MONTHLY', 0, 30, 'x')), false);
    assert.equal(await s.grantPlanPeriod('org', period('NOPE', 'MONTHLY', 0, 30, 'y')), false);
    assert.equal(grants.length, 0);
  });
});

describe('Scheduled credits', () => {
  it('gives a plan no invoice renews its month, once, from the day it started', async () => {
    const s = service();
    const target = {
      organizationId: 'org',
      subscriptionTier: 'PRO',
      createdAt: new Date(Date.now() - 40 * DAY),
      organization: { createdAt: new Date(Date.now() - 40 * DAY) },
    };
    assert.equal(await s.grantScheduledPlanCredits(target), true);
    assert.equal(await s.grantScheduledPlanCredits(target), false);
    assert.equal(grants[0].amount, planCredits('PRO', 'MONTHLY'));
    assert.match(grants[0].externalRef!, /^plan:org:/);
    assert.ok(grants[0].periodStart! <= new Date() && grants[0].periodEnd! > new Date());
  });

  it('gives a founding member whose fee waits for the trial only trial credits', async () => {
    const s = service();
    codes = [{ code: 'lifetime-setup:cs_1' }];
    const signedUp = new Date(Date.now() - 2 * DAY);
    const target = {
      organizationId: 'founder',
      subscriptionTier: 'PRO',
      createdAt: signedUp,
      organization: { createdAt: signedUp },
    };
    assert.equal(await s.grantScheduledPlanCredits(target), true);
    assert.equal(grants[0].source, 'trial');
    assert.equal(grants[0].amount, planCredits('PRO', 'MONTHLY'));
    const ends = (grants[0].expiresAt!.getTime() - signedUp.getTime()) / DAY;
    assert.ok(Math.abs(ends - 7) < 0.01, `ends with the trial, ${ends} days in`);
    assert.equal(await s.grantScheduledPlanCredits(target), false);
    // the fee is paid: the next pass replaces them with the plan's month
    codes = [{ code: 'lifetime-setup:cs_1' }, { code: 'lifetime-charge:in_1' }];
    assert.equal(await s.grantScheduledPlanCredits(target), true);
    assert.equal(grants[1].source, 'plan');
    assert.ok(grants[0].expiresAt! <= new Date(), 'the trial credits end');
  });

  it('gives the gift once a calendar month, to a paid plan past its trial', async () => {
    const s = service();
    const target = {
      organizationId: 'org',
      subscriptionTier: 'CREATOR',
      isLifetime: false,
      organization: { isTrailing: false, createdAt: new Date(Date.now() - 90 * DAY) },
    };
    assert.equal(await s.grantMonthlyGift(target), true);
    assert.equal(await s.grantMonthlyGift(target), false);
    assert.equal(grants[0].source, 'gift');
    assert.equal(grants[0].amount, 5 * CREDIT_UNIT);
    const now = new Date();
    assert.equal(
      grants[0].expiresAt!.getTime(),
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    );
    // on trial, or on no plan, there is no gift; a Stripe trial started weeks
    // after signing up is still a trial
    assert.equal(
      await s.grantMonthlyGift({
        ...target,
        organizationId: 'trial-org',
        organization: { isTrailing: true, createdAt: new Date() },
      }),
      false
    );
    assert.equal(
      await s.grantMonthlyGift({
        ...target,
        organizationId: 'late-trial',
        organization: { isTrailing: true, createdAt: new Date(Date.now() - 30 * DAY) },
      }),
      false
    );
    assert.equal(await s.grantMonthlyGift({ ...target, organizationId: 'free', subscriptionTier: 'FREE' }), false);
  });
});

describe('Wiring', () => {
  it('grants from the paid invoice, before the purchase is tracked', () => {
    const handler = stripe.slice(
      stripe.indexOf('async paymentSucceeded('),
      stripe.indexOf('async paymentFailed(')
    );
    assert.ok(handler.indexOf('grantPeriodCredits') < handler.indexOf('this._trackService.track'));
    // ours, not a trial's $0 invoice, the customer linked before it is looked
    // up, and only for a plan Stripe owns
    assert.match(handler, /subscription\.metadata\?\.service === SUBSCRIPTION_SERVICE_TAG &&\n\s+subscription\.status !== 'trialing'/);
    assert.ok(handler.indexOf('adoptSubscriptionCustomer') < handler.indexOf('getOrgByCustomerId'));
    assert.match(handler, /isManagedBy\(\s*customer,\s*STRIPE_PROVIDER\s*\)/);
  });

  it('grants a trial from the subscription events, for the plan just written', () => {
    assert.equal((stripe.match(/await this\.grantTrialCredits\(event\.data\.object, saved\);/g) || []).length, 2);
    assert.match(stripe, /if \(subscription\.status !== 'trialing' \|\| !saved\?\.organizationId\) \{/);
    const repository = read('./subscription.repository.ts');
    assert.match(repository, /return \{ organizationId: findOrg\.id \};/);
  });

  it('keys a running plan by its period, not by an invoice that may be unpaid', () => {
    assert.match(stripe, /`period:\$\{subscription\.id\}:\$\{subscription\.items\.data\[0\]\?\.current_period_start\}`/);
  });

  it('asks the provider that owns each plan, then gives the gift', () => {
    const payment = read('../../../services/payment/payment.service.ts');
    const providers = read('../../../services/payment/payment.provider.interface.ts');
    assert.match(payment, /\.getProvider\(target\.provider\)\n\s+\.grantMissingPlanCredits\(target\)/);
    assert.match(providers, /async grantMissingPlanCredits\(target: CreditGrantTarget\): Promise<boolean> \{\n\s+return false;/);
    assert.match(stripe, /override async grantMissingPlanCredits\(target: CreditGrantTarget\)/);
  });

  it('takes a plan credits back with the plan', () => {
    const subscription = read('./subscription.service.ts');
    assert.equal((subscription.match(/await this\.revokePlanCredits\(/g) || []).length, 3);
    assert.match(subscription, /revokeGrants\(organizationId, \[\n\s+'plan',\n\s+'trial',\n\s+'gift',\n\s+\]\)/);
  });

  it('grants a store period once per purchase, and a store trial once', () => {
    assert.match(revenuecat, /ref: trial\n\s+\? `rc:\$\{organizationId\}`\n\s+: `rc:\$\{active\.productId\}:\$\{active\.subscription\.purchase_date\}`/);
    assert.match(revenuecat, /saved &&\n\s+'organizationId' in saved &&/);
  });

  it('runs the daily pass as its own workflow, started with the other crons', () => {
    assert.match(register, /workflow\?\.start\('creditGrantsWorkflowV1', \{\n\s+workflowId: 'credit-grants-v1',/);
    assert.match(workflowIndex, /export \* from '\.\/credit\.grants\.workflow\.v1';/);
    assert.match(orchestratorModule, /\n\s+CreditGrantsActivity,\n/);
    // a value import would pull Nest into the workflow bundle
    assert.match(workflow, /import type \{ CreditGrantsActivity \}/);
  });
});
