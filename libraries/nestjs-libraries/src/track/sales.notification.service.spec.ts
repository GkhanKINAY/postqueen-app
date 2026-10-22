import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  SaleNotification,
  SalesNotificationService,
} from './sales.notification.service.ts';

const sale = (extra: Partial<SaleNotification> = {}): SaleNotification => ({
  kind: 'subscription',
  product: 'Pro · Monthly',
  amount: 6076,
  currency: 'usd',
  tax: 1176,
  fee: 150,
  country: 'DE',
  paymentNumber: 1,
  ...extra,
});

const card = (extra: Partial<SaleNotification> = {}) =>
  new SalesNotificationService().card(sale(extra));
const field = (c: ReturnType<typeof card>, title: string) =>
  c.attachments[0].fields.find((f) => f.title === title)?.value;

describe('the sales card', () => {
  it('keeps what is left after tax and the Stripe fee', () => {
    const c = card();
    assert.match(c.text, /\*A customer\* subscribed to \*Pro · Monthly\* · 1st payment · 🇩🇪/);
    assert.match(c.text, /Customer paid \*\$60\.76\*  →  we keep \*\$47\.50\*/);
    assert.match(field(c, 'Money')!, /Price: \$49\.00/);
    assert.equal(field(c, 'Country'), '🇩🇪 Germany');
  });

  it('says the fee is still to come rather than counting it as zero', () => {
    const c = card({ fee: null });
    assert.match(c.text, /we keep \*\$49\.00\* _\(before Stripe fee\)_/);
    assert.match(field(c, 'Money')!, /Stripe fee: not read yet/);
  });

  it('carries no name, address, workspace, sign-up date or Stripe link', () => {
    // What the card used to take, passed anyway: none of it may reach Slack.
    const c = card({
      organizationName: 'Acme',
      customerName: 'Jane Doe',
      customerEmail: 'jane.doe@example.com',
      signedUpAt: new Date('2026-01-02T00:00:00Z'),
      link: 'https://dashboard.stripe.com/invoices/in_1',
    } as Partial<SaleNotification>);
    const all = JSON.stringify(c);
    for (const leak of ['Acme', 'Jane', 'jane.doe', '2026-01-02', 'signed up', 'stripe.com']) {
      assert.ok(!all.includes(leak), leak);
    }
    assert.deepEqual(
      c.attachments[0].fields.map((f) => f.title),
      ['Product', 'Money', 'Country', 'Buyer'],
    );
  });

  it('keeps the plan, the amount, the country and where the buyer came from', () => {
    const c = card({
      business: true,
      attribution: {
        source: 'google',
        medium: 'cpc',
        campaign: 'launch',
        referrer: 'news.ycombinator.com',
      },
    });
    assert.equal(field(c, 'Product'), 'Pro · Monthly');
    assert.equal(field(c, 'Country'), '🇩🇪 Germany');
    assert.equal(field(c, 'Customer'), 'Business (tax ID on the invoice)');
    assert.equal(field(c, 'Source'), '`google / cpc / launch`');
    assert.equal(field(c, 'Referrer'), 'news.ycombinator.com');
  });

  it('escapes what a stranger wrote into the link', () => {
    const c = card({
      attribution: { source: '<!channel>', medium: 'a`b', campaign: 'x&y' },
    });
    assert.equal(field(c, 'Source'), "`&lt;!channel&gt; / a'b / x&amp;y`");
  });

  it('leaves the source out when nothing was recorded', () => {
    assert.equal(field(card(), 'Source'), undefined);
  });

  it('reports a refund as money going back, with no payment number', () => {
    const c = card({ kind: 'refund', amount: 4900, reason: 'Fully refunded' });
    assert.match(c.text, /was refunded for/);
    assert.match(c.text, /\*\$49\.00\* back to the customer/);
    assert.ok(!c.text.includes('1st payment'));
    assert.equal(field(c, 'Money'), undefined);
    assert.equal(field(c, 'Reason'), 'Fully refunded');
  });

  it('gives a dispute the reason Stripe filed it under', () => {
    const c = card({ kind: 'dispute', amount: 4900, reason: 'product not received' });
    assert.match(c.text, /\*A customer\* disputed a payment for/);
    assert.equal(field(c, 'Reason'), 'product not received');
  });
});

describe('posting it', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.SLACK_SALES_WEBHOOK_URL;
  });

  it('does nothing without a webhook', async () => {
    globalThis.fetch = (async () => {
      throw new Error('should not be called');
    }) as any;
    assert.equal(await new SalesNotificationService().announce(sale()), false);
  });

  it('reads what Slack answered instead of trusting the request', async () => {
    process.env.SLACK_SALES_WEBHOOK_URL = 'https://hooks.slack.invalid/x';
    globalThis.fetch = (async () =>
      new Response('channel_not_found', { status: 404 })) as any;
    assert.equal(await new SalesNotificationService().announce(sale()), false);
    globalThis.fetch = (async () => new Response('ok')) as any;
    assert.equal(await new SalesNotificationService().announce(sale()), true);
  });

  it('never throws when Slack cannot be reached', async () => {
    process.env.SLACK_SALES_WEBHOOK_URL = 'https://hooks.slack.invalid/x';
    globalThis.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as any;
    assert.equal(await new SalesNotificationService().announce(sale()), false);
  });
});
