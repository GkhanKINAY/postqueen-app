import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HttpException } from '@nestjs/common';
import { CreditsService } from './credits.service.ts';
import { insufficientCredits } from './credits.repository.ts';
import { CREDIT_PACK_MONTHS, CREDIT_PACKS } from '../subscriptions/pricing.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const repository = read('./credits.repository.ts');
const schema = read('../schema.prisma');
const migration = read('../migrations/20260926120000_credit_balance/migration.sql');
const databaseModule = read('../database.module.ts');
const stripe = read('../../../services/stripe.service.ts');
const buyCreditsDto = read('../../../dtos/billing/buy.credits.dto.ts');
const between = (text: string, from: string, to: string) =>
  text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));

// The service with its repository faked. The ledger arithmetic itself runs in
// Postgres under the lock, so it is exercised against a database, not here.
let calls: unknown[][];
let charged: boolean;
let balance: number;

const service = () =>
  new CreditsService({
    balance: async () => ({ balance, expiring: null }),
    spend: async (org: string, spend: { key: string }) => {
      calls.push(['spend', org, spend.key]);
      return { id: 'spend-1', charged };
    },
    refund: async (org: string, key: string) => {
      calls.push(['refund', org, key]);
      return true;
    },
    grant: async (org: string) => {
      calls.push(['grant', org]);
      return { id: 'grant-1', granted: true };
    },
  } as any);

const KEYS = ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
const billing = (on: boolean) => {
  for (const key of KEYS) {
    if (on) {
      process.env[key] = `${key}-spec`;
    } else {
      delete process.env[key];
    }
  }
};

beforeEach(() => {
  calls = [];
  charged = true;
  balance = 0;
  billing(true);
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

const spend = { key: 'image:1', amount: 100, action: 'image' };

describe('withCredits', () => {
  it('charges before the work and keeps the charge when it succeeds', async () => {
    const value = await service().withCredits('org-1', spend, async () => {
      calls.push(['work']);
      return 'done';
    });
    assert.equal(value, 'done');
    assert.deepEqual(calls, [['spend', 'org-1', 'image:1'], ['work']]);
  });

  it('hands its own charge back when the work throws', async () => {
    await assert.rejects(
      service().withCredits('org-1', spend, async () => {
        throw new Error('provider down');
      }),
      /provider down/
    );
    assert.deepEqual(calls, [
      ['spend', 'org-1', 'image:1'],
      ['refund', 'org-1', 'image:1'],
    ]);
  });

  it('charges nothing for work that costs nothing', async () => {
    assert.deepEqual(
      await service().spend('org-1', { key: 'free:1', amount: 0, action: 'video' }),
      { id: null, charged: false }
    );
    assert.equal(
      await service().withCredits('org-1', { key: 'free:2', amount: 0, action: 'video' }, async () => 'made'),
      'made'
    );
    assert.deepEqual(calls, []);
  });

  it('never refunds a charge an earlier attempt made', async () => {
    charged = false;
    await assert.rejects(
      service().withCredits('org-1', spend, async () => {
        throw new Error('retry failed');
      }),
      /retry failed/
    );
    assert.deepEqual(calls, [['spend', 'org-1', 'image:1']]);
  });
});

describe('assertAvailable', () => {
  it('answers 402 with what it costs and what is left', async () => {
    balance = 50;
    await assert.rejects(service().assertAvailable('org-1', 100), (err) => {
      assert.ok(err instanceof HttpException);
      assert.equal(err.getStatus(), 402);
      assert.deepEqual(err.getResponse(), {
        statusCode: 402,
        message: 'Not enough credits: this costs 1 and the balance is 0.5.',
        code: 'insufficient_credits',
        required: 1,
        balance: 0.5,
      });
      return true;
    });
    await service().assertAvailable('org-1', 50);
  });

  it('shows a negative balance as it is', () => {
    const body = insufficientCredits(40, -250).getResponse() as any;
    assert.equal(body.balance, -2.5);
    assert.match(body.message, /costs 0\.4 and the balance is -2\.5\./);
  });
});

describe('Billing off', () => {
  it('meters nothing: unlimited, no spend, no grant, no refusal', async () => {
    billing(false);
    assert.deepEqual(await service().balance('org-1'), {
      unlimited: true,
      balance: null,
      expiring: null,
    });
    assert.deepEqual(await service().spend('org-1', spend), {
      id: null,
      charged: false,
    });
    assert.deepEqual(await service().grant('org-1', { source: 'plan', amount: 100 }), {
      id: null,
      granted: false,
    });
    await service().assertAvailable('org-1', 1000000);
    assert.equal(
      await service().withCredits('org-1', spend, async () => 'free'),
      'free'
    );
    assert.deepEqual(calls, []);
  });

  it('reads the balance in credits, not hundredths', async () => {
    balance = 1234;
    assert.deepEqual(await service().balance('org-1'), {
      unlimited: false,
      balance: 12.34,
      expiring: null,
    });
  });
});

describe('Ledger', () => {
  it('locks per organization, once for every write', () => {
    assert.match(
      repository,
      /pg_advisory_xact_lock\(hashtext\(\$\{`credits:\$\{organizationId\}`\}\)\)/
    );
    // spend, refund, grant, revokeGrants and revokeByPaymentRef each take it
    // first thing in their transaction, and nothing else opens one
    assert.equal(
      (repository.match(/\$transaction\(async \(tx\) => \{\n\s+await this\.lock\(tx, organizationId\);/g) || []).length,
      5
    );
    assert.equal((repository.match(/\$transaction\(/g) || []).length, 5);
  });

  it('refuses amounts that are not positive whole hundredths', () => {
    assert.match(repository, /!Number\.isInteger\(amount\) \|\| amount <= 0/);
    assert.match(repository, /async spend\([^)]*\) \{\n\s+assertAmount\(spend\.amount\);/);
    assert.match(repository, /async grant\([^)]*\) \{\n\s+assertAmount\(grant\.amount\);/);
  });

  it('gives nothing back for a revoked grant on refund', () => {
    assert.match(repository, /if \(!grant \|\| grant\.revokedAt\) \{\n\s+continue;/);
  });

  it('keys spends per organization and never lets a paying grant be deleted', () => {
    assert.match(schema, /@@unique\(\[organizationId, idempotencyKey\]\)/);
    assert.match(
      schema,
      /grant\s+CreditGrant\?\s+@relation\(fields: \[grantId\], references: \[id\], onDelete: Restrict\)/
    );
    assert.match(
      migration,
      /CREATE UNIQUE INDEX IF NOT EXISTS "Credits_organizationId_idempotencyKey_key" ON "Credits"\("organizationId", "idempotencyKey"\);/
    );
    assert.match(
      migration,
      /REFERENCES "CreditGrant"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE;/
    );
  });

  it('adds to the database without changing what is there', () => {
    assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|UPDATE "|DELETE FROM|ALTER COLUMN/);
    assert.match(migration, /ALTER TABLE "Credits" ADD COLUMN IF NOT EXISTS "action" TEXT,/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS "CreditGrant"/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS "CreditAllocation"/);
  });

  it('registers the service and repository', () => {
    assert.match(databaseModule, /\n\s+CreditsService,\n\s+CreditsRepository,\n/);
  });
});

describe('Credits packs', () => {
  it('cost less a credit the larger they are, in whole dollars', () => {
    const perCredit = CREDIT_PACKS.map((pack) => pack.price / pack.credits);
    assert.deepEqual([...perCredit].sort((a, b) => b - a), perCredit);
    assert.ok(CREDIT_PACKS.every((pack) => Number.isInteger(pack.price)));
    assert.equal(CREDIT_PACK_MONTHS, 12);
  });

  it('are told apart from a founding-member payment before it is granted', () => {
    const checkout = between(
      stripe,
      "case 'checkout.session.async_payment_succeeded':",
      "case 'invoice.payment_succeeded':"
    );
    const pack = checkout.indexOf("session?.metadata?.kind === 'credit_pack'");
    assert.ok(pack > -1 && pack < checkout.indexOf('lifetime_deferred'));
    assert.ok(pack < checkout.indexOf('grantLifetimeFromPayment'));
  });

  it('grant once per checkout, only when paid, for the months a pack lasts', () => {
    const grant = between(stripe, 'private async grantCreditPack(', 'private async revokeCreditPackOfCharge(');
    assert.match(grant, /if \(session\.payment_status !== 'paid'\) \{/);
    assert.match(grant, /externalRef: session\.id,/);
    assert.match(grant, /dayjs\(\)\.add\(CREDIT_PACK_MONTHS, 'month'\)/);
  });

  it('are sold without promotion codes, tagged on the payment as well', () => {
    const sell = between(stripe, 'async createCreditPackCheckout(', 'private async grantCreditPack(');
    assert.match(sell, /allow_promotion_codes: false,/);
    assert.match(sell, /payment_intent_data: \{ metadata \},/);
    assert.match(sell, /withdrawal_waiver_at: new Date\(\)\.toISOString\(\),/);
  });

  it('go back on a refund or a dispute before anything can end the plan', () => {
    for (const [from, to] of [
      ['async disputeCreated(', 'async chargeRefunded('],
      ['async chargeRefunded(', 'async hasFailedPayment('],
    ]) {
      const handler = between(stripe, from, to);
      const pack = handler.indexOf('await this.revokeCreditPackOfCharge(charge)');
      assert.ok(pack > -1, from);
      assert.ok(pack < handler.indexOf('cancelSubscriptionOfCharge'), from);
      assert.ok(pack < handler.indexOf('revokeLocalSubscription'), from);
    }
    // only a payment this app tagged as a pack
    assert.match(stripe, /intent\.metadata\?\.service !== SUBSCRIPTION_SERVICE_TAG \|\|\n\s+intent\.metadata\?\.kind !== 'credit_pack'/);
  });
});

describe('Withdrawal waiver', () => {
  it('is required for a pack, and for a yearly plan before anything reaches Stripe', () => {
    assert.match(buyCreditsDto, /@Equals\(true\)\n\s+withdrawalWaiver: true;/);
    assert.match(stripe, /if \(body\.period === 'YEARLY' && body\.withdrawalWaiver !== true\) \{/);
    // first thing in both ways a plan is bought
    for (const from of ['async embedded(', 'async subscribe(']) {
      const start = stripe.indexOf(from);
      const opening = stripe.slice(start, stripe.indexOf('{', start) + 200);
      assert.match(opening, /this\.assertWithdrawalWaiver\(body\);/, from);
    }
  });

  it('goes into Stripe as the time it was given, never as the flag', () => {
    assert.equal((stripe.match(/\.\.\.omit\(body, 'withdrawalWaiver'\),/g) || []).length, 3);
    assert.doesNotMatch(stripe, /\.\.\.body,/);
  });
});
