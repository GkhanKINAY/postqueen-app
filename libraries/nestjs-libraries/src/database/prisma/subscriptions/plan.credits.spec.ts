import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SubscriptionService } from './subscription.service.ts';
import { PaymentService } from '../../../services/payment/payment.service.ts';
import {
  CREDIT_UNIT,
  monthlyCredits,
  PLAN_MONTHLY_CREDITS,
  planCredits as planCreditsOn,
  pricing,
} from './pricing.ts';

// Every grant below is on the list subscriptions sold before v2 keep, unless
// a test says otherwise.
const planCredits = (
  tier: string | undefined,
  period: 'MONTHLY' | 'YEARLY',
  trial?: boolean
) => planCreditsOn('legacy', tier, period, trial);

// The backend and the orchestrator pin it (see their main.ts); months are
// counted in it.
process.env.TZ = 'UTC';

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
  revokeGrants: async (org: string, sources: string[]) => {
    for (const grant of grants) {
      if (grant.org === org && sources.includes(grant.source) && live(grant)) {
        grant.revokedAt = new Date();
      }
    }
    return { count: 0 };
  },
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
  extra: {
    trial?: boolean;
    prorate?: boolean;
    creditPricing?: 'legacy' | 'v2';
  } = {}
) => ({
  creditPricing: 'legacy' as const,
  tier,
  period: kind,
  start: days(from),
  end: days(to),
  ref,
  ...extra,
});
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
    for (const cp of ['legacy', 'v2'] as const) {
      const pro = hundredths(monthlyCredits(cp, 'PRO'));
      assert.equal(planCreditsOn(cp, 'PRO', 'MONTHLY'), pro);
      assert.equal(planCreditsOn(cp, 'PRO', 'YEARLY'), 12 * pro);
      assert.equal(planCreditsOn(cp, 'PRO', 'YEARLY', true), pro);
      assert.equal(
        planCreditsOn(cp, 'AGENCY', 'MONTHLY'),
        planCreditsOn(cp, 'ULTIMATE', 'MONTHLY')
      );
      assert.equal(planCreditsOn(cp, 'FREE', 'MONTHLY'), 0);
      assert.equal(planCreditsOn(cp, undefined, 'MONTHLY'), 0);
    }
  });

  it('keeps what was sold before v2, and gives v2 its own ladder', () => {
    assert.deepEqual(
      ['CREATOR', 'GROWTH', 'PRO', 'ULTIMATE'].map((t) =>
        monthlyCredits('legacy', t)
      ),
      [150, 300, 500, 1000]
    );
    assert.deepEqual(
      ['CREATOR', 'GROWTH', 'PRO', 'ULTIMATE'].map((t) =>
        monthlyCredits('v2', t)
      ),
      [60, 200, 600, 1200]
    );
  });

  it('gives every paid tier, retired ones too, a monthly amount on each list', () => {
    for (const cp of ['legacy', 'v2'] as const) {
      for (const [tier, plan] of Object.entries(pricing)) {
        if (tier === 'FREE') continue;
        assert.ok(monthlyCredits(cp, tier) > 0, `${cp} ${tier} ${plan.label}`);
      }
      const list = PLAN_MONTHLY_CREDITS[cp];
      assert.equal(list.STANDARD, list.CREATOR);
      assert.equal(list.TEAM, list.GROWTH);
      assert.equal(list.LEGACY_ULTIMATE, list.ULTIMATE);
    }
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

  it("gives a subscription sold on v2 its list's month, and tops it up on that list", async () => {
    const s = service();
    await s.grantPlanPeriod(
      'org',
      period('CREATOR', 'MONTHLY', -15, 15, 'in_1', { creditPricing: 'v2' })
    );
    assert.equal(grants[0].amount, planCreditsOn('v2', 'CREATOR', 'MONTHLY'));
    assert.equal(grants[0].amount, 60 * CREDIT_UNIT);
    await s.grantPlanPeriod(
      'org',
      period('PRO', 'MONTHLY', -15, 15, 'in_2', { creditPricing: 'v2' })
    );
    const half =
      (planCreditsOn('v2', 'PRO', 'MONTHLY') -
        planCreditsOn('v2', 'CREATOR', 'MONTHLY')) /
      2;
    assert.ok(Math.abs(grants[1].amount - half) <= 1, String(grants[1].amount));
  });

  it('grants nothing for a plan with no credits', async () => {
    const s = service();
    assert.equal(await s.grantPlanPeriod('org', period('FREE', 'MONTHLY', 0, 30, 'x')), false);
    assert.equal(await s.grantPlanPeriod('org', period('NOPE', 'MONTHLY', 0, 30, 'y')), false);
    assert.equal(grants.length, 0);
  });
});

describe('A yearly plan a month at a time', () => {
  // Server time, faked: every grant reads the clock.
  const at = (iso: string) => mock.timers.setTime(new Date(iso).getTime());
  beforeEach(() =>
    mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-31T12:01:00Z') })
  );
  afterEach(() => mock.timers.reset());

  // A year that starts on the 31st, so its months are of every length.
  const YEAR = {
    start: new Date('2027-01-31T12:00:00Z'),
    end: new Date('2028-01-31T12:00:00Z'),
  };
  const monthOf = (
    s: SubscriptionService,
    tier: string,
    ref: string,
    extra: { prorate?: boolean } = {}
  ) => ({
    creditPricing: 'legacy' as const,
    tier,
    period: 'YEARLY' as const,
    ...YEAR,
    ref,
    month: s.periodMonth(YEAR.start, YEAR.end),
    ...extra,
  });
  const inForce = () => grants.filter(live);

  it('counts its months from the day the year started, as Stripe does, and ends with the year', () => {
    const s = service();
    at('2027-02-10T00:00:00Z');
    assert.deepEqual(s.periodMonth(YEAR.start, YEAR.end), {
      start: new Date('2027-01-31T12:00:00Z'),
      end: new Date('2027-02-28T12:00:00Z'),
    });
    // back on the 31st after February, not stuck on the 28th
    at('2027-03-05T00:00:00Z');
    assert.deepEqual(s.periodMonth(YEAR.start, YEAR.end), {
      start: new Date('2027-02-28T12:00:00Z'),
      end: new Date('2027-03-31T12:00:00Z'),
    });
    at('2028-01-20T00:00:00Z');
    assert.deepEqual(s.periodMonth(YEAR.start, YEAR.end), {
      start: new Date('2027-12-31T12:00:00Z'),
      end: YEAR.end,
    });
    // a period that ends inside a month ends that month with it
    at('2027-03-05T00:00:00Z');
    assert.deepEqual(
      s.periodMonth(YEAR.start, new Date('2027-03-15T12:00:00Z')).end,
      new Date('2027-03-15T12:00:00Z')
    );
  });

  it('grants a month, not the rest of the year, even for a plan already running', async () => {
    const s = service();
    assert.equal(await s.grantPlanPeriod('org', monthOf(s, 'PRO', 'in_1')), true);
    assert.equal(grants[0].amount, planCredits('PRO', 'MONTHLY'));
    assert.deepEqual(grants[0].periodEnd, new Date('2027-02-28T12:00:00Z'));
    // the daily pass in the same month adds nothing
    assert.equal(
      await s.grantPlanPeriod('org', monthOf(s, 'PRO', 'period:sub_1:a', { prorate: true })),
      false
    );
    at('2027-06-01T00:00:00Z');
    assert.equal(
      await s.grantPlanPeriod('org', monthOf(s, 'PRO', 'period:sub_1:b', { prorate: true })),
      true
    );
    assert.equal(grants[1].amount, planCredits('PRO', 'MONTHLY'));
    assert.deepEqual(grants[1].periodStart, new Date('2027-05-31T12:00:00Z'));
    // last month's credits do not roll over
    assert.deepEqual(inForce(), [grants[1]]);
  });

  it('tops an upgrade in the middle of a month up by that month only', async () => {
    const s = service();
    at('2027-03-01T00:00:00Z');
    await s.grantPlanPeriod('org', monthOf(s, 'CREATOR', 'period:sub_1:a'));
    // 16 of the month's 31 days left
    at('2027-03-15T12:00:00Z');
    assert.equal(await s.grantPlanPeriod('org', monthOf(s, 'PRO', 'in_2')), true);
    const left =
      (planCredits('PRO', 'MONTHLY') - planCredits('CREATOR', 'MONTHLY')) * (16 / 31);
    assert.ok(Math.abs(grants[1].amount - left) <= 1, `${grants[1].amount} vs ${left}`);
    assert.equal(grants[1].tier, 'PRO');
    assert.deepEqual(grants[1].periodEnd, new Date('2027-03-31T12:00:00Z'));
    // the next month is the new plan's, whole
    at('2027-04-01T00:00:00Z');
    await s.grantPlanPeriod('org', monthOf(s, 'PRO', 'period:sub_1:b'));
    assert.equal(grants[2].amount, planCredits('PRO', 'MONTHLY'));
  });

  it('leaves a year granted whole in force, and tops an upgrade on it up as before', async () => {
    const s = service();
    // granted up front, before the plan moved to monthly credits
    await s.grantPlanPeriod('org', { creditPricing: 'legacy', tier: 'CREATOR', period: 'YEARLY', ...YEAR, ref: 'in_1' });
    assert.equal(grants[0].amount, planCredits('CREATOR', 'YEARLY'));
    at('2027-07-31T12:00:00Z');
    // no month on top of it
    assert.equal(
      await s.grantPlanPeriod('org', monthOf(s, 'CREATOR', 'period:sub_1:a', { prorate: true })),
      false
    );
    assert.equal(grants.length, 1);
    // an upgrade halfway through tops the year up, as it always did
    assert.equal(await s.grantPlanPeriod('org', monthOf(s, 'PRO', 'in_2')), true);
    const left =
      (planCredits('PRO', 'YEARLY') - planCredits('CREATOR', 'YEARLY')) *
      ((YEAR.end.getTime() - Date.now()) / (YEAR.end.getTime() - YEAR.start.getTime()));
    assert.ok(Math.abs(grants[1].amount - left) <= 1, `${grants[1].amount} vs ${left}`);
    assert.deepEqual(grants[1].periodEnd, YEAR.end);
    assert.equal(inForce().length, 2);
  });

  it('replaces a trial with the first month when it converts', async () => {
    const s = service();
    at('2027-01-25T12:00:00Z');
    await s.grantPlanPeriod('org', {
      creditPricing: 'legacy',
      tier: 'PRO',
      period: 'YEARLY',
      start: new Date('2027-01-24T12:00:00Z'),
      end: YEAR.start,
      ref: 'sub_1',
      trial: true,
    });
    assert.equal(grants[0].amount, planCredits('PRO', 'MONTHLY'));
    at('2027-01-31T12:05:00Z');
    assert.equal(await s.grantPlanPeriod('org', monthOf(s, 'PRO', 'in_1')), true);
    assert.equal(grants[1].source, 'plan');
    assert.equal(grants[1].amount, planCredits('PRO', 'MONTHLY'));
    assert.deepEqual(inForce(), [grants[1]]);
  });

  it('takes the months back when the plan is refunded or ends', async () => {
    const ending = new SubscriptionService(
      {
        getCodesByOrgId: async () => codes,
        getSubscriptionByOrganizationId: async () => ({ subscriptionTier: 'PRO' }),
        getSubscriptionByOrgId: async () => ({ subscriptionTier: 'PRO' }),
        getSubscriptionByCustomerId: async () => ({
          provider: 'stripe',
          subscriptionTier: 'PRO',
          isLifetime: false,
        }),
        getOrganizationByCustomerId: async () => ({ id: 'org' }),
        recordSubscriptionEndedByOrganizationId: async () => ({}),
        recordSubscriptionEndedByCustomerId: async () => ({}),
        deleteSubscriptionByOrganizationId: async () => ({ count: 1 }),
        deleteSubscriptionByCustomerId: async () => ({ count: 1 }),
      } as any,
      { getIntegrationsList: async () => [], changeActiveCron: async () => ({}) } as any,
      { disableOrEnableNonSuperAdminUsers: async () => ({}) } as any,
      credits as any
    );
    // a refund ends the plan here
    await ending.grantPlanPeriod('org', monthOf(ending, 'PRO', 'in_1'));
    await ending.revokeLocalSubscription('org');
    assert.equal(inForce().length, 0);
    // and Stripe ending the subscription here
    at('2027-03-05T00:00:00Z');
    await ending.grantPlanPeriod('org', monthOf(ending, 'PRO', 'period:sub_1:b'));
    assert.equal(inForce().length, 1);
    await ending.deleteSubscription('cus_1', 'stripe');
    assert.equal(inForce().length, 0);
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

describe('The daily pass', () => {
  const run = async (targets: any[], overdue: string[] = []) => {
    const calls: string[] = [];
    const payments = new PaymentService(
      {
        getProviders: () => [
          {
            name: 'stripe',
            provider: {
              grantMissingPlanCredits: async (t: any) => {
                calls.push(`stripe:${t.organizationId}`);
                return true;
              },
            },
          },
        ],
      } as any,
      {
        getCreditGrantTargets: async () => targets,
        isFoundingFeeOverdue: async (id: string) => overdue.includes(id),
        grantScheduledPlanCredits: async (t: any) => {
          calls.push(`scheduled:${t.organizationId}`);
          return true;
        },
        grantMonthlyGift: async (t: any) => {
          calls.push(`gift:${t.organizationId}`);
          return true;
        },
      } as any
    );
    return { result: await payments.grantScheduledCredits(), calls };
  };

  it('asks the provider that sells a plan, and grants a plan no provider sells by the month', async () => {
    const { result, calls } = await run([
      { organizationId: 'a', provider: 'stripe' },
      // production's hand-set plans: no provider is registered as "manual"
      { organizationId: 'b', provider: 'manual' },
    ]);
    assert.deepEqual(calls, ['stripe:a', 'gift:a', 'scheduled:b', 'gift:b']);
    assert.deepEqual(result, { checked: 2, granted: 4, failed: 0 });
  });

  it('skips a founding member whose fee is overdue, and does nothing with billing off', async () => {
    const skipped = await run([{ organizationId: 'late', provider: 'manual' }], ['late']);
    assert.deepEqual(skipped.calls, []);
    delete process.env.STRIPE_SECRET_KEY;
    const off = await run([{ organizationId: 'a', provider: 'stripe' }]);
    assert.deepEqual(off.calls, []);
    assert.equal(off.result.checked, 0);
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

  it('keys a running plan by its period, or its month, not by an invoice that may be unpaid', () => {
    assert.match(stripe, /invoice \|\|\n\s+`period:\$\{subscription\.id\}:\$\{\n\s+month \? month\.start\.toISOString\(\) : item\.current_period_start\n\s+\}`,\n\s+prorate: !invoice,/);
    // the daily pass passes no invoice, the paid invoice its own id
    assert.match(stripe, /return this\.grantPeriodCredits\(target\.organizationId, subscription\);/);
  });

  it('asks the provider that owns each plan, then gives the gift', () => {
    const payment = read('../../../services/payment/payment.service.ts');
    const providers = read('../../../services/payment/payment.provider.interface.ts');
    // Looked up without throwing: an unregistered provider is not an error here.
    assert.match(payment, /\.getProviders\(\)\n\s+\.find\(\(p\) => p\.name === target\.provider\)\?\.provider;/);
    assert.match(payment, /\? await provider\.grantMissingPlanCredits\(target\)\n\s+: await this\._subscriptionService\.grantScheduledPlanCredits\(target\)/);
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
