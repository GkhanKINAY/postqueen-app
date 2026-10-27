import 'reflect-metadata';
import assert from 'node:assert/strict';
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from 'node:test';
import Stripe from 'stripe';
import { Logger } from '@nestjs/common';
import type { StripeService as StripeServiceType } from './stripe.service.ts';
import type { SubscriptionService as SubscriptionServiceType } from '../database/prisma/subscriptions/subscription.service.ts';
import {
  planCredits as planCreditsOn,
  pricing,
} from '../database/prisma/subscriptions/pricing.ts';

// A subscription without a `credit_pricing` stamp was sold before v2: every
// ledger test below is on that list unless it stamps another.
const planCredits = (tier: string, period: 'MONTHLY' | 'YEARLY') =>
  planCreditsOn('legacy', tier, period);

// Every Stripe call below is faked, and the resources no test uses throw. The
// service builds its client from the environment when it is loaded, so the
// key is replaced first, whatever the environment holds: no real key, live or
// test, is ever in the client. That is also what turns billing on for the
// checks that ask (`isBillingEnabled`).
process.env.STRIPE_SECRET_KEY = 'sk_test_unit_never_valid';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_unit_never_valid';
// The backend and the orchestrator pin it (see their main.ts); months are
// counted in it.
process.env.TZ = 'UTC';
let StripeService: typeof StripeServiceType;
let SubscriptionService: typeof SubscriptionServiceType;
before(async () => {
  ({ StripeService } = await import('./stripe.service.ts'));
  ({ SubscriptionService } = await import(
    '../database/prisma/subscriptions/subscription.service.ts'
  ));
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
// The paid invoices a subscription lists, for the Meta pixel's first-charge check.
let subscriptionInvoices: Partial<Stripe.Invoice>[];
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
    data: subscription
      ? subscriptionInvoices
      : invoices.filter((i) => i.customer === customer),
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
  revokeLocalSubscription: record('revokeLocalSubscription', () => ({})),
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
    { announce: async () => false } as any,
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
  subscriptionInvoices = [];
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
      undefined,
      undefined,
      // unstamped, so sold before v2
      'legacy',
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
      { billing: 'GROWTH', period: 'YEARLY' } as any,
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
    // A plan change leaves the credits schedule as it is: a subscription
    // sold before monthly credits keeps its year at once.
    const updates = called('subscriptions.update').map(([, b]) => b as any);
    assert.ok(updates.every((b) => !('credits_schedule' in (b.metadata || {}))));
    assert.equal(change.metadata, undefined);
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
      assert.ok(updates().some((b) => b.automatic_tax && !b.metadata));
      assert.ok(updates().some((b) => b.items));
    } finally {
      fake(probe.subscriptions, { update: saved });
    }
  });

  it('still takes the withdrawal flag an older app sends, and keeps it and the credits schedule out of Stripe', async () => {
    subs = [
      on('GROWTH', 'MONTHLY', { metadata: { credits_schedule: 'monthly' } }),
    ];
    localPlan = { subscriptionTier: 'GROWTH' };
    // A blank value would unset the stamp, and with it monthly credits.
    await service().subscribe(
      'unique',
      'org1',
      'user1',
      {
        billing: 'GROWTH',
        period: 'YEARLY',
        withdrawalWaiver: true,
        credits_schedule: '',
      } as any,
      false,
    );
    const updates = called('subscriptions.update').map(([, b]) => b as any);
    assert.ok(updates.some((b) => b.items));
    const written = updates.find((b) => b.metadata?.uniqueId);
    assert.equal('withdrawalWaiver' in written.metadata, false);
    assert.equal('credits_schedule' in written.metadata, false);
  });

  it('carries the credits schedule a downgrade at renewal finds, and adds none', async () => {
    const saved = [
      Object.getPrototypeOf(probe.subscriptionSchedules).create,
      Object.getPrototypeOf(probe.subscriptionSchedules).update,
    ];
    fake(probe.subscriptionSchedules, {
      create: record('subscriptionSchedules.create', () => ({
        id: 'sub_sched_1',
        phases: [{ start_date: 100 }],
        current_phase: { start_date: 100 },
      })),
      update: record('subscriptionSchedules.update', () => ({})),
    });
    const renewal = async (metadata: Record<string, string>) => {
      calls = [];
      subs = [on('GROWTH', 'MONTHLY', { metadata })];
      localPlan = { subscriptionTier: 'GROWTH' };
      const result = await service().subscribe(
        'unique',
        'org1',
        'user1',
        { billing: 'CREATOR', period: 'YEARLY' } as any,
        false,
      );
      assert.equal((result as any).scheduledAt?.getTime(), 5_000_000);
      const [, body] = called('subscriptionSchedules.update')[0] as any[];
      return body.phases[1].metadata;
    };
    try {
      assert.equal((await renewal({ credits_schedule: 'monthly' })).credits_schedule, 'monthly');
      assert.equal('credits_schedule' in (await renewal({})), false);
      assert.ok(
        called('subscriptions.update').every(
          ([, b]: any) => !('credits_schedule' in (b.metadata || {})),
        ),
      );
    } finally {
      fake(probe.subscriptionSchedules, { create: saved[0], update: saved[1] });
    }
  });
});

describe('the sales card for a paid invoice', () => {
  let posted: any[];
  const withSales = () =>
    new StripeService(
      subscriptionService as any,
      organizationService as any,
      { getUserById: async () => ({ email: 'a@b.co' }) } as any,
      {} as any,
      { inAppNotification: async () => ({}) } as any,
      { announce: async (sale: any) => posted.push(sale) } as any,
    );
  const paid = (
    id: string,
    created: number,
    extra: Partial<Stripe.Invoice> = {},
  ): Partial<Stripe.Invoice> => ({
    id,
    created,
    customer: 'cus_1',
    amount_paid: 4900,
    currency: 'usd',
    billing_reason: 'subscription_cycle',
    parent: { subscription_details: { subscription: 'sub_1' } } as any,
    lines: { data: [] } as any,
    metadata: {},
    ...extra,
  });
  const announce = (invoice: Partial<Stripe.Invoice>) =>
    (withSales() as any).announceInvoice(invoice, true);

  let savedRetrieve: unknown;
  let savedCustomer: unknown;
  before(() => {
    savedRetrieve = Object.getPrototypeOf(probe.invoices).retrieve;
    savedCustomer = Object.getPrototypeOf(probe.customers).retrieve;
    fake(probe.invoices, {
      retrieve: async (id: string) => invoices.find((i) => i.id === id),
    });
    fake(probe.customers, { retrieve: async () => ({ metadata: {} }) });
  });
  after(() => {
    fake(probe.invoices, { retrieve: savedRetrieve });
    fake(probe.customers, { retrieve: savedCustomer });
  });
  beforeEach(() => {
    posted = [];
    subs = [
      sub('sub_1', 100, {
        metadata: {
          service: 'postqueen',
          utm: 'postqueen.ai',
          utm_medium: 'landing',
        },
      }),
    ];
  });

  it('calls the first money a subscription takes its sale', async () => {
    invoices = [paid('in_1', 200, { billing_reason: 'subscription_create' })];
    await announce(invoices[0]);
    assert.equal(posted[0].kind, 'subscription');
    assert.equal(posted[0].paymentNumber, 1);
    assert.equal(posted[0].attribution.source, 'postqueen.ai');
    assert.equal(posted[0].attribution.medium, 'landing');
  });

  it('hands the card no name, address, sign-up date or link', async () => {
    invoices = [
      paid('in_1', 200, {
        billing_reason: 'subscription_create',
        customer_name: 'Jane Doe',
        customer_email: 'jane.doe@example.com',
      }),
    ];
    await announce(invoices[0]);
    for (const key of [
      'organizationName',
      'customerName',
      'customerEmail',
      'signedUpAt',
      'link',
    ]) {
      assert.equal(key in posted[0], false, key);
    }
    assert.doesNotMatch(JSON.stringify(posted[0]), /jane/i);
  });

  it('a trial ended early from Billing is a conversion, not an upgrade', async () => {
    subs[0].trial_end = 150;
    invoices = [
      paid('in_trial', 100, { amount_paid: 0 }),
      paid('in_1', 200, { billing_reason: 'subscription_update' }),
    ];
    await announce(invoices[1]);
    assert.equal(posted[0].kind, 'trial_converted');
  });

  it('tells a renewal from an upgrade once the subscription has paid', async () => {
    invoices = [
      paid('in_1', 100, { billing_reason: 'subscription_create' }),
      paid('in_2', 200),
      paid('in_3', 300, { billing_reason: 'subscription_update' }),
    ];
    await announce(invoices[1]);
    await announce(invoices[2]);
    assert.deepEqual(
      posted.map((p) => [p.kind, p.paymentNumber]),
      [
        ['renewal', 2],
        ['upgrade', 3],
      ],
    );
  });

  it('leaves a checkout payment and a $0 invoice to the paths that own them', async () => {
    invoices = [
      paid('in_pack', 100, { parent: null, metadata: { kind: 'credit_pack' } }),
      paid('in_trial', 200, { amount_paid: 0 }),
    ];
    await announce(invoices[0]);
    await announce(invoices[1]);
    assert.equal(posted.length, 0);
  });
});

describe('a full refund', () => {
  // The invoice the refunded charge's PaymentIntent paid.
  let paidInvoice: string;

  // What this block replaces, put back after it. The SDK's own methods are
  // not enumerable, so each one is saved by name.
  const faked: [object, string][] = [
    [probe.invoices, 'retrieve'],
    [probe.invoicePayments, 'list'],
    [probe.paymentIntents, 'retrieve'],
  ];
  let saved: unknown[];
  before(() => {
    saved = faked.map(
      ([resource, method]) => Object.getPrototypeOf(resource)[method],
    );
    fake(probe.invoices, {
      retrieve: async (id: string) => invoices.find((i) => i.id === id),
    });
    fake(probe.invoicePayments, {
      list: async () => ({ data: [{ invoice: paidInvoice }] }),
    });
    // Not a credits pack: the plan's own payment.
    fake(probe.paymentIntents, { retrieve: async () => ({ metadata: {} }) });
  });
  after(() => {
    faked.forEach(([resource, method], i) =>
      fake(resource, { [method]: saved[i] }),
    );
  });

  // A line for the period [start, end]: the subscription's own charge for
  // it, or a proration (a change in the middle of a period).
  const line = (start: number, end: number, proration = false, amount = 4900) => ({
    amount,
    period: { start, end },
    parent: {
      type: 'subscription_item_details',
      subscription_item_details: { proration },
    },
  });
  const invoice = (
    id: string,
    billing_reason: Stripe.Invoice.BillingReason,
    lines: ReturnType<typeof line>[],
  ): Partial<Stripe.Invoice> => ({
    id,
    customer: 'cus_1',
    total: 4900,
    billing_reason,
    parent: { subscription_details: { subscription: 'sub_1' } } as any,
    lines: { data: lines } as any,
  });
  // The subscription in the period [start, end], `latest` its latest invoice.
  const running = (start: number, end: number, latest: string) =>
    sub('sub_1', 100, {
      latest_invoice: latest as any,
      items: {
        data: [
          {
            price: proPrice,
            current_period_start: start,
            current_period_end: end,
          },
        ],
      } as any,
    });
  // An upgrade in the middle of [200, 300]: the old price credited and the
  // new one charged for what is left of the period, both prorations.
  const upgrade = (id: string) =>
    invoice(id, 'subscription_update', [
      line(250, 300, true, -4900),
      line(250, 300, true, 9900),
    ]);
  const refund = (invoiceId: string) => {
    paidInvoice = invoiceId;
    return service().chargeRefunded({
      data: {
        object: {
          id: 'ch_1',
          customer: 'cus_1',
          refunded: true,
          payment_intent: 'pi_1',
        },
      },
    } as unknown as Stripe.ChargeRefundedEvent);
  };

  it('ends a plan whose running period is refunded', async () => {
    subs = [running(300, 400, 'in_2')];
    invoices = [
      invoice('in_1', 'subscription_create', [line(200, 300)]),
      invoice('in_2', 'subscription_cycle', [line(300, 400)]),
    ];
    const result = await refund('in_2');
    assert.deepEqual(called('subscriptions.cancel')[0], [
      'sub_1',
      { invoice_now: false, prorate: false },
    ]);
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('ends a plan whose trial was ended early from Billing', async () => {
    // Stripe bills that first period as `subscription_update`.
    subs = [running(200, 300, 'in_1')];
    invoices = [invoice('in_1', 'subscription_update', [line(200, 300)])];
    const result = await refund('in_1');
    assert.equal(called('subscriptions.cancel').length, 1);
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('ends a plan when its period is refunded after an upgrade was paid', async () => {
    // The upgrade is the latest invoice; the period's own charge is not.
    subs = [running(200, 300, 'in_2')];
    invoices = [
      invoice('in_1', 'subscription_create', [line(200, 300)]),
      upgrade('in_2'),
    ];
    const result = await refund('in_1');
    assert.equal(called('subscriptions.cancel').length, 1);
    assert.equal(result.revoked, true);
  });

  it('ends a classic-mode plan whose switch to yearly is refunded', async () => {
    // Classic billing restarts the period at the switch and bills the year
    // as one line; flexible billing bills the switch as prorations.
    subs = [running(250, 1250, 'in_2')];
    invoices = [
      invoice('in_1', 'subscription_create', [line(200, 300)]),
      invoice('in_2', 'subscription_update', [
        line(250, 300, true, -2450),
        line(250, 1250, false, 99000),
      ]),
    ];
    const result = await refund('in_2');
    assert.equal(called('subscriptions.cancel').length, 1);
    assert.equal(result.revoked, true);
  });

  it('keeps the plan when only an upgrade’s difference is refunded', async () => {
    subs = [running(200, 300, 'in_2')];
    invoices = [
      invoice('in_1', 'subscription_create', [line(200, 300)]),
      upgrade('in_2'),
    ];
    const result = await refund('in_2');
    assert.equal(called('subscriptions.cancel').length, 0);
    assert.equal(called('revokeLocalSubscription').length, 0);
    assert.equal(result.reason, 'still subscribed');
  });

  it('keeps a yearly plan when the month before the switch is refunded', async () => {
    // Flexible billing keeps the period's start and moves its end a year on.
    subs = [running(200, 1200, 'in_2')];
    invoices = [
      invoice('in_1', 'subscription_update', [line(200, 300)]),
      invoice('in_2', 'subscription_update', [
        line(250, 300, true, -4900),
        line(250, 1200, true, 99000),
      ]),
    ];
    const result = await refund('in_1');
    assert.equal(called('subscriptions.cancel').length, 0);
    assert.equal(result.reason, 'still subscribed');
  });

  it('keeps the plan when a past period is refunded', async () => {
    subs = [running(300, 400, 'in_2')];
    invoices = [
      invoice('in_1', 'subscription_create', [line(200, 300)]),
      invoice('in_2', 'subscription_cycle', [line(300, 400)]),
    ];
    const result = await refund('in_1');
    assert.equal(called('subscriptions.cancel').length, 0);
    assert.equal(called('revokeLocalSubscription').length, 0);
    assert.equal(result.reason, 'still subscribed');
  });
});

describe('a founding member’s plan', () => {
  // What the refunded or disputed charge is found through: its PaymentIntent,
  // the invoice that PaymentIntent paid, and the checkout it came from.
  let intent: { metadata: Record<string, string> };
  let paidInvoice: string | undefined;
  let session: Partial<Stripe.Checkout.Session> | undefined;

  const charge = {
    id: 'ch_1',
    customer: 'cus_1',
    refunded: true,
    payment_intent: 'pi_1',
  };

  // What this block replaces, put back after it, as in the block above.
  const faked: [object, string][] = [
    [probe.invoices, 'retrieve'],
    [probe.invoicePayments, 'list'],
    [probe.paymentIntents, 'retrieve'],
    [probe.checkout.sessions, 'list'],
    [probe.charges, 'retrieve'],
  ];
  let saved: unknown[];
  before(() => {
    saved = faked.map(
      ([resource, method]) => Object.getPrototypeOf(resource)[method],
    );
    fake(probe.invoices, {
      retrieve: async (id: string) => invoices.find((i) => i.id === id),
    });
    fake(probe.invoicePayments, {
      list: async () => ({
        data: paidInvoice ? [{ invoice: paidInvoice }] : [],
      }),
    });
    fake(probe.paymentIntents, { retrieve: async () => intent });
    fake(probe.checkout.sessions, {
      list: record('checkout.sessions.list', () => ({
        data: session ? [session] : [],
      })),
    });
    fake(probe.charges, { retrieve: async () => charge });
  });
  after(() => {
    faked.forEach(([resource, method], i) =>
      fake(resource, { [method]: saved[i] }),
    );
  });

  // An invoice of org1's customer with one line.
  const paid = (
    id: string,
    description: string,
    extra: Partial<Stripe.Invoice> = {},
  ): Partial<Stripe.Invoice> => ({
    id,
    customer: 'cus_1',
    metadata: {},
    parent: null,
    lines: { data: [{ description }] } as any,
    ...extra,
  });
  const founding = { service: 'postqueen', organizationId: 'org1' };

  beforeEach(() => {
    localSub = { isLifetime: true };
    intent = { metadata: {} };
    paidInvoice = undefined;
    session = undefined;
    // The monthly plan they had before they bought the founding one.
    subs = [sub('sub_old', 100, { status: 'canceled' })];
    invoices = [
      paid('in_month', '1 × PRO (at $49.00 / month)', {
        parent: { subscription_details: { subscription: 'sub_old' } } as any,
      }),
      paid('in_founding', 'PostQueen — founding member', {
        metadata: { ...founding, lifetime_charge: '1' },
      }),
      paid('in_retention', 'PostQueen — founding member (retention)', {
        metadata: { ...founding, lifetime_retention: '1', lifetime_charge: '1' },
      }),
      // A checkout paid at once makes its invoice with no metadata.
      paid('in_checkout', 'PostQueen — founding member'),
    ];
  });

  const refund = () =>
    service().chargeRefunded({
      data: { object: charge },
    } as unknown as Stripe.ChargeRefundedEvent);
  const dispute = () =>
    service().disputeCreated({
      data: {
        object: { id: 'dp_1', status: 'needs_response', charge: 'ch_1' },
      },
    } as unknown as Stripe.ChargeDisputeCreatedEvent);

  it('stays when a month paid before it is refunded', async () => {
    paidInvoice = 'in_month';
    const result = await refund();
    assert.equal(called('revokeLocalSubscription').length, 0);
    assert.equal(result.reason, 'founding plan');
  });

  it('ends when the deferred founding fee is refunded', async () => {
    paidInvoice = 'in_founding';
    const result = await refund();
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('ends when the retention offer that bought it is refunded', async () => {
    // Half the founding fee, paid instead of it: the plan's only payment.
    paidInvoice = 'in_retention';
    const result = await refund();
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('ends when a checkout paid at once is refunded, by its invoice line', async () => {
    paidInvoice = 'in_checkout';
    const result = await refund();
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('ends when a founding fee charged before it had an invoice is refunded', async () => {
    intent = { metadata: { ...founding, lifetime_charge: '1' } };
    const result = await refund();
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('ends when a checkout from before checkouts made invoices is refunded', async () => {
    session = { id: 'cs_1', mode: 'payment', metadata: founding };
    const result = await refund();
    assert.deepEqual(called('checkout.sessions.list')[0], [
      { payment_intent: 'pi_1', limit: 1 },
    ]);
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('stays, and the charge is logged, when it cannot be placed', async (t) => {
    const warn = t.mock.method(Logger, 'warn', () => undefined);
    const result = await refund();
    assert.equal(called('revokeLocalSubscription').length, 0);
    assert.equal(result.reason, 'founding plan');
    const lines = warn.mock.calls.map((c) => String(c.arguments[0]));
    assert.ok(lines.some((line) => line.includes('ch_1')));
    assert.ok(!lines.some((line) => /cus_1|org1|pi_1/.test(line)));
  });

  it('stays when a month paid before it is disputed', async () => {
    paidInvoice = 'in_month';
    const result = await dispute();
    assert.equal(called('revokeLocalSubscription').length, 0);
    assert.equal(result.reason, 'founding plan');
  });

  it('is suspended when the founding fee is disputed', async () => {
    paidInvoice = 'in_founding';
    const result = await dispute();
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
  });

  it('changes nothing for a customer without one', async () => {
    // The same refund ends a plan as it always did, and nothing is looked up
    // to place the charge.
    localSub = { isLifetime: false };
    const result = await refund();
    assert.equal(called('revokeLocalSubscription').length, 1);
    assert.equal(result.revoked, true);
    assert.equal(called('checkout.sessions.list').length, 0);
  });
});

describe('an admin refund', () => {
  // The charges Stripe holds, by id, and what this block replaces.
  let charges: Record<string, { id: string; customer: string | null }>;
  const faked: [object, string][] = [
    [probe.charges, 'retrieve'],
    [probe.refunds, 'create'],
  ];
  let saved: unknown[];
  before(() => {
    saved = faked.map(
      ([resource, method]) => Object.getPrototypeOf(resource)[method],
    );
    fake(probe.charges, {
      retrieve: async (id: string) => {
        if (!charges[id]) {
          throw new Error('No such charge');
        }
        return charges[id];
      },
    });
    fake(probe.refunds, {
      create: record('refunds.create', (body) => ({ id: 're_1', ...body })),
    });
  });
  after(() => {
    faked.forEach(([resource, method], i) =>
      fake(resource, { [method]: saved[i] }),
    );
  });
  beforeEach(() => {
    charges = {
      ch_own: { id: 'ch_own', customer: 'cus_1' },
      ch_other: { id: 'ch_other', customer: 'cus_2' },
      ch_guest: { id: 'ch_guest', customer: null },
    };
  });

  it('refunds the organization’s own charge in full', async () => {
    const result = await service().refundCharges('org1', ['ch_own']);
    assert.deepEqual(called('refunds.create'), [[{ charge: 'ch_own' }]]);
    assert.deepEqual(result, { refunded: ['ch_own'], failed: [] });
  });

  it('refuses a charge of another customer, or of none', async (t) => {
    t.mock.method(Logger, 'warn', () => undefined);
    const result = await service().refundCharges('org1', [
      'ch_other',
      'ch_guest',
      'ch_own',
    ]);
    assert.deepEqual(called('refunds.create'), [[{ charge: 'ch_own' }]]);
    assert.deepEqual(result, {
      refunded: ['ch_own'],
      failed: ['ch_other', 'ch_guest'],
    });
  });

  it('refuses a charge Stripe does not know', async () => {
    const result = await service().refundCharges('org1', ['ch_missing']);
    assert.equal(called('refunds.create').length, 0);
    assert.deepEqual(result, { refunded: [], failed: ['ch_missing'] });
  });
});

describe('yearly credits, a month at a time', () => {
  // The grant logic itself (SubscriptionService), over a ledger faked in
  // memory the way plan.credits.spec.ts fakes it: refs are unique, and
  // `close` ends what is live from those sources.
  type Grant = {
    source: string;
    amount: number;
    tier?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    externalRef?: string | null;
    expiresAt?: Date | null;
    revokedAt?: Date | null;
  };
  let ledger: Grant[];
  const live = (grant: Grant) =>
    !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > new Date());
  const inForce = () => ledger.filter(live);
  const currentGrants = async (_org: string, sources: string[]) =>
    ledger.filter((grant) => sources.includes(grant.source) && live(grant)).reverse();
  const credits = {
    currentGrants,
    grantWith: async (
      org: string,
      sources: string[],
      decide: (current: Grant[]) => { grant: Grant; close?: string[] } | null,
    ) => {
      const decision = decide(await currentGrants(org, sources));
      if (
        !decision ||
        ledger.some((grant) => grant.externalRef === decision.grant.externalRef)
      ) {
        return { id: null, granted: false };
      }
      for (const grant of ledger) {
        if (decision.close?.includes(grant.source) && live(grant)) {
          grant.expiresAt = new Date();
        }
      }
      ledger.push(decision.grant);
      return { id: 'grant', granted: true };
    },
  };
  const withPlans = () =>
    new StripeService(
      new SubscriptionService(
        {
          getOrganizationByCustomerId: async (customer: string) =>
            orgOn(customer),
          getSubscriptionByCustomerId: async () => ({ provider: 'stripe' }),
        } as any,
        {} as any,
        {} as any,
        credits as any,
      ) as any,
      organizationService as any,
      { getUserById: async () => ({ email: 'a@b.co' }) } as any,
      {} as any,
      { inAppNotification: async () => ({}) } as any,
      { announce: async () => false } as any,
    );

  // Server time, faked: every grant reads the clock. Months start on the
  // 15th, n months after 15 January 2027.
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const month = (n: number) => Date.UTC(2027, n, 15, 12);
  const at = (ms: number) => mock.timers.setTime(ms);
  beforeEach(() => {
    ledger = [];
    mock.timers.enable({ apis: ['Date'], now: month(0) + HOUR });
  });
  afterEach(() => {
    mock.timers.reset();
    delete process.env.YEARLY_MONTHLY_CREDITS_FROM;
  });

  const price = (tier: string, interval: 'month' | 'year') =>
    ({
      id: `price_${tier}_${interval}`,
      product: { name: tier },
      recurring: { interval },
    }) as unknown as Stripe.Price;
  const STAMPED = { credits_schedule: 'monthly' };
  // The subscription in the period [from, to], on `tier`'s yearly price
  // unless another is given.
  const running = (
    from: number,
    to: number,
    tier: string,
    metadata: Record<string, string> = {},
    extra: Partial<Sub> = {},
    interval: 'month' | 'year' = 'year',
  ) =>
    sub('sub_y', 100, {
      metadata: { service: 'postqueen', ...metadata },
      items: {
        data: [
          {
            price: price(tier, interval),
            current_period_start: from / 1000,
            current_period_end: to / 1000,
          },
        ],
      } as any,
      ...extra,
    });
  const paid = (invoice: string) =>
    withPlans().paymentSucceeded({
      data: {
        object: {
          id: invoice,
          customer: 'cus_1',
          amount_paid: 100,
          parent: { subscription_details: { subscription: 'sub_y' } },
        },
      },
    } as unknown as Stripe.InvoicePaymentSucceededEvent);
  const daily = () =>
    withPlans().grantMissingPlanCredits({
      organizationId: 'org1',
      provider: 'stripe',
      isLifetime: false,
      subscriptionTier: 'PRO',
      createdAt: new Date(month(0)),
      organization: {
        paymentId: 'cus_1',
        isTrailing: false,
        createdAt: new Date(month(0)),
      },
    });
  const latest = () => ledger[ledger.length - 1];

  it('gives a subscription sold on v2, stamped at checkout, the v2 month', async () => {
    subs = [
      running(
        month(0),
        month(1),
        'PRO',
        { ...STAMPED, credit_pricing: 'v2' },
        {},
        'month',
      ),
    ];
    await paid('in_v2');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].amount, planCreditsOn('v2', 'PRO', 'MONTHLY'));
    assert.equal(ledger[0].amount, 600 * 100);
  });

  it('gives a new subscription its first month with the invoice, then each month the day it starts', async () => {
    subs = [running(month(0), month(12), 'PRO', STAMPED)];
    await paid('in_1');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].amount, planCredits('PRO', 'MONTHLY'));
    assert.deepEqual(ledger[0].periodEnd, new Date(month(1)));
    at(month(1) - HOUR);
    assert.equal(await daily(), false);

    for (let n = 1; n < 12; n++) {
      at(month(n) + HOUR);
      assert.equal(await daily(), true, `month ${n + 1}`);
      assert.equal(await daily(), false);
      assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
      assert.equal(
        latest().externalRef,
        `period:sub_y:${new Date(month(n)).toISOString()}`,
      );
      // one month's credits in force at a time
      assert.deepEqual(inForce(), [latest()]);
    }
    assert.equal(ledger.length, 12);

    // The next year's first month waits for its invoice, as a new period's
    // credits always have.
    subs = [running(month(12), month(24), 'PRO', STAMPED)];
    at(month(12) + HOUR);
    assert.equal(await daily(), false);
    await paid('in_2');
    assert.equal(ledger.length, 13);
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
    assert.deepEqual(inForce(), [latest()]);
  });

  it('leaves a monthly plan as it was: its renewal waits out the grace days for the invoice', async () => {
    subs = [running(month(0), month(1), 'PRO', STAMPED, {}, 'month')];
    await paid('in_1');
    assert.equal(ledger[0].amount, planCredits('PRO', 'MONTHLY'));
    // renewed, its invoice not paid yet
    subs = [running(month(1), month(2), 'PRO', STAMPED, {}, 'month')];
    at(month(1) + HOUR);
    assert.equal(await daily(), false);
    at(month(1) + 2 * DAY);
    assert.equal(await daily(), false);
    // past them, the daily pass steps in, keyed by the period as before
    at(month(1) + 3 * DAY + HOUR);
    assert.equal(await daily(), true);
    assert.equal(latest().externalRef, `period:sub_y:${month(1) / 1000}`);
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
  });

  it('keeps a subscription sold before with its year up front while YEARLY_MONTHLY_CREDITS_FROM is unset', async () => {
    subs = [running(month(0), month(12), 'PRO')];
    await paid('in_1');
    assert.equal(ledger[0].amount, planCredits('PRO', 'YEARLY'));
    at(month(5) + HOUR);
    assert.equal(await daily(), false);
    subs = [running(month(12), month(24), 'PRO')];
    at(month(12) + HOUR);
    await paid('in_2');
    assert.equal(latest().amount, planCredits('PRO', 'YEARLY'));
  });

  it('moves a subscription sold before to monthly credits from its first year that starts on or after YEARLY_MONTHLY_CREDITS_FROM', async () => {
    process.env.YEARLY_MONTHLY_CREDITS_FROM = '2027-07-01';
    subs = [running(month(0), month(12), 'PRO')];
    await paid('in_1');
    assert.equal(ledger[0].amount, planCredits('PRO', 'YEARLY'));
    // this year started before the date, so it stays as it was granted
    at(month(7) + HOUR);
    assert.equal(await daily(), false);
    assert.equal(ledger.length, 1);
    // the next one starts after it
    subs = [running(month(12), month(24), 'PRO')];
    at(month(12) + HOUR);
    await paid('in_2');
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
    at(month(13) + HOUR);
    assert.equal(await daily(), true);
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
    assert.equal(ledger.length, 3);
    // a year that starts on the date itself switches too
    process.env.YEARLY_MONTHLY_CREDITS_FROM = new Date(month(24)).toISOString();
    subs = [running(month(24), month(36), 'PRO')];
    at(month(24) + HOUR);
    await paid('in_3');
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
  });

  it('keeps a subscription sold before on a year up front when it is upgraded, and at its next renewal', async () => {
    subs = [running(month(0), month(12), 'CREATOR')];
    await paid('in_1');
    assert.equal(ledger[0].amount, planCredits('CREATOR', 'YEARLY'));
    // upgraded mid-year: the year is topped up, as it always was
    subs = [running(month(0), month(12), 'PRO')];
    at(month(6) + HOUR);
    assert.equal(await daily(), false);
    await paid('in_2');
    const left =
      (planCredits('PRO', 'YEARLY') - planCredits('CREATOR', 'YEARLY')) *
      ((month(12) - Date.now()) / (month(12) - month(0)));
    assert.ok(Math.abs(latest().amount - left) <= 1, `${latest().amount} vs ${left}`);
    assert.deepEqual(latest().periodEnd, new Date(month(12)));
    at(month(7) + HOUR);
    assert.equal(await daily(), false);
    // and the next year comes whole, on the higher plan
    subs = [running(month(12), month(24), 'PRO')];
    at(month(12) + HOUR);
    await paid('in_3');
    assert.equal(latest().amount, planCredits('PRO', 'YEARLY'));
    assert.equal(ledger.length, 3);
  });

  it('keeps a subscription sold before on a year up front when it switches from monthly to yearly', async () => {
    subs = [running(month(0), month(1), 'CREATOR', {}, {}, 'month')];
    await paid('in_1');
    at(month(0) + 10 * DAY);
    subs = [running(month(0) + 10 * DAY, month(12) + 10 * DAY, 'PRO')];
    await paid('in_2');
    assert.equal(latest().amount, planCredits('PRO', 'YEARLY'));
    assert.deepEqual(inForce(), [latest()]);
  });

  it('never adds a month on top of a year granted whole, and tops an upgrade on it up as before', async () => {
    subs = [running(month(0), month(12), 'CREATOR')];
    await paid('in_1');
    assert.equal(ledger[0].amount, planCredits('CREATOR', 'YEARLY'));
    // YEARLY_MONTHLY_CREDITS_FROM set after this year was granted whole
    process.env.YEARLY_MONTHLY_CREDITS_FROM = new Date(month(0)).toISOString();
    subs = [running(month(0), month(12), 'PRO')];
    at(month(6) + HOUR);
    assert.equal(await daily(), false);
    await paid('in_2');
    assert.equal(ledger.length, 2);
    assert.deepEqual(latest().periodEnd, new Date(month(12)));
    const left =
      (planCredits('PRO', 'YEARLY') - planCredits('CREATOR', 'YEARLY')) *
      ((month(12) - Date.now()) / (month(12) - month(0)));
    assert.ok(Math.abs(latest().amount - left) <= 1, `${latest().amount} vs ${left}`);
    at(month(7) + HOUR);
    assert.equal(await daily(), false);
    assert.equal(ledger.length, 2);
  });

  it('tops an upgrade in the middle of a month up by that month only', async () => {
    subs = [running(month(0), month(12), 'CREATOR', STAMPED)];
    await paid('in_1');
    at(month(3) + HOUR);
    await daily();
    at((month(3) + month(4)) / 2);
    subs = [running(month(0), month(12), 'PRO', STAMPED)];
    await paid('in_2');
    const half =
      (planCredits('PRO', 'MONTHLY') - planCredits('CREATOR', 'MONTHLY')) / 2;
    assert.ok(Math.abs(latest().amount - half) <= 1, `${latest().amount} vs ${half}`);
    assert.deepEqual(latest().periodEnd, new Date(month(4)));
    // the next month is the new plan's, whole
    at(month(4) + HOUR);
    assert.equal(await daily(), true);
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
  });

  it('gives a plan already running a month, and starts the year after a downgrade on the lower plan', async () => {
    subs = [running(month(0), month(12), 'PRO', STAMPED)];
    // nothing granted yet: a month, not the eleven left
    at(month(11) + HOUR);
    assert.equal(await daily(), true);
    assert.equal(ledger[0].amount, planCredits('PRO', 'MONTHLY'));
    // scheduled down to Creator, which starts with the renewal
    subs = [running(month(12), month(24), 'CREATOR', STAMPED)];
    at(month(12) + HOUR);
    await paid('in_2');
    assert.equal(latest().tier, 'CREATOR');
    assert.equal(latest().amount, planCredits('CREATOR', 'MONTHLY'));
    assert.deepEqual(inForce(), [latest()]);
  });

  it('gives a subscription sold since a month at a time when it switches to yearly, however Stripe bills it', async () => {
    const monthly = () =>
      running(month(0), month(1), 'CREATOR', STAMPED, {}, 'month');
    // Classic billing restarts the period at the switch: its first month
    // replaces what the monthly plan left.
    subs = [monthly()];
    await paid('in_1');
    at(month(0) + 10 * DAY);
    subs = [running(month(0) + 10 * DAY, month(12) + 10 * DAY, 'PRO', STAMPED)];
    await paid('in_2');
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
    assert.deepEqual(latest().periodEnd, new Date(month(1) + 10 * DAY));
    assert.deepEqual(inForce(), [latest()]);

    // Flexible billing keeps the period's start: the month is the one already
    // granted, so only the higher plan's difference is added for what is left.
    ledger = [];
    at(month(0) + HOUR);
    subs = [monthly()];
    await paid('in_3');
    at(month(0) + 10 * DAY);
    subs = [running(month(0), month(12), 'PRO', STAMPED)];
    await paid('in_4');
    const left =
      (planCredits('PRO', 'MONTHLY') - planCredits('CREATOR', 'MONTHLY')) *
      ((month(1) - Date.now()) / (month(1) - month(0)));
    assert.equal(ledger.length, 2);
    assert.ok(Math.abs(latest().amount - left) <= 1, `${latest().amount} vs ${left}`);
    assert.deepEqual(latest().periodEnd, new Date(month(1)));
  });

  it('gives a trial one month, then the first month when it converts to yearly', async () => {
    subs = [
      running(month(0), month(0) + 7 * DAY, 'PRO', STAMPED, {
        status: 'trialing',
        trial_start: month(0) / 1000,
        trial_end: (month(0) + 7 * DAY) / 1000,
      }),
    ];
    assert.equal(await daily(), true);
    assert.equal(ledger[0].source, 'trial');
    assert.equal(ledger[0].amount, planCredits('PRO', 'MONTHLY'));
    subs = [running(month(0) + 7 * DAY, month(12) + 7 * DAY, 'PRO', STAMPED)];
    at(month(0) + 7 * DAY + HOUR);
    await paid('in_1');
    assert.equal(latest().source, 'plan');
    assert.equal(latest().amount, planCredits('PRO', 'MONTHLY'));
    assert.deepEqual(inForce(), [latest()]);
  });
});

describe('ending a trial early', () => {
  const invoiceMethods = Object.getPrototypeOf(probe.invoices);
  const saved = {
    retrieve: invoiceMethods.retrieve,
    pay: invoiceMethods.pay,
    list: invoiceMethods.list,
  };
  let latest: Partial<Stripe.Invoice> | undefined;
  // Subscriptions that have taken money (`hasPaidInvoice`).
  let paidBefore: string[];
  before(() => {
    invoiceMethods.retrieve = record('invoices.retrieve', (id) =>
      latest?.id === id ? latest : undefined,
    );
    invoiceMethods.pay = record('invoices.pay', () => ({}));
    invoiceMethods.list = record('invoices.list', ({ subscription }) => ({
      data: paidBefore.includes(subscription)
        ? [{ id: 'in_paid', status: 'paid', total: 4900 }]
        : [],
    }));
  });
  after(() => {
    Object.assign(invoiceMethods, saved);
  });
  beforeEach(() => {
    latest = undefined;
    paidBefore = [];
  });

  const org = { paymentId: 'cus_1' } as any;
  const trialing = () =>
    sub('sub_trial', 100, { status: 'trialing', latest_invoice: 'in_1' as any });
  const invoice = (
    status: Stripe.Invoice.Status,
    intent?: Partial<Stripe.PaymentIntent>,
  ) =>
    ({
      id: 'in_1',
      status,
      hosted_invoice_url: 'https://invoice.stripe.test/in_1',
      payments: {
        data: intent ? [{ payment: { payment_intent: intent } }] : [],
      },
    }) as unknown as Partial<Stripe.Invoice>;

  it('ends it in Stripe and reports a first payment that went through', async () => {
    subs = [trialing()];
    latest = invoice('paid', { status: 'succeeded', client_secret: 'pi_s' });
    const result = await service().finishTrial(org);

    assert.deepEqual(result, { ended: true });
    assert.deepEqual(called('subscriptions.update'), [
      ['sub_trial', { trial_end: 'now' }],
    ]);
    assert.deepEqual(called('invoices.retrieve'), [
      ['in_1', { expand: ['payments.data.payment.payment_intent'] }],
    ]);
  });

  it('hands a bank check to the browser, with the client secret', async () => {
    subs = [trialing()];
    latest = invoice('open', {
      status: 'requires_action',
      client_secret: 'pi_secret',
    });
    const result = await service().finishTrial(org);

    assert.deepEqual(result, {
      ended: true,
      requiresAction: true,
      clientSecret: 'pi_secret',
      invoiceUrl: 'https://invoice.stripe.test/in_1',
    });
  });

  it('says declined, never ended, when the card is refused', async () => {
    subs = [trialing()];
    latest = invoice('open', {
      status: 'requires_payment_method',
      client_secret: 'pi_secret',
    });
    const result = await service().finishTrial(org);

    assert.deepEqual(result, {
      ended: false,
      declined: true,
      invoiceUrl: 'https://invoice.stripe.test/in_1',
    });
  });

  it('reports a payment nobody confirmed as not gone through, not as a bank check', async () => {
    subs = [trialing()];
    latest = invoice('open', {
      status: 'requires_confirmation',
      client_secret: 'pi_secret',
    });
    const result = await service().finishTrial(org);

    assert.deepEqual(result, {
      ended: false,
      declined: true,
      invoiceUrl: 'https://invoice.stripe.test/in_1',
    });
  });

  it('answers declined again when asked after the decline, and pays nothing', async () => {
    subs = [
      sub('sub_trial', 100, {
        status: 'past_due',
        latest_invoice: 'in_1' as any,
      }),
    ];
    latest = invoice('open', { status: 'requires_payment_method' });
    const result = await service().finishTrial(org);

    assert.deepEqual(result, {
      ended: false,
      declined: true,
      invoiceUrl: 'https://invoice.stripe.test/in_1',
    });
    assert.equal(called('subscriptions.update').length, 0);
    assert.equal(called('invoices.pay').length, 0);
  });

  it('hands the bank check over again when asked before it was done', async () => {
    subs = [
      sub('sub_trial', 100, {
        status: 'past_due',
        latest_invoice: 'in_1' as any,
      }),
    ];
    latest = invoice('open', {
      status: 'requires_action',
      client_secret: 'pi_secret',
    });
    const result = await service().finishTrial(org);

    assert.equal((result as any).requiresAction, true);
    assert.equal((result as any).clientSecret, 'pi_secret');
    assert.equal(called('subscriptions.update').length, 0);
    assert.equal(called('invoices.pay').length, 0);
  });

  it('leaves a past-due renewal alone: it is not a trial', async () => {
    paidBefore = ['sub_due'];
    subs = [
      sub('sub_due', 100, {
        status: 'past_due',
        latest_invoice: 'in_1' as any,
      }),
    ];
    latest = invoice('open', { status: 'requires_payment_method' });
    const result = await service().finishTrial(org);

    assert.deepEqual(result, { ended: false });
    assert.equal(called('subscriptions.update').length, 0);
    assert.equal(called('invoices.pay').length, 0);
    assert.equal(called('invoices.retrieve').length, 0);
  });

  it('has nothing to end for an organization with no Stripe customer', async () => {
    const result = await service().finishTrial({ paymentId: null } as any);

    assert.deepEqual(result, { ended: false });
    assert.equal(calls.length, 0);
  });
});

describe('the next charge', () => {
  const period = (end: number) =>
    ({ data: [{ price: proPrice, current_period_end: end }] }) as any;

  it('is the end of the period of a paid plan', async () => {
    subs = [sub('sub_paid', 100, { items: period(5_000) })];

    assert.deepEqual(await service().getRenewalDate('org1'), {
      renewsAt: 5_000,
      trialing: false,
    });
  });

  it('is the end of the trial while trialing', async () => {
    subs = [
      sub('sub_trial', 100, {
        status: 'trialing',
        trial_end: 3_000,
        items: period(9_000),
      }),
    ];

    assert.deepEqual(await service().getRenewalDate('org1'), {
      renewsAt: 3_000,
      trialing: true,
    });
  });

  it('is read from the subscription a duplicate is cancelled in favour of', async () => {
    subs = [
      sub('sub_trial', 200, {
        status: 'trialing',
        trial_end: 3_000,
        items: period(9_000),
      }),
      sub('sub_paid', 300, { items: period(5_000) }),
      sub('sub_old_paid', 100, { items: period(7_000) }),
    ];

    assert.deepEqual(await service().getRenewalDate('org1'), {
      renewsAt: 7_000,
      trialing: false,
    });
  });

  it('is unknown for a plan set to end', async () => {
    subs = [
      sub('sub_ending', 100, {
        cancel_at_period_end: true,
        items: period(5_000),
      }),
    ];
    assert.deepEqual(await service().getRenewalDate('org1'), {
      renewsAt: null,
      trialing: false,
    });

    subs = [sub('sub_cancel_at', 100, { cancel_at: 5_000, items: period(5_000) })];
    assert.deepEqual(await service().getRenewalDate('org1'), {
      renewsAt: null,
      trialing: false,
    });
  });

  it('is unknown for a payment that failed, and for no customer', async () => {
    subs = [sub('sub_due', 100, { status: 'past_due', items: period(5_000) })];
    assert.deepEqual(await service().getRenewalDate('org1'), {
      renewsAt: null,
      trialing: false,
    });

    orgCustomer = '';
    calls = [];
    assert.deepEqual(await service().getRenewalDate('org1'), {
      renewsAt: null,
      trialing: false,
    });
    assert.equal(called('subscriptions.list').length, 0);
  });
});

describe('the Meta pixel conversion', () => {
  let tracked: unknown[][];
  const tracking = (track?: () => Promise<void>) =>
    new StripeService(
      subscriptionService as any,
      organizationService as any,
      {
        getUserById: async () => ({
          id: 'user1',
          email: 'a@b.co',
          ip: '203.0.113.1',
          agent: 'Mozilla/5.0',
        }),
      } as any,
      {
        track:
          track ||
          (async (...args: unknown[]) => {
            tracked.push(args);
          }),
      } as any,
      { inAppNotification: async () => ({}) } as any,
      { announce: async () => false } as any,
    ) as any;
  const subscription = (metadata: Record<string, string>) =>
    sub('sub_px', 100, { metadata: { userId: 'user1', ...metadata } });
  const invoice = (id: string, amount_paid: number, created = 500) =>
    ({ id, amount_paid, created, currency: 'usd' }) as Stripe.Invoice;

  beforeEach(() => {
    tracked = [];
    process.env.FACEBOOK_PIXEL_ACCESS_TOKEN = 'token';
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL = '123';
  });
  afterEach(() => {
    delete process.env.FACEBOOK_PIXEL_ACCESS_TOKEN;
    delete process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;
  });

  it('asks Stripe and the database nothing while the pixel is off', async () => {
    delete process.env.FACEBOOK_PIXEL_ACCESS_TOKEN;
    subscriptionInvoices = [invoice('in_first', 4900)];
    await tracking().trackConversion(
      invoice('in_first', 4900),
      subscription({ service: 'postqueen' }),
    );

    assert.equal(called('invoices.list').length, 0);
    assert.equal(tracked.length, 0);
  });

  it('is sent for the first paid invoice, with the checkout cookies', async () => {
    subscriptionInvoices = [invoice('in_first', 4900)];
    await tracking().trackConversion(
      invoice('in_first', 4900),
      subscription({ service: 'postqueen', fbc: 'fb.1.1.abc', fbp: 'fb.1.2.def' }),
    );

    assert.equal(tracked.length, 1);
    const [eventId, ip, agent, , additional, fbc, , fbp] = tracked[0];
    assert.deepEqual(
      [eventId, ip, agent, additional, fbc, fbp],
      [
        'in_first',
        '203.0.113.1',
        'Mozilla/5.0',
        { value: 49, currency: 'usd' },
        'fb.1.1.abc',
        'fb.1.2.def',
      ],
    );
  });

  it('is not sent for a renewal, a $0 invoice or another service', async () => {
    subscriptionInvoices = [invoice('in_first', 4900, 100), invoice('in_renewal', 4900)];
    await tracking().trackConversion(
      invoice('in_renewal', 4900),
      subscription({ service: 'postqueen' }),
    );
    await tracking().trackConversion(
      invoice('in_trial', 0),
      subscription({ service: 'postqueen' }),
    );
    subscriptionInvoices = [];
    await tracking().trackConversion(
      invoice('in_other', 4900),
      subscription({ service: 'redsim' }),
    );

    assert.equal(tracked.length, 0);
  });

  it('never fails the webhook when tracking does', async () => {
    subscriptionInvoices = [invoice('in_first', 4900)];
    await assert.doesNotReject(
      tracking(async () => {
        throw new Error('Meta is down');
      }).trackConversion(
        invoice('in_first', 4900),
        subscription({ service: 'postqueen' }),
      ),
    );
  });
});
