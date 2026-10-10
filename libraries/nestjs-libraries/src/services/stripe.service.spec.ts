import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import Stripe from 'stripe';
import type { StripeService as StripeServiceType } from './stripe.service.ts';
import { pricing } from '../database/prisma/subscriptions/pricing.ts';

// Every Stripe call below is faked, and the resources no test uses throw. The
// service builds its client from the environment when it is loaded, so the
// key is replaced first, whatever the environment holds: no real key, live or
// test, is ever in the client. That is also what turns billing on for the
// checks that ask (`isBillingEnabled`).
process.env.STRIPE_SECRET_KEY = 'sk_test_unit_never_valid';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_unit_never_valid';
let StripeService: typeof StripeServiceType;
before(async () => {
  ({ StripeService } = await import('./stripe.service.ts'));
});

// The SDK keeps its methods on each resource's prototype, shared by every
// client, so faking them here fakes them for the service's own client too.
const probe = new Stripe('sk_test_unit_never_valid');
const fake = (resource: object, methods: Record<string, unknown>) =>
  Object.assign(Object.getPrototypeOf(resource), methods);

type Sub = Partial<Stripe.Subscription> & { id: string; created: number };

let subs: Sub[];
let calls: { method: string; args: unknown[] }[];
let invoices: Partial<Stripe.Invoice>[];
let prices: Partial<Stripe.Price>[];

const record =
  (method: string, answer: (...args: any[]) => unknown) =>
  async (...args: any[]) => {
    calls.push({ method, args });
    return answer(...args);
  };
const called = (method: string) =>
  calls.filter((c) => c.method === method).map((c) => c.args);

const proPrice = {
  id: 'price_pro_month',
  product: { name: 'PRO' },
  recurring: { interval: 'month' },
} as unknown as Stripe.Price;
const growthYear = {
  id: 'price_growth_year',
  product: { name: 'GROWTH' },
  recurring: { interval: 'year' },
} as unknown as Stripe.Price;

const sub = (id: string, created: number, extra: Partial<Sub> = {}): Sub => ({
  id,
  created,
  status: 'active',
  customer: 'cus_1',
  metadata: { uniqueId: `u-${id}` },
  items: { data: [{ price: proPrice }] } as any,
  cancel_at: null,
  cancel_at_period_end: false,
  schedule: null,
  latest_invoice: { status: 'paid' } as any,
  ...extra,
});

fake(probe.subscriptions, {
  list: record('subscriptions.list', ({ customer }) => ({
    data: subs
      .filter((s) => s.customer === customer)
      .sort((a, b) => b.created - a.created),
  })),
  retrieve: record('subscriptions.retrieve', (id) =>
    subs.find((s) => s.id === id),
  ),
  cancel: record('subscriptions.cancel', (id) => {
    const found = subs.find((s) => s.id === id)!;
    found.status = 'canceled';
    return found;
  }),
  update: record('subscriptions.update', (id, body) => {
    const found = subs.find((s) => s.id === id)!;
    found.cancel_at_period_end = body.cancel_at_period_end;
    found.cancel_at = body.cancel_at_period_end
      ? 1_000_000 + found.created
      : null;
    return found;
  }),
});
fake(probe.subscriptionSchedules, {
  release: record('subscriptionSchedules.release', () => ({})),
});
fake(probe.invoices, {
  list: record('invoices.list', ({ customer, subscription }) => ({
    data: subscription ? [] : invoices.filter((i) => i.customer === customer),
  })),
});
fake(probe.subscriptions, {
  search: record('subscriptions.search', ({ query }) => ({
    data: subs.filter((s) => query.includes(`'${s.metadata?.uniqueId}'`)),
  })),
});
fake(probe.prices, {
  retrieve: record('prices.retrieve', (id) =>
    prices.find((price) => price.id === id),
  ),
});
const refuse = () => {
  throw new Error('This test reached a Stripe call it did not fake');
};
for (const resource of [
  probe.customers,
  probe.products,
  probe.checkout.sessions,
  probe.paymentMethods,
  probe.charges,
]) {
  fake(resource, {
    create: refuse,
    list: refuse,
    retrieve: refuse,
    update: refuse,
  });
}

let localSub: Record<string, unknown> | null;
// The organization's own Subscription row, which `subscribe` reads to tell a
// plan change from a first checkout.
let localPlan: Record<string, unknown> | null;
let failCancelAt: boolean;
// The organization's Stripe customer, moved by `updateCustomerId`.
let orgCustomer: string;
const orgOn = (customer: string) =>
  customer === orgCustomer ? { id: 'org1' } : null;
const subscriptionService = {
  createOrUpdateSubscription: record('createOrUpdateSubscription', () => ({})),
  deleteSubscription: record('deleteSubscription', () => ({ count: 1 })),
  updateCancelAt: record('updateCancelAt', () => {
    if (failCancelAt) {
      throw new Error('database is down');
    }
    return { count: 1 };
  }),
  getSubscriptionByOrganizationId: async () => localSub,
  getSubscription: async () => localPlan,
  checkSubscription: async () => null,
  getOrganizationByCustomerId: async (customer: string) => orgOn(customer),
  updateCustomerId: record('updateCustomerId', (_org, customer) => {
    orgCustomer = customer;
  }),
};
const organizationService = {
  getOrgById: async () => ({
    id: 'org1',
    paymentId: orgCustomer,
    isTrailing: false,
  }),
  getOrgByCustomerId: async (customer: string) => orgOn(customer),
  withdrawTrial: record('withdrawTrial', () => ({})),
};

const service = () =>
  new StripeService(
    subscriptionService as any,
    organizationService as any,
    { getUserById: async () => ({ email: 'a@b.co' }) } as any,
    {} as any,
    { inAppNotification: async () => ({}) } as any,
  );

const created = (id: string) =>
  ({
    id: `evt_${id}`,
    type: 'customer.subscription.created',
    data: { object: { id, customer: 'cus_1' } },
  }) as unknown as Stripe.CustomerSubscriptionCreatedEvent;

const deleted = (id: string) =>
  ({
    id: `evt_del_${id}`,
    type: 'customer.subscription.deleted',
    data: { object: { id, customer: 'cus_1', cancellation_details: {} } },
  }) as unknown as Stripe.CustomerSubscriptionDeletedEvent;

beforeEach(() => {
  subs = [];
  calls = [];
  invoices = [];
  prices = [];
  localSub = { isLifetime: false };
  localPlan = null;
  failCancelAt = false;
  orgCustomer = 'cus_1';
});

describe('a second subscription on one customer', () => {
  it('is cancelled when it is created, and nothing is granted', async () => {
    subs = [sub('sub_old', 100), sub('sub_new', 200)];
    const result = await service().createSubscription(created('sub_new'));

    assert.deepEqual(result, {
      ok: true,
      granted: false,
      reason: 'duplicate subscription',
    });
    assert.deepEqual(called('subscriptions.cancel'), [
      [
        'sub_new',
        { cancellation_details: { comment: 'duplicate-subscription' } },
      ],
    ]);
    assert.equal(called('createOrUpdateSubscription').length, 0);
  });

  it('is cancelled when a second first checkout made a second customer', async () => {
    subs = [
      sub('sub_old', 100),
      sub('sub_new', 200, {
        customer: 'cus_2',
        metadata: { uniqueId: 'u-sub_new', organizationId: 'org1' },
      }),
    ];
    const result = await service().createSubscription({
      ...created('sub_new'),
      data: { object: { id: 'sub_new', customer: 'cus_2' } },
    } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

    assert.equal(
      (result as { reason: string }).reason,
      'duplicate subscription',
    );
    assert.equal(called('subscriptions.cancel')[0][0], 'sub_new');
    assert.equal(called('createOrUpdateSubscription').length, 0);
  });

  it('cancels the newer one there when this one, on a second customer, is older', async () => {
    subs = [
      sub('sub_first_seen', 200),
      sub('sub_older', 100, {
        customer: 'cus_2',
        metadata: { uniqueId: 'u-sub_older', organizationId: 'org1' },
      }),
    ];
    const result = await service().createSubscription({
      ...created('sub_older'),
      data: { object: { id: 'sub_older', customer: 'cus_2' } },
    } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

    assert.equal(called('subscriptions.cancel')[0][0], 'sub_first_seen');
    assert.notEqual(
      (result as { reason?: string }).reason,
      'duplicate subscription',
    );
    assert.equal(called('createOrUpdateSubscription').length, 1);
  });

  it('moves the organization before cancelling, so the deleted event cannot drop the plan', async () => {
    subs = [
      sub('sub_first_seen', 200),
      sub('sub_older', 100, {
        customer: 'cus_2',
        metadata: { uniqueId: 'u-sub_older', organizationId: 'org1' },
      }),
    ];
    await service().createSubscription({
      ...created('sub_older'),
      data: { object: { id: 'sub_older', customer: 'cus_2' } },
    } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

    const order = calls.map((c) => c.method);
    assert.ok(
      order.indexOf('updateCustomerId') < order.indexOf('subscriptions.cancel'),
    );
    assert.equal(orgCustomer, 'cus_2');

    // The cancelled one's `deleted`, keyed by its customer, which no
    // organization holds any more.
    calls = [];
    await service().deleteSubscription(deleted('sub_first_seen'));
    assert.deepEqual(called('deleteSubscription'), [['cus_1', 'stripe']]);
    assert.equal(orgOn('cus_1'), null);
  });

  it('leaves the newer trial alone when the older trial is refused for its card', async () => {
    localSub = null;
    subs = [
      sub('sub_trial_granted', 200, { status: 'trialing' }),
      sub('sub_trial', 100, {
        customer: 'cus_2',
        status: 'trialing',
        default_payment_method: 'pm_prepaid',
        metadata: { uniqueId: 'u-sub_trial', organizationId: 'org1' },
      }),
    ];
    const methods = Object.getPrototypeOf(probe.paymentMethods);
    const original = methods.retrieve;
    methods.retrieve = async () => ({ card: { funding: 'prepaid' } });
    try {
      const result = await service().createSubscription({
        ...created('sub_trial'),
        data: { object: { id: 'sub_trial', customer: 'cus_2' } },
      } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

      assert.equal((result as { reason: string }).reason, 'trial card refused');
    } finally {
      methods.retrieve = original;
    }
    assert.deepEqual(
      called('subscriptions.cancel').map(([id]) => id),
      ['sub_trial'],
    );
    assert.equal(called('updateCustomerId').length, 0);
    assert.equal(orgCustomer, 'cus_1');
  });

  it('leaves the paying one alone when the older one is still incomplete', async () => {
    subs = [
      sub('sub_paying', 200),
      sub('sub_waiting', 100, {
        customer: 'cus_2',
        status: 'incomplete',
        metadata: { uniqueId: 'u-sub_waiting', organizationId: 'org1' },
      }),
    ];
    const result = await service().createSubscription({
      ...created('sub_waiting'),
      data: { object: { id: 'sub_waiting', customer: 'cus_2' } },
    } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

    // The checkout that never paid is the one that goes.
    assert.equal(
      (result as { reason: string }).reason,
      'duplicate subscription',
    );
    assert.deepEqual(
      called('subscriptions.cancel').map(([id]) => id),
      ['sub_waiting'],
    );
    assert.equal(called('updateCustomerId').length, 0);
  });

  it('leaves the paying one alone when a late retry finds the older one cancelled', async () => {
    subs = [
      sub('sub_paying', 200),
      sub('sub_gone', 100, {
        customer: 'cus_2',
        status: 'canceled',
        metadata: { uniqueId: 'u-sub_gone', organizationId: 'org1' },
      }),
    ];
    await service().createSubscription({
      ...created('sub_gone'),
      data: { object: { id: 'sub_gone', customer: 'cus_2' } },
    } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

    assert.equal(called('subscriptions.cancel').length, 0);
    assert.equal(called('createOrUpdateSubscription').length, 0);
  });

  it('reports a cancelled duplicate on a second customer as done', async () => {
    subs = [
      sub('sub_old', 100),
      sub('sub_new', 200, {
        customer: 'cus_2',
        status: 'canceled',
        canceled_at: 300,
        cancellation_details: { comment: 'duplicate-subscription' } as any,
        metadata: { uniqueId: 'u-sub_new', organizationId: 'org1' },
      }),
    ];
    assert.equal(await service().checkSubscription('org1', 'u-sub_new'), 2);
  });

  it('is not cancelled twice when the event is retried', async () => {
    subs = [sub('sub_old', 100), sub('sub_new', 200, { status: 'canceled' })];
    const result = await service().createSubscription(created('sub_new'));

    assert.equal(
      (result as { reason: string }).reason,
      'duplicate subscription',
    );
    assert.equal(called('subscriptions.cancel').length, 0);
  });

  it('keeps the older one, even when its event comes last', async () => {
    subs = [sub('sub_old', 100), sub('sub_new', 200)];
    await service().createSubscription(created('sub_old'));

    assert.deepEqual(
      called('subscriptions.cancel').map(([id]) => id),
      ['sub_new'],
    );
    assert.equal(called('createOrUpdateSubscription')[0][5], 'PRO');
  });

  it('does not count an incomplete checkout as the older one', async () => {
    subs = [
      sub('sub_abandoned', 100, { status: 'incomplete' }),
      sub('sub_new', 200),
    ];
    await service().createSubscription(created('sub_new'));

    assert.equal(called('subscriptions.cancel').length, 0);
    assert.equal(called('createOrUpdateSubscription').length, 1);
  });

  it('still answers 2xx when the cancel itself fails', async () => {
    subs = [sub('sub_old', 100), sub('sub_new', 200)];
    const original = Object.getPrototypeOf(probe.subscriptions).cancel;
    Object.getPrototypeOf(probe.subscriptions).cancel = async () => {
      throw new Error('Stripe is down');
    };
    try {
      const result = await service().createSubscription(created('sub_new'));
      assert.equal(
        (result as { reason: string }).reason,
        'duplicate subscription',
      );
      assert.equal(called('createOrUpdateSubscription').length, 0);
    } finally {
      Object.getPrototypeOf(probe.subscriptions).cancel = original;
    }
  });

  it('reports the checkout of a cancelled duplicate as done', async () => {
    subs = [
      sub('sub_old', 100),
      sub('sub_new', 200, {
        status: 'canceled',
        canceled_at: 300,
        cancellation_details: { comment: 'duplicate-subscription' } as any,
      }),
    ];
    assert.equal(await service().checkSubscription('org1', 'u-sub_new'), 2);
  });
});

describe('a paid subscription next to a trial', () => {
  it('replaces an older trial on the same customer', async () => {
    subs = [
      sub('sub_trial', 100, { status: 'trialing' }),
      sub('sub_paid', 200),
    ];
    const result = await service().createSubscription(created('sub_paid'));

    assert.notEqual(
      (result as { reason?: string }).reason,
      'duplicate subscription',
    );
    assert.deepEqual(called('subscriptions.cancel'), [
      [
        'sub_trial',
        { cancellation_details: { comment: 'duplicate-subscription' } },
      ],
    ]);
    assert.equal(called('createOrUpdateSubscription')[0][5], 'PRO');
  });

  it('replaces an older trial on another customer, moving the organization first', async () => {
    subs = [
      sub('sub_trial', 100, { status: 'trialing' }),
      sub('sub_paid', 200, {
        customer: 'cus_2',
        metadata: { uniqueId: 'u-sub_paid', organizationId: 'org1' },
      }),
    ];
    await service().createSubscription({
      ...created('sub_paid'),
      data: { object: { id: 'sub_paid', customer: 'cus_2' } },
    } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

    const order = calls.map((c) => c.method);
    assert.ok(
      order.indexOf('updateCustomerId') < order.indexOf('subscriptions.cancel'),
    );
    assert.equal(called('subscriptions.cancel')[0][0], 'sub_trial');
    assert.equal(orgCustomer, 'cus_2');
    assert.equal(called('createOrUpdateSubscription').length, 1);
  });

  it('is kept when a newer trial arrives, and the trial is cancelled', async () => {
    subs = [
      sub('sub_paid', 100),
      sub('sub_trial', 200, { status: 'trialing' }),
    ];
    const result = await service().createSubscription(created('sub_trial'));

    assert.equal(
      (result as { reason: string }).reason,
      'duplicate subscription',
    );
    assert.equal(called('subscriptions.cancel')[0][0], 'sub_trial');
    assert.equal(called('createOrUpdateSubscription').length, 0);
  });

  it('is kept when a trial was granted first, even on another customer', async () => {
    subs = [
      sub('sub_paid', 100),
      sub('sub_trial', 50, {
        customer: 'cus_2',
        status: 'trialing',
        metadata: { uniqueId: 'u-sub_trial', organizationId: 'org1' },
      }),
    ];
    const result = await service().createSubscription({
      ...created('sub_trial'),
      data: { object: { id: 'sub_trial', customer: 'cus_2' } },
    } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

    assert.equal(
      (result as { reason: string }).reason,
      'duplicate subscription',
    );
    assert.deepEqual(
      called('subscriptions.cancel').map(([id]) => id),
      ['sub_trial'],
    );
    assert.equal(orgCustomer, 'cus_1');
  });
});

describe('a subscription ending next to another', () => {
  it('keeps the organization on the one left, at its own tier', async () => {
    subs = [
      sub('sub_old', 100, { items: { data: [{ price: growthYear }] } as any }),
      sub('sub_new', 200, { status: 'canceled' }),
    ];
    await service().deleteSubscription(deleted('sub_new'));

    assert.equal(called('deleteSubscription').length, 0);
    const [args] = called('createOrUpdateSubscription');
    assert.deepEqual(args, [
      'stripe',
      false,
      'u-sub_old',
      'cus_1',
      pricing.GROWTH.channel,
      'GROWTH',
      'YEARLY',
      null,
    ]);
  });

  it('revokes as before when nothing is left', async () => {
    subs = [sub('sub_only', 100, { status: 'canceled' })];
    await service().deleteSubscription(deleted('sub_only'));

    assert.deepEqual(called('deleteSubscription'), [['cus_1', 'stripe']]);
    assert.equal(called('createOrUpdateSubscription').length, 0);
  });

  it('leaves a founding member alone', async () => {
    localSub = { isLifetime: true };
    subs = [sub('sub_old', 100), sub('sub_new', 200, { status: 'canceled' })];
    await service().deleteSubscription(deleted('sub_new'));

    assert.equal(called('deleteSubscription').length, 0);
    assert.equal(called('createOrUpdateSubscription').length, 0);
  });
});

describe('cancelling from Billing', () => {
  it('sets every live subscription to cancel and saves the later date', async () => {
    subs = [
      sub('sub_a', 100),
      sub('sub_b', 200),
      sub('sub_gone', 50, { status: 'incomplete_expired' }),
    ];
    const result = await service().setToCancel('org1');

    assert.deepEqual(
      called('subscriptions.update').map(([id]) => id),
      ['sub_b', 'sub_a'],
    );
    assert.deepEqual(called('updateCancelAt'), [['org1', 1_000_200]]);
    assert.deepEqual(result.cancel_at, new Date(1_000_200 * 1000));
  });

  it('lifts the cancel on every one, and saves that too', async () => {
    subs = [
      sub('sub_a', 100, { cancel_at_period_end: true }),
      sub('sub_b', 200, { cancel_at_period_end: true }),
    ];
    const result = await service().setToCancel('org1');

    assert.equal(called('subscriptions.update').length, 2);
    assert.deepEqual(called('updateCancelAt'), [['org1', null]]);
    assert.equal(result.cancel_at, undefined);
  });

  it('does not end a paid subscription because a duplicate failed to pay', async () => {
    subs = [
      sub('sub_paid', 100),
      sub('sub_failed', 200, {
        status: 'past_due',
        latest_invoice: { status: 'open' } as any,
      }),
    ];
    const result = await service().setToCancel('org1');

    assert.deepEqual(called('subscriptions.cancel'), [['sub_failed']]);
    assert.deepEqual(
      called('subscriptions.update').map(([id, body]) => [
        id,
        (body as any).cancel_at_period_end,
      ]),
      [['sub_paid', true]],
    );
    assert.equal(called('deleteSubscription').length, 0);
    assert.deepEqual(result.cancel_at, new Date(1_000_100 * 1000));
  });

  it('ends at once when nothing paid is left', async () => {
    subs = [
      sub('sub_failed', 200, {
        status: 'past_due',
        latest_invoice: { status: 'open' } as any,
      }),
    ];
    await service().setToCancel('org1');

    assert.deepEqual(called('subscriptions.cancel'), [['sub_failed']]);
    assert.deepEqual(called('deleteSubscription'), [['cus_1', 'stripe']]);
  });

  it('reports the cancel when only saving its date failed', async () => {
    failCancelAt = true;
    subs = [sub('sub_a', 100)];
    const result = await service().setToCancel('org1');

    assert.deepEqual(result.cancel_at, new Date(1_000_100 * 1000));
  });
});

describe('an admin cancelling', () => {
  it('still cancels a checkout waiting on its first payment', async () => {
    subs = [
      sub('sub_waiting', 100, { status: 'incomplete' }),
      sub('sub_gone', 50, { status: 'incomplete_expired' }),
    ];
    await service().cancelSubscription('org1');

    assert.deepEqual(called('subscriptions.cancel'), [['sub_waiting']]);
  });
});

describe('a first checkout', () => {
  it('is refused while Stripe already bills the customer', async () => {
    subs = [sub('sub_old', 100)];
    await assert.rejects(
      service().embedded(
        'unique',
        'org1',
        'user1',
        { billing: 'PRO', period: 'MONTHLY' } as any,
        false,
      ),
      (err: any) => err.getStatus?.() === 409,
    );
  });
});

describe('billing history', () => {
  it('names each invoice from what it billed', async () => {
    prices = [proPrice, growthYear];
    invoices = [
      {
        id: 'in_plan',
        customer: 'cus_1',
        number: 'A-1',
        status: 'paid',
        total: 4900,
        currency: 'usd',
        created: 10,
        attempted: true,
        metadata: {},
        invoice_pdf: 'https://pdf',
        hosted_invoice_url: 'https://view',
        // Metadata written at checkout still says PRO; the price says GROWTH.
        parent: {
          subscription_details: {
            subscription: 'sub_1',
            metadata: { billing: 'PRO', period: 'MONTHLY' },
          },
        } as any,
        lines: {
          data: [
            {
              amount: -1000,
              description: 'Unused time on PRO',
              period: { end: 1 },
              pricing: { price_details: { price: 'price_pro_month' } },
            },
            {
              amount: 5900,
              description: 'GROWTH',
              period: { end: 99 },
              pricing: { price_details: { price: 'price_growth_year' } },
            },
          ],
        } as any,
      },
      {
        id: 'in_pack',
        customer: 'cus_1',
        number: 'A-2',
        status: 'open',
        attempted: false,
        total: 1000,
        currency: 'usd',
        created: 20,
        metadata: { kind: 'credit_pack', credits: '100' },
        lines: {
          data: [{ amount: 1000, description: 'PostQueen credits (100)' }],
        } as any,
      },
      {
        id: 'in_founding',
        customer: 'cus_1',
        number: 'A-3',
        status: 'open',
        attempted: true,
        total: 29900,
        currency: 'usd',
        created: 30,
        metadata: {},
        lines: {
          data: [{ amount: 29900, description: 'PostQueen — founding member' }],
        } as any,
      },
      {
        id: 'in_trial',
        customer: 'cus_1',
        status: 'paid',
        total: 0,
        created: 5,
        metadata: {},
        lines: { data: [] } as any,
      },
      {
        id: 'in_draft',
        customer: 'cus_1',
        status: 'draft',
        total: 4900,
        created: 40,
        metadata: {},
        lines: { data: [] } as any,
      },
    ];

    const rows = await service().getInvoices('org1');

    assert.deepEqual(
      rows.map((r) => [r.id, r.kind, r.tier, r.period, r.credits, r.status]),
      [
        ['in_plan', 'plan', 'GROWTH', 'YEARLY', null, 'paid'],
        ['in_pack', 'credits', null, null, 100, 'pending'],
        ['in_founding', 'lifetime', null, null, null, 'failed'],
      ],
    );
    assert.equal(rows[0].periodEnd, 99);
    assert.equal(rows[0].viewUrl, 'https://view');
    assert.equal(rows[0].downloadUrl, 'https://pdf');
  });
});

describe('a plan change', () => {
  // The tier products, and each tier's prices as `subscribe` and `prorate`
  // look for them: pre-tax, named after the tier and period, at list price.
  const tiers = ['CREATOR', 'GROWTH', 'PRO'];
  const listed = (tier: string, period: 'MONTHLY' | 'YEARLY') =>
    ({
      id: `price_${tier.toLowerCase()}_${period.toLowerCase()}`,
      product: `prod_${tier.toLowerCase()}`,
      nickname: `${tier} ${period}`,
      tax_behavior: 'exclusive',
      recurring: { interval: period === 'MONTHLY' ? 'month' : 'year' },
      unit_amount:
        (period === 'MONTHLY'
          ? pricing[tier].month_price
          : pricing[tier].year_price) * 100,
    }) as unknown as Stripe.Price;
  const on = (
    tier: string,
    period: 'MONTHLY' | 'YEARLY',
    extra: Partial<Sub> = {},
  ) =>
    sub('sub_1', 100, {
      items: {
        data: [
          {
            id: 'si_1',
            price: listed(tier, period),
            current_period_end: 5_000,
          },
        ],
      } as any,
      ...extra,
    });

  // What this block replaces, put back after it. The SDK's own methods are
  // not enumerable, so each one is saved by name.
  const faked: [object, string][] = [
    [probe.products, 'list'],
    [probe.prices, 'list'],
    [probe.invoices, 'createPreview'],
    [probe.subscriptionSchedules, 'create'],
  ];
  let saved: unknown[];
  before(() => {
    saved = faked.map(
      ([resource, method]) => Object.getPrototypeOf(resource)[method],
    );
    fake(probe.products, {
      list: record('products.list', () => ({
        data: tiers.map((tier) => ({
          id: `prod_${tier.toLowerCase()}`,
          name: tier,
        })),
      })),
    });
    fake(probe.prices, {
      list: record('prices.list', ({ product }) => ({
        data: tiers
          .filter((tier) => product === `prod_${tier.toLowerCase()}`)
          .flatMap((tier) => [
            listed(tier, 'MONTHLY'),
            listed(tier, 'YEARLY'),
          ]),
      })),
    });
    fake(probe.invoices, {
      createPreview: record('invoices.createPreview', () => ({
        amount_due: 12_345,
      })),
    });
    fake(probe.subscriptionSchedules, {
      create: record('subscriptionSchedules.create', refuse),
    });
  });
  after(() => {
    faked.forEach(([resource, method], i) =>
      fake(resource, { [method]: saved[i] }),
    );
  });

  const preview = (billing: string, period: 'MONTHLY' | 'YEARLY') =>
    service().prorate('org1', { billing, period } as any);

  it('charges now for the same tier, monthly to yearly', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    assert.deepEqual(await preview('GROWTH', 'YEARLY'), { price: 123.45 });
    assert.equal(called('invoices.createPreview').length, 1);
  });

  it('charges now for a higher tier, monthly to yearly', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    assert.deepEqual(await preview('PRO', 'YEARLY'), { price: 123.45 });
  });

  it('waits for renewal for a lower tier, monthly to yearly', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    assert.deepEqual(await preview('CREATOR', 'YEARLY'), {
      price: 0,
      scheduledAt: new Date(5_000_000),
    });
    assert.equal(called('invoices.createPreview').length, 0);
  });

  it('still waits for renewal from yearly to monthly', async () => {
    subs = [on('GROWTH', 'YEARLY')];
    assert.deepEqual(await preview('GROWTH', 'MONTHLY'), {
      price: 0,
      scheduledAt: new Date(5_000_000),
    });
  });

  it('still compares price within one period', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    assert.deepEqual(await preview('CREATOR', 'MONTHLY'), {
      price: 0,
      scheduledAt: new Date(5_000_000),
    });
    assert.deepEqual(await preview('PRO', 'MONTHLY'), { price: 123.45 });
  });

  it('still changes at once during a trial', async () => {
    subs = [on('GROWTH', 'MONTHLY', { status: 'trialing' })];
    assert.deepEqual(await preview('CREATOR', 'YEARLY'), { price: 123.45 });
  });

  it('falls back to price for a tier it cannot read', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    (subs[0].items!.data[0].price as any).product = 'prod_unknown';
    // GROWTH's year costs less a month than its month: by price, a downgrade.
    assert.deepEqual(await preview('GROWTH', 'YEARLY'), {
      price: 0,
      scheduledAt: new Date(5_000_000),
    });
  });

  it('switches to yearly on the same tier as an upgrade, once paid', async () => {
    subs = [on('GROWTH', 'MONTHLY', { schedule: 'sub_sched_1' })];
    localPlan = { subscriptionTier: 'GROWTH' };

    const result = await service().subscribe(
      'unique',
      'org1',
      'user1',
      { billing: 'GROWTH', period: 'YEARLY', withdrawalWaiver: true } as any,
      false,
    );

    assert.equal((result as any).scheduledAt, undefined);
    assert.equal(called('subscriptionSchedules.create').length, 0);
    // A downgrade scheduled earlier gives way to the upgrade.
    assert.deepEqual(called('subscriptionSchedules.release'), [
      ['sub_sched_1'],
    ]);
    const change = called('subscriptions.update')
      .map(([, body]) => body as any)
      .find((body) => body.items);
    assert.equal(change.payment_behavior, 'pending_if_incomplete');
    assert.equal(change.proration_behavior, 'always_invoice');
    assert.equal(change.billing_cycle_anchor, undefined);
    assert.deepEqual(change.items, [
      { id: 'si_1', price: 'price_growth_yearly', quantity: 1 },
    ]);
    // The consent to the year's credits is written before the charge.
    const updates = called('subscriptions.update').map(([, b]) => b as any);
    assert.ok(
      updates.findIndex((b) => b.metadata?.withdrawal_waiver_at) <
        updates.indexOf(change),
    );
  });

  const upgrade = () =>
    service().subscribe(
      'unique',
      'org1',
      'user1',
      { billing: 'PRO', period: 'MONTHLY' } as any,
      false,
    );
  const updates = () =>
    called('subscriptions.update').map(([, body]) => body as any);

  it('turns tax on before an upgrade on a subscription without it', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    localPlan = { subscriptionTier: 'GROWTH' };

    await upgrade();

    const tax = updates().findIndex(
      (b) => b.automatic_tax?.enabled && !b.items && !b.metadata,
    );
    const change = updates().findIndex((b) => b.items);
    assert.ok(tax >= 0 && tax < change);
  });

  it('leaves tax alone when the subscription already has it', async () => {
    subs = [
      on('GROWTH', 'MONTHLY', { automatic_tax: { enabled: true } as any }),
    ];
    localPlan = { subscriptionTier: 'GROWTH' };

    await upgrade();

    const change = updates().findIndex((b) => b.items);
    assert.ok(change >= 0);
    assert.equal(
      updates()
        .slice(0, change)
        .filter((b) => b.automatic_tax).length,
      0,
    );
  });

  it('still upgrades when Stripe refuses to turn tax on', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    localPlan = { subscriptionTier: 'GROWTH' };
    const saved = Object.getPrototypeOf(probe.subscriptions).update;
    fake(probe.subscriptions, {
      update: async (id: string, body: any) => {
        if (body.automatic_tax && !body.metadata) {
          calls.push({ method: 'subscriptions.update', args: [id, body] });
          throw new Error('customer_tax_location_invalid');
        }
        return saved(id, body);
      },
    });
    try {
      const result = await upgrade();
      assert.equal((result as any).portal, undefined);
      assert.ok(updates().some((b) => b.items));
    } finally {
      fake(probe.subscriptions, { update: saved });
    }
  });

  it('refuses a switch to yearly without the withdrawal consent', async () => {
    subs = [on('GROWTH', 'MONTHLY')];
    localPlan = { subscriptionTier: 'GROWTH' };
    await assert.rejects(
      service().subscribe(
        'unique',
        'org1',
        'user1',
        { billing: 'GROWTH', period: 'YEARLY' } as any,
        false,
      ),
      (err: any) => err.getStatus?.() === 400,
    );
    assert.equal(called('subscriptions.update').length, 0);
  });
});
