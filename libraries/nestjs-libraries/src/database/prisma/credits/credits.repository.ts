import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Prisma } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import {
  CREDIT_REFUND_DAYS,
  toCredits,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import dayjs from 'dayjs';

type Tx = Prisma.TransactionClient;

export interface CreditSpend {
  /** Unique per piece of work, so a retried call is charged once. */
  key: string;
  /** Hundredths of a credit. */
  amount: number;
  action: string;
  meta?: Prisma.InputJsonValue;
  /** Charge even when the balance is short, leaving it below zero. For work
   * already done whose cost is only known afterwards (tokens used). */
  allowOverdraft?: boolean;
}

export interface CreditGrantInput {
  source: string;
  /** Hundredths of a credit. */
  amount: number;
  expiresAt?: Date | null;
  externalRef?: string | null;
  paymentRef?: string | null;
  tier?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

/** The 402 every refusal answers with. `message` is what the app's Payment
 * Required dialog shows; the rest is for callers that explain it themselves. */
export const insufficientCredits = (required: number, balance: number) =>
  new HttpException(
    {
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      message: `Not enough credits: this costs ${toCredits(
        required
      )} and the balance is ${toCredits(balance)}.`,
      code: 'insufficient_credits',
      required: toCredits(required),
      balance: toCredits(balance),
    },
    HttpStatus.PAYMENT_REQUIRED
  );

// A negative amount would run every sum backwards: a spend that adds credits.
const assertAmount = (amount: number) => {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Credit amounts are positive hundredths, got ${amount}`);
  }
};

@Injectable()
export class CreditsRepository {
  constructor(
    private _creditGrant: PrismaRepository<'creditGrant'>,
    private _creditAllocation: PrismaRepository<'creditAllocation'>,
    private _transaction: PrismaTransaction
  ) {}

  // Every write to an organization's balance runs under this one lock, so two
  // spends started together cannot both see the same last credit as free.
  private lock(tx: Tx, organizationId: string) {
    return tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`credits:${organizationId}`}))`;
  }

  private liveGrants(organizationId: string): Prisma.CreditGrantWhereInput {
    return {
      organizationId,
      revokedAt: null,
      remaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
  }

  // Spent past zero: allocations no grant has paid for yet.
  private debt(organizationId: string): Prisma.CreditAllocationWhereInput {
    return { grantId: null, spend: { organizationId } };
  }

  // Whatever runs out soonest is used first, so plan credits go before
  // purchased ones; a grant with no end date goes last.
  private spendOrder(): Prisma.CreditGrantOrderByWithRelationInput[] {
    return [
      { expiresAt: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
    ];
  }

  async balance(organizationId: string) {
    const [grants, debt, expiring] = await Promise.all([
      this._creditGrant.model.creditGrant.aggregate({
        where: this.liveGrants(organizationId),
        _sum: { remaining: true },
      }),
      this._creditAllocation.model.creditAllocation.aggregate({
        where: this.debt(organizationId),
        _sum: { amount: true },
      }),
      this._creditGrant.model.creditGrant.findFirst({
        where: {
          ...this.liveGrants(organizationId),
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: 'asc' },
        select: { remaining: true, expiresAt: true },
      }),
    ]);

    return {
      balance: (grants._sum.remaining || 0) - (debt._sum.amount || 0),
      expiring: expiring
        ? { amount: expiring.remaining, at: expiring.expiresAt! }
        : null,
    };
  }

  async spend(organizationId: string, spend: CreditSpend) {
    assertAmount(spend.amount);

    return this._transaction.model.$transaction(async (tx) => {
      await this.lock(tx, organizationId);

      const existing = await tx.credits.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: spend.key,
          },
        },
        select: { id: true },
      });
      if (existing) {
        return { id: existing.id, charged: false };
      }

      const grants = await tx.creditGrant.findMany({
        where: this.liveGrants(organizationId),
        orderBy: this.spendOrder(),
        select: { id: true, remaining: true },
      });
      const debt = await tx.creditAllocation.aggregate({
        where: this.debt(organizationId),
        _sum: { amount: true },
      });

      const available =
        grants.reduce((sum, grant) => sum + grant.remaining, 0) -
        (debt._sum.amount || 0);

      if (spend.amount > available && !spend.allowOverdraft) {
        throw insufficientCredits(spend.amount, available);
      }

      const created = await tx.credits.create({
        data: {
          organizationId,
          type: 'credits',
          credits: spend.amount,
          idempotencyKey: spend.key,
          action: spend.action,
          status: 'settled',
          meta: spend.meta,
        },
        select: { id: true },
      });

      let left = spend.amount;
      for (const grant of grants) {
        if (!left) {
          break;
        }
        const take = Math.min(grant.remaining, left);
        await tx.creditGrant.update({
          where: { id: grant.id },
          data: { remaining: { decrement: take } },
        });
        await tx.creditAllocation.create({
          data: { spendId: created.id, grantId: grant.id, amount: take },
        });
        left -= take;
      }

      if (left) {
        await tx.creditAllocation.create({
          data: { spendId: created.id, grantId: null, amount: left },
        });
      }

      return { id: created.id, charged: true };
    });
  }

  /**
   * Hands a spend back in full. Each part returns to the grant that paid it
   * while that grant is still live. Parts whose grant has expired come back as
   * one refund grant, good for `CREDIT_REFUND_DAYS`, so a failed generation on
   * the last day of a month is not simply lost. Parts of a revoked grant (a
   * refunded or disputed payment) are not given back, because that money has
   * already been returned. The key is renamed, which frees it for the work to
   * be charged again.
   */
  async refund(organizationId: string, key: string) {
    return this._transaction.model.$transaction(async (tx) => {
      await this.lock(tx, organizationId);

      const spend = await tx.credits.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: key,
          },
        },
        select: {
          id: true,
          status: true,
          allocations: {
            select: {
              amount: true,
              grant: {
                select: { id: true, expiresAt: true, revokedAt: true },
              },
            },
          },
        },
      });

      if (!spend || spend.status === 'refunded') {
        return false;
      }

      const now = new Date();
      let expired = 0;
      for (const allocation of spend.allocations) {
        const grant = allocation.grant;
        // No grant: never paid for, the debt goes with the allocation.
        if (!grant || grant.revokedAt) {
          continue;
        }
        if (grant.expiresAt && grant.expiresAt <= now) {
          expired += allocation.amount;
          continue;
        }
        await tx.creditGrant.update({
          where: { id: grant.id },
          data: { remaining: { increment: allocation.amount } },
        });
      }

      await tx.creditAllocation.deleteMany({ where: { spendId: spend.id } });
      await tx.credits.update({
        where: { id: spend.id },
        data: {
          status: 'refunded',
          idempotencyKey: `${key}#refunded:${spend.id}`,
        },
      });

      if (expired) {
        await tx.creditGrant.create({
          data: {
            organizationId,
            source: 'refund',
            amount: expired,
            remaining: expired,
            expiresAt: dayjs(now).add(CREDIT_REFUND_DAYS, 'day').toDate(),
            externalRef: `refund:${spend.id}`,
          },
        });
      }

      await this.payDebt(tx, organizationId);
      return true;
    });
  }

  /** Adds credits once per `externalRef`, paying off any debt first. */
  async grant(organizationId: string, grant: CreditGrantInput) {
    assertAmount(grant.amount);

    return this._transaction.model.$transaction(async (tx) => {
      await this.lock(tx, organizationId);

      if (grant.externalRef) {
        const existing = await tx.creditGrant.findUnique({
          where: { externalRef: grant.externalRef },
          select: { id: true },
        });
        if (existing) {
          return { id: existing.id, granted: false };
        }
      }

      const created = await tx.creditGrant.create({
        data: {
          organizationId,
          source: grant.source,
          amount: grant.amount,
          remaining: grant.amount,
          expiresAt: grant.expiresAt,
          externalRef: grant.externalRef,
          paymentRef: grant.paymentRef,
          tier: grant.tier,
          periodStart: grant.periodStart,
          periodEnd: grant.periodEnd,
        },
        select: { id: true },
      });

      await this.payDebt(tx, organizationId);
      return { id: created.id, granted: true };
    });
  }

  // Points unpaid allocations at live grants, oldest debt first, splitting an
  // allocation when one grant covers only part of it.
  private async payDebt(tx: Tx, organizationId: string) {
    const owed = await tx.creditAllocation.findMany({
      where: this.debt(organizationId),
      orderBy: { createdAt: 'asc' },
      select: { id: true, spendId: true, amount: true },
    });
    if (!owed.length) {
      return;
    }

    const grants = await tx.creditGrant.findMany({
      where: this.liveGrants(organizationId),
      orderBy: this.spendOrder(),
      select: { id: true, remaining: true },
    });

    for (const allocation of owed) {
      let left = allocation.amount;
      for (const grant of grants) {
        if (!left) {
          break;
        }
        if (!grant.remaining) {
          continue;
        }
        const take = Math.min(grant.remaining, left);
        grant.remaining -= take;
        left -= take;
        await tx.creditGrant.update({
          where: { id: grant.id },
          data: { remaining: { decrement: take } },
        });
        if (!left) {
          await tx.creditAllocation.update({
            where: { id: allocation.id },
            data: { grantId: grant.id, amount: take },
          });
        } else {
          await tx.creditAllocation.create({
            data: {
              spendId: allocation.spendId,
              grantId: grant.id,
              amount: take,
            },
          });
          await tx.creditAllocation.update({
            where: { id: allocation.id },
            data: { amount: left },
          });
        }
      }
      if (left) {
        return;
      }
    }
  }
}
