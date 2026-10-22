import { Injectable, Logger } from '@nestjs/common';

/**
 * Where a buyer came from, as their first visit recorded it (see UtmSaver).
 * Written by a stranger through the landing URL, so every value is escaped
 * before it reaches Slack.
 */
export interface SaleAttribution {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  referrer?: string | null;
  landing?: string | null;
}

/**
 * One money event, in a provider neutral shape. Amounts are minor units in
 * `currency`. A field that could not be read is null or absent, and the card
 * then leaves its row out rather than guessing.
 *
 * Nothing here names a person: no customer or workspace name, no email
 * address, no sign-up date, no id or Dashboard link. The card is read in Slack
 * for its amounts, and the plan, amount and time find the payment in Stripe.
 */
export interface SaleNotification {
  kind:
    | 'subscription'
    | 'trial_converted'
    | 'renewal'
    | 'upgrade'
    | 'credits'
    | 'lifetime'
    | 'refund'
    | 'dispute';
  /** What was bought: "Pro · Monthly", "500 credits", "Founding member". */
  product: string;
  amount: number;
  currency: string;
  /** Tax collected on top of the price. It is owed, not kept. */
  tax?: number | null;
  discount?: number | null;
  /** The coupon's name. Never the promotion code a customer types. */
  discountName?: string | null;
  /** The payment provider's fee. null = not read, and the card says so. */
  fee?: number | null;
  /** A tax ID is on the invoice. */
  business?: boolean;
  /** ISO 3166-1 alpha-2. */
  country?: string | null;
  /** 1 = this customer's first payment ever. */
  paymentNumber?: number | null;
  attribution?: SaleAttribution | null;
  /** Came through an affiliate link. */
  affiliate?: boolean;
  /** Refund or dispute reason, as the provider gives it. */
  reason?: string | null;
  test?: boolean;
}

const HEADLINE: Record<SaleNotification['kind'], { emoji: string; verb: string }> = {
  subscription: { emoji: ':moneybag:', verb: 'subscribed to' },
  trial_converted: { emoji: ':tada:', verb: 'converted from trial to' },
  renewal: { emoji: ':repeat:', verb: 'renewed' },
  upgrade: { emoji: ':arrow_up:', verb: 'upgraded to' },
  credits: { emoji: ':zap:', verb: 'bought' },
  lifetime: { emoji: ':crown:', verb: 'bought' },
  refund: { emoji: ':leftwards_arrow_with_hook:', verb: 'was refunded for' },
  dispute: { emoji: ':rotating_light:', verb: 'disputed a payment for' },
};

const FOOTER: Record<SaleNotification['kind'], string> = {
  subscription: 'New subscription',
  trial_converted: 'Trial conversion',
  renewal: 'Renewal',
  upgrade: 'Plan upgrade',
  credits: 'Credits pack',
  lifetime: 'Founding member',
  refund: 'Refund',
  dispute: 'Dispute',
};

/** Slack's three control characters, and backticks so a value cannot break out of a code span. */
const plain = (value?: string | null, max = 120) => {
  const text = (value || '').replace(/`/g, "'").replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  const cut = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return cut.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(minor / 100);

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${suffix}`;
};

const country = (code?: string | null) => {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) {
    return null;
  }
  const upper = code.toUpperCase();
  const flag = String.fromCodePoint(
    ...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
  let name = upper;
  try {
    name = new Intl.DisplayNames(['en'], { type: 'region' }).of(upper) || upper;
  } catch (e) {}
  return { flag, name };
};

/**
 * Posts every sale, renewal, refund and dispute to the sales channel in Slack.
 *
 * Unset `SLACK_SALES_WEBHOOK_URL` turns it off, so dev and self-hosted installs
 * need nothing. It never throws: a card that cannot be posted must not fail
 * the payment that fired it. A refusal is logged with Slack's own reason
 * ("channel_not_found", "invalid_token", "no_service"), because `fetch` only
 * rejects on a transport error and a rejected webhook would otherwise vanish
 * without a trace.
 */
@Injectable()
export class SalesNotificationService {
  async announce(sale: SaleNotification) {
    const webhookUrl = process.env.SLACK_SALES_WEBHOOK_URL;
    if (!webhookUrl) {
      return false;
    }

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.card(sale)),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const reason = await res.text().catch(() => '');
        Logger.error(
          `[sales] ${sale.kind} card REJECTED by Slack: ${res.status} ${reason.slice(0, 200)}`
        );
        return false;
      }
      return true;
    } catch (err) {
      Logger.error(
        `[sales] ${sale.kind} card not delivered: ${(err as Error)?.message || err}`
      );
      return false;
    }
  }

  card(sale: SaleNotification) {
    const lost = sale.kind === 'refund' || sale.kind === 'dispute';
    const place = country(sale.country);
    const { emoji, verb } = HEADLINE[sale.kind];

    // Line one is what happened, so a lock-screen push says it whole. Line two
    // is the single number that matters: what lands in the account.
    const chips = [
      sale.paymentNumber && !lost ? `${ordinal(sale.paymentNumber)} payment` : '',
      place ? place.flag : '',
    ].filter(Boolean);
    const first = `${sale.test ? '`[TEST]` ' : ''}${emoji} *A customer* ${verb} *${plain(
      sale.product,
      60
    )}*${chips.length ? ` · ${chips.join(' · ')}` : ''}`;

    const tax = sale.tax || 0;
    const kept = sale.amount - tax - (sale.fee || 0);
    const second = lost
      ? `*${money(sale.amount, sale.currency)}* back to the customer`
      : `Customer paid *${money(sale.amount, sale.currency)}*  →  we keep *${money(
          kept,
          sale.currency
        )}*${sale.fee == null ? ' _(before Stripe fee)_' : ''}`;

    const fields: { title: string; value: string; short: boolean }[] = [];
    const field = (title: string, value: string) =>
      value && fields.push({ title, value, short: false });

    // What sold
    field('Product', plain(sale.product, 80));

    // The money, one line per step from the price to what is kept
    if (!lost) {
      const price = sale.amount - tax + (sale.discount || 0);
      field(
        'Money',
        [
          `Price: ${money(price, sale.currency)}`,
          sale.discount
            ? `Discount: −${money(sale.discount, sale.currency)}${
                sale.discountName ? ` (${plain(sale.discountName, 40)})` : ''
              }`
            : '',
          tax ? `Tax: +${money(tax, sale.currency)} (owed, not ours)` : '',
          sale.fee == null
            ? 'Stripe fee: not read yet'
            : `Stripe fee: −${money(sale.fee, sale.currency)}`,
          `*We keep: ${money(kept, sale.currency)}*`,
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
    if (lost && sale.reason) {
      field('Reason', plain(sale.reason, 80));
    }

    // The buyer, never by name
    field('Customer', sale.business ? 'Business (tax ID on the invoice)' : '');
    field('Country', place ? `${place.flag} ${place.name}` : '');
    field(
      'Buyer',
      sale.paymentNumber ? `${ordinal(sale.paymentNumber)} payment` : ''
    );

    // From where. No row when nothing was recorded: subscriptions bought
    // before attribution was kept carry none, and "unknown" on those would
    // read as a finding.
    const a = sale.attribution || {};
    const utm = [a.source, a.medium, a.campaign]
      .map((p) => plain(p, 60))
      .filter(Boolean);
    field(
      'Source',
      [
        utm.length ? `\`${utm.join(' / ')}\`` : '',
        plain(a.content, 60) ? `content: \`${plain(a.content, 60)}\`` : '',
        plain(a.term, 60) ? `term: \`${plain(a.term, 60)}\`` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
    field('Referrer', plain(a.referrer, 80));
    field('Landing page', plain(a.landing, 80));
    field('Affiliate', sale.affiliate ? 'Dub referral' : '');

    return {
      text: `${first}\n${second}`,
      attachments: [
        {
          color: sale.test
            ? '#6b7280'
            : sale.kind === 'dispute'
            ? 'danger'
            : sale.kind === 'refund'
            ? '#f97316'
            : sale.kind === 'renewal'
            ? 'good'
            : // A new customer, a converted trial or more money from one
              '#a855f7',
          fields,
          footer: `PostQueen · ${FOOTER[sale.kind]}`,
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }
}
