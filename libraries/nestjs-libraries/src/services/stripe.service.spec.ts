import 'reflect-metadata';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import Stripe from 'stripe';
import { StripeService } from './stripe.service.ts';
import { pricing } from '../database/prisma/subscriptions/pricing.ts';

// Every Stripe call below is faked. The service built its client from the
// environment when it was imported, so a run with a live key is refused
// before any test starts, and the resources no test uses throw (below).
if (/_live_/.test(process.env.STRIPE_SECRET_KEY || '')) {
  throw new Error('Refusing to run the Stripe service tests with a live key');
}
// Billing on, for the checks that ask (`isBillingEnabled`). Read at call
// time, so this does not change the client's key.
process.env.STRIPE_SECRET_KEY ||= 'sk_test_unit_never_valid';
process.env.STRIPE_PUBLISHABLE_KEY ||= 'pk_test_unit_never_valid';

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
let failCancelAt: boolean;
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
  getSubscription: async () => null,
  checkSubscription: async () => null,
  getOrganizationByCustomerId: async () => ({ id: 'org1' }),
};
const organizationService = {
  getOrgById: async () => ({
    id: 'org1',
    paymentId: 'cus_1',
    isTrailing: false,
  }),
  getOrgByCustomerId: async () => ({ id: 'org1' }),
};

const service = () =>
  new StripeService(
    subscriptionService as any,
    organizationService as any,
    { getUserById: async () => ({ email: 'a@b.co' }) } as any,
    {} as any,
    {} as any,
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
  failCancelAt = false;
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

    assert.equal(called('subscriptions.cancel').length, 0);
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

  it('reports the cancel when only saving its date failed', async () => {
    failCancelAt = true;
    subs = [sub('sub_a', 100)];
    const result = await service().setToCancel('org1');

    assert.deepEqual(result.cancel_at, new Date(1_000_100 * 1000));
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
