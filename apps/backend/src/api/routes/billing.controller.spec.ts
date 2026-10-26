import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

// Billing is on for these: both keys are set, and neither is a real key.
const KEYS = ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
let BillingController: any;

before(async () => {
  process.env.DATABASE_URL ||= 'postgresql://spec:spec@127.0.0.1:1/spec';
  for (const k of KEYS) {
    process.env[k] = 'spec';
  }
  ({ BillingController } = await import('./billing.controller.ts'));
});
after(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
});

let cleared: string[];
beforeEach(() => {
  for (const k of KEYS) {
    process.env[k] = 'spec';
  }
  cleared = [];
});

const org = { id: 'org-1', paymentId: 'cus_1' };

// Only what the routes under test reach; anything else would throw.
const make = (provider: Record<string, unknown>) =>
  new BillingController(
    {},
    {},
    {},
    {
      endTrial: async (id: string) => {
        cleared.push(id);
      },
    },
    { getProviderForOrganization: async () => provider },
    // Not a founding member: there is no fee to capture.
    { captureFoundingLifetimeIfDue: async () => ({}) },
    {}
  );

describe('ending a trial from Billing', () => {
  it('reports a declined first payment and leaves the trial flag to the webhook', async () => {
    const result = await make({
      finishTrial: async () => ({
        ended: false,
        declined: true,
        invoiceUrl: 'https://invoice.stripe.test/in_1',
      }),
    }).finishTrial(org);

    assert.deepEqual(result, {
      finish: false,
      declined: true,
      captureBlocked: false,
      invoiceUrl: 'https://invoice.stripe.test/in_1',
    });
    assert.deepEqual(cleared, []);
  });

  it('hands a bank check to the browser and clears nothing itself', async () => {
    const result = await make({
      finishTrial: async () => ({
        ended: true,
        requiresAction: true,
        clientSecret: 'pi_secret',
        invoiceUrl: 'https://invoice.stripe.test/in_1',
      }),
    }).finishTrial(org);

    assert.deepEqual(result, {
      finish: true,
      captureBlocked: false,
      requiresAction: true,
      clientSecret: 'pi_secret',
      invoiceUrl: 'https://invoice.stripe.test/in_1',
    });
    assert.deepEqual(cleared, []);
  });

  it('leaves a trial Stripe ended to the webhook', async () => {
    const result = await make({
      finishTrial: async () => ({ ended: true }),
    }).finishTrial(org);

    assert.deepEqual(result, { finish: true, captureBlocked: false });
    assert.deepEqual(cleared, []);
  });

  it('clears the flag itself when Stripe had no trial to end', async () => {
    await make({ finishTrial: async () => ({ ended: false }) }).finishTrial(
      org
    );

    assert.deepEqual(cleared, ['org-1']);
  });
});

describe('the next charge, from Billing', () => {
  it('is null with billing off, without asking a provider', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const result = await make({
      getRenewalDate: async () => {
        throw new Error('no provider is asked');
      },
    }).getRenewal(org);

    assert.equal(result, null);
  });

  it("is the organization's provider's answer", async () => {
    const result = await make({
      getRenewalDate: async (id: string) => ({
        renewsAt: id === 'org-1' ? 3_000 : null,
        trialing: true,
      }),
    }).getRenewal(org);

    assert.deepEqual(result, { renewsAt: 3_000, trialing: true });
  });

  it('is null for a plan no web provider charges, instead of a 400', async () => {
    const controller = new BillingController(
      {},
      {},
      {},
      {},
      {
        getProviderForOrganization: async () => {
          throw new Error('Payment provider manual not found');
        },
      },
      {},
      {}
    );

    assert.equal(await controller.getRenewal(org), null);
  });
});
