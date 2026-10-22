import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HttpException } from '@nestjs/common';
import { CreditsService } from './credits.service.ts';
import { insufficientCredits } from './credits.repository.ts';
import {
  AI_FIXED_CREDIT_COSTS_PROPOSAL,
  CREDIT_PACK_MONTHS,
  CREDIT_PACKS,
  LLM_CONTINUATION_FLOOR,
  LLM_CREDIT_RATES,
  LLM_TURN_MINIMUM,
  CREDIT_PRICINGS,
  creditPricingOf,
  CURRENT_CREDIT_PRICING,
  imageCreditCost,
  llmCreditCost,
  llmCreditRate,
} from '../subscriptions/pricing.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const repository = read('./credits.repository.ts');
const schema = read('../schema.prisma');
const migration = read('../migrations/20260926120000_credit_balance/migration.sql');
const pricingMigration = read(
  '../migrations/20261023130000_subscription_credit_pricing/migration.sql'
);
const databaseModule = read('../database.module.ts');
const stripe = read('../../../services/stripe.service.ts');
const buyCreditsDto = read('../../../dtos/billing/buy.credits.dto.ts');
const between = (text: string, from: string, to: string) =>
  text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));

// The service with its repository faked. The ledger arithmetic itself runs in
// Postgres under the lock, so it is exercised against a database, not here.
let calls: unknown[][];
let spends: unknown[];
let charged: boolean;
let balance: number;
let subscription: { creditPricing: string } | null;

const service = () =>
  new CreditsService({
    balance: async () => ({ balance, expiring: null }),
    subscriptionCreditPricing: async () => subscription,
    spend: async (org: string, spend: { key: string }) => {
      calls.push(['spend', org, spend.key]);
      spends.push(spend);
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
  spends = [];
  charged = true;
  balance = 0;
  subscription = { creditPricing: 'legacy' };
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

  it("keeps the work's error when its refund cannot be written", async () => {
    const credits = service();
    (credits as any)._creditsRepository.refund = async () => {
      throw new Error('database down');
    };
    await assert.rejects(
      credits.withCredits('org-1', spend, async () => {
        throw new Error('provider down');
      }),
      /provider down/
    );
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
      creditPricing: 'legacy',
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
      creditPricing: 'legacy',
    });
  });
});

describe('Price lists', () => {
  it("reads an organization's from its subscription, today's without one", async () => {
    assert.equal(await service().creditPricing('org-1'), 'legacy');
    subscription = { creditPricing: 'v2' };
    assert.equal(await service().creditPricing('org-1'), 'v2');
    subscription = null;
    assert.equal(await service().creditPricing('org-1'), CURRENT_CREDIT_PRICING);
    assert.equal(CURRENT_CREDIT_PRICING, 'v2');
    // a value this code does not know never charges more
    assert.equal(creditPricingOf({ creditPricing: 'v9' }), 'legacy');
    assert.equal(creditPricingOf({ creditPricing: null }), 'legacy');
    assert.deepEqual([...CREDIT_PRICINGS], ['legacy', 'v2']);
  });

  it('keeps every subscription that existed before v2 on legacy, and stamps new ones', () => {
    assert.match(schema, /creditPricing\s+String\s+@default\("legacy"\)/);
    assert.match(
      pricingMigration,
      /ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "creditPricing" TEXT NOT NULL DEFAULT 'legacy';/
    );
    for (const from of ['private async createEmbeddedCheckout(', 'private async createCheckoutSession(']) {
      const checkout = between(stripe, from, 'line_items:');
      assert.ok(
        checkout.indexOf('credit_pricing: CURRENT_CREDIT_PRICING,') >
          checkout.indexOf("...omit(body, 'withdrawalWaiver'),"),
        from
      );
    }
    assert.equal(
      (stripe.match(/credit_pricing: CURRENT_CREDIT_PRICING,/g) || []).length,
      2
    );
    // a plan change keeps the stamp the subscription has
    const change = between(stripe, 'async subscribe(', 'async paymentSucceeded(');
    assert.doesNotMatch(change, /credit_pricing: CURRENT_CREDIT_PRICING/);
    assert.match(change, /credit_pricing: current\.metadata\.credit_pricing/);
  });
});

describe('Ledger', () => {
  it('locks per organization, once for every write', () => {
    assert.match(
      repository,
      /pg_advisory_xact_lock\(hashtext\(\$\{`credits:\$\{organizationId\}`\}\)\)/
    );
    // spend, refund, release, reserve, settle, grant, revokeGrants and
    // revokeByPaymentRef each take it first thing in their transaction, and
    // nothing else opens one
    assert.equal(
      (repository.match(/\$transaction\(async \(tx\) => \{\n\s+await this\.lock\(tx, organizationId\);/g) || []).length,
      8
    );
    assert.equal((repository.match(/\$transaction\(/g) || []).length, 8);
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

  it('grant once per checkout, only when paid and still paid, for the months a pack lasts', () => {
    const grant = between(stripe, 'private async grantCreditPack(', 'private async revokeCreditPackOfCharge(');
    assert.match(grant, /if \(session\.payment_status !== 'paid'\) \{/);
    assert.match(grant, /if \(charge\?\.refunded \|\| charge\?\.disputed\) \{/);
    assert.match(grant, /externalRef: session\.id, paymentRef: paymentIntent \|\| null/);
    // through the subscription service, like every other grant
    const subscription = read('../subscriptions/subscription.service.ts');
    assert.match(subscription, /source: 'topup',\n\s+amount: pack\.credits \* CREDIT_UNIT,\n\s+expiresAt: dayjs\(\)\.add\(CREDIT_PACK_MONTHS, 'month'\)\.toDate\(\),/);
    assert.doesNotMatch(stripe, /CreditsService/);
  });

  it('are sold without promotion codes, tagged on the payment as well', () => {
    const sell = between(stripe, 'async createCreditPackCheckout(', 'private async grantCreditPack(');
    assert.match(sell, /allow_promotion_codes: false,/);
    assert.match(sell, /payment_intent_data: \{ metadata \},/);
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

describe('The right of withdrawal', () => {
  it('is never asked to be given up: no pack or plan waits for a box', () => {
    assert.match(buyCreditsDto, /@IsOptional\(\)\n\s+@IsBoolean\(\)\n\s+withdrawalWaiver\?: boolean;/);
    assert.doesNotMatch(buyCreditsDto, /@Equals/);
    assert.doesNotMatch(stripe, /assertWithdrawalWaiver|confirmYearlyCredits/);
    assert.doesNotMatch(stripe, /withdrawal_waiver/);
    assert.match(stripe, /async createCreditPackCheckout\(\n\s+organization: Organization,\n\s+packId: CreditPackId\n\s+\)/);
  });

  it('keeps the flag an older app still sends out of Stripe', () => {
    assert.equal((stripe.match(/\.\.\.omit\(body, 'withdrawalWaiver'(, 'credits_schedule', 'credit_pricing')?\),/g) || []).length, 3);
    assert.doesNotMatch(stripe, /\.\.\.body,/);
  });

  it('is offset by yearly credits a month at a time, stamped at checkout only', () => {
    assert.match(stripe, /const MONTHLY_CREDITS = 'monthly';/);
    // both checkouts, after the body, so a body cannot unset it
    for (const from of ['private async createEmbeddedCheckout(', 'private async createCheckoutSession(']) {
      const checkout = between(stripe, from, 'line_items:');
      assert.ok(checkout.indexOf('credits_schedule: MONTHLY_CREDITS,') > checkout.indexOf("...omit(body, 'withdrawalWaiver'),"), from);
    }
    assert.equal((stripe.match(/credits_schedule: MONTHLY_CREDITS,/g) || []).length, 2);
    // a plan change keeps what the subscription has, and no body writes it
    const change = between(stripe, 'async subscribe(', 'async paymentSucceeded(');
    assert.doesNotMatch(change, /credits_schedule: MONTHLY_CREDITS/);
    assert.match(change, /\.\.\.omit\(body, 'withdrawalWaiver', 'credits_schedule', 'credit_pricing'\),/);
  });
});

describe('Model tokens', () => {
  it('are priced before v2 at the provider cost times 25, cached input at the full rate', () => {
    assert.deepEqual(LLM_CREDIT_RATES.legacy['gpt-5.2'], {
      input: 0.044,
      cachedInput: 0.044,
      output: 0.35,
    });
    assert.deepEqual(LLM_CREDIT_RATES.legacy['gpt-4.1'], {
      input: 0.05,
      cachedInput: 0.05,
      output: 0.2,
    });
    // $1.75 / $14 and $2 / $8 a million tokens, times 25
    const perThousand = (dollarsPerMillion: number) =>
      (dollarsPerMillion / 1000) * 25;
    const close = (a: number, b: number) => Math.abs(a - b) < 0.0005;
    assert.ok(close(perThousand(1.75), 0.044));
    assert.ok(close(perThousand(14), 0.35));
    assert.ok(close(perThousand(2), 0.05));
    assert.ok(close(perThousand(8), 0.2));
  });

  it('are priced on v2 at the provider cost times 50, cached input at its own rate', () => {
    // $1.75 / $0.175 / $14 and $2 / $0.50 / $8 a million tokens, times 50
    const perThousand = (dollarsPerMillion: number) =>
      (dollarsPerMillion / 1000) * 50;
    const close = (a: number, b: number) => Math.abs(a - b) < 0.000001;
    const gpt52 = LLM_CREDIT_RATES.v2['gpt-5.2'];
    const gpt41 = LLM_CREDIT_RATES.v2['gpt-4.1'];
    assert.ok(close(gpt52.input, perThousand(1.75)));
    assert.ok(close(gpt52.cachedInput, perThousand(0.175)));
    assert.ok(close(gpt52.output, perThousand(14)));
    assert.ok(close(gpt41.input, perThousand(2)));
    assert.ok(close(gpt41.cachedInput, perThousand(0.5)));
    assert.ok(close(gpt41.output, perThousand(8)));
  });

  it('come to whole hundredths, rounded up', () => {
    // 1000 in and 200 out on gpt-5.2: 4.4 + 7 hundredths
    assert.equal(llmCreditCost('legacy', 'gpt-5.2', 1000, 200), 12);
    // a million in and a million out: 44 + 350 credits exactly
    assert.equal(llmCreditCost('legacy', 'gpt-5.2', 1_000_000, 1_000_000), 39400);
    assert.equal(llmCreditCost('legacy', 'gpt-4.1', 1_000_000, 1_000_000), 25000);
    // the smallest call still costs a hundredth
    assert.equal(llmCreditCost('legacy', 'gpt-4.1', 1, 0), 1);
    assert.equal(llmCreditCost('legacy', 'gpt-5.2', 0, 0), 0);
    // v2: 8.75 + 14 hundredths
    assert.equal(llmCreditCost('v2', 'gpt-5.2', 1000, 200), 23);
  });

  it('charge the cached part of a prompt at its rate on v2, and in full before', () => {
    // 200 at 8.75, 800 at 0.875 and 200 out at 70 a thousand: 16.45
    assert.equal(llmCreditCost('v2', 'gpt-5.2', 1000, 200, 800), 17);
    assert.equal(
      llmCreditCost('legacy', 'gpt-5.2', 1000, 200, 800),
      llmCreditCost('legacy', 'gpt-5.2', 1000, 200)
    );
    // never more cached than the prompt
    assert.equal(
      llmCreditCost('v2', 'gpt-5.2', 1000, 0, 5000),
      llmCreditCost('v2', 'gpt-5.2', 1000, 0, 1000)
    );
  });

  it('read a dated snapshot as its model, and anything unknown at the highest rates', () => {
    assert.equal(
      llmCreditRate('legacy', 'gpt-4.1-2025-04-14'),
      LLM_CREDIT_RATES.legacy['gpt-4.1']
    );
    assert.equal(
      llmCreditRate('v2', 'gpt-5.2-2025-12-11'),
      LLM_CREDIT_RATES.v2['gpt-5.2']
    );
    assert.deepEqual(llmCreditRate('legacy', 'gpt-9'), {
      input: 0.05,
      cachedInput: 0.05,
      output: 0.35,
    });
    assert.deepEqual(llmCreditRate('v2', undefined), {
      input: 0.1,
      cachedInput: 0.025,
      output: 0.7,
    });
    // not a prefix match: a mini model is not priced as its big sibling
    assert.deepEqual(
      llmCreditRate('legacy', 'gpt-4.1-mini'),
      llmCreditRate('legacy', 'gpt-9')
    );
  });

  it('are charged after the call, below zero if need be, once per call', async () => {
    await service().chargeLlm('org-1', {
      key: 'llm:resp_1',
      model: 'gpt-5.2',
      inputTokens: 1000,
      outputTokens: 200,
      action: 'copilot',
    });
    assert.deepEqual(spends, [
      {
        key: 'llm:resp_1',
        amount: 12,
        action: 'copilot',
        meta: {
          model: 'gpt-5.2',
          inputTokens: 1000,
          cachedInputTokens: 0,
          outputTokens: 200,
        },
        allowOverdraft: true,
      },
    ]);
  });

  it('charge nothing for a call that used nothing, or with billing off', async () => {
    const call = {
      key: 'llm:resp_0',
      model: 'gpt-5.2',
      inputTokens: 0,
      outputTokens: 0,
      action: 'copilot',
    };
    assert.deepEqual(await service().chargeLlm('org-1', call), {
      id: null,
      charged: false,
    });
    billing(false);
    assert.deepEqual(
      await service().chargeLlm('org-1', {
        ...call,
        inputTokens: 5000,
        outputTokens: 5000,
      }),
      { id: null, charged: false }
    );
    assert.deepEqual(calls, []);
  });

  it('refuse a turn only on an empty balance', async () => {
    assert.equal(LLM_TURN_MINIMUM, 1);
    balance = 1;
    await service().assertLlmTurn('org-1');
    for (const empty of [0, -250]) {
      balance = empty;
      await assert.rejects(service().assertLlmTurn('org-1'), (err) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), 402);
        assert.equal((err.getResponse() as any).code, 'insufficient_credits');
        return true;
      });
    }
  });

  it('let the rest of a turn finish below zero, down to a floor', async () => {
    // after a frontend tool, the run that finishes the turn
    for (const below of [0, -250, LLM_CONTINUATION_FLOOR]) {
      balance = below;
      await service().assertLlmTurn('org-1', true);
    }
    balance = LLM_CONTINUATION_FLOOR - 1;
    await assert.rejects(
      service().assertLlmTurn('org-1', true),
      (err) => err instanceof HttpException && err.getStatus() === 402
    );
  });

  it('count a charge owed but not yet written, between the steps of a run', async () => {
    balance = LLM_CONTINUATION_FLOOR + 10;
    await service().assertLlmTurn('org-1', true, 10);
    await assert.rejects(
      service().assertLlmTurn('org-1', true, 11),
      (err) => err instanceof HttpException && err.getStatus() === 402
    );
  });

  it('refuse nothing with billing off', async () => {
    billing(false);
    balance = -100000;
    await service().assertLlmTurn('org-1');
    await service().assertLlmTurn('org-1', true);
  });
});

describe('Fixed charges for the older AI features', () => {
  it('are proposals in whole hundredths, a picture priced as a medium square image', () => {
    for (const cp of CREDIT_PRICINGS) {
      assert.ok(
        Object.values(AI_FIXED_CREDIT_COSTS_PROPOSAL[cp]).every(
          (amount) => Number.isInteger(amount) && amount > 0
        ),
        cp
      );
      assert.equal(
        AI_FIXED_CREDIT_COSTS_PROPOSAL[cp].generatorPicture,
        imageCreditCost(cp, 'medium', 'square')
      );
    }
    assert.deepEqual(AI_FIXED_CREDIT_COSTS_PROPOSAL.v2, {
      generator: 250,
      generatorPicture: 200,
      autopostText: 50,
      autopostPicture: 210,
      separatePosts: 50,
    });
  });
});
