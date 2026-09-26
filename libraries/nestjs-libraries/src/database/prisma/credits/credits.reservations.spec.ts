import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { CreditsRepository } from './credits.repository.ts';

// The ledger's own code over the few Prisma calls it makes, kept in memory:
// enough to run reservations end to end. The lock is Postgres's; one test
// runs at a time here, so it is a no-op.
type Row = Record<string, any>;
let credits: Row[];
let grants: Row[];
let allocations: Row[];
let ids: number;

const id = () => `row-${++ids}`;
const live = (grant: Row) =>
  !grant.revokedAt &&
  grant.remaining > 0 &&
  (!grant.expiresAt || grant.expiresAt > new Date());
const keyOf = (where: Row) => where.organizationId_idempotencyKey;
const matches = (row: Row, where: Row) =>
  Object.entries(where).every(([field, rule]) => {
    if (field === 'NOT') {
      return !matches(row, rule);
    }
    if (rule && typeof rule === 'object') {
      return (
        (rule.startsWith === undefined ||
          String(row[field]).startsWith(rule.startsWith)) &&
        (rule.contains === undefined ||
          String(row[field]).includes(rule.contains))
      );
    }
    return row[field] === rule;
  });
const debt = (organizationId: string) =>
  allocations.filter(
    (a) =>
      a.grantId === null &&
      credits.find((c) => c.id === a.spendId)?.organizationId === organizationId
  );

const prisma: any = {
  $queryRaw: async () => [{ locked: 1 }],
  credits: {
    findUnique: async ({ where }: Row) => {
      const { organizationId, idempotencyKey } = keyOf(where);
      const row = credits.find(
        (c) =>
          c.organizationId === organizationId &&
          c.idempotencyKey === idempotencyKey
      );
      return row
        ? {
            ...row,
            allocations: allocations
              .filter((a) => a.spendId === row.id)
              .map((a) => ({
                amount: a.amount,
                grant: grants.find((g) => g.id === a.grantId) || null,
              })),
          }
        : null;
    },
    findMany: async ({ where }: Row) =>
      credits.filter((c) => matches(c, where)),
    findFirst: async ({ where }: Row) =>
      credits.find((c) => matches(c, where)) || null,
    create: async ({ data }: Row) => {
      const row = { id: id(), ...data };
      credits.push(row);
      return { id: row.id };
    },
    update: async ({ where, data }: Row) =>
      Object.assign(
        credits.find((c) => c.id === where.id)!,
        data
      ),
    updateMany: async ({ where, data }: Row) => {
      const rows = credits.filter((c) => matches(c, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
  },
  creditGrant: {
    findMany: async () => grants.filter(live),
    findFirst: async () => null,
    aggregate: async ({ where }: Row) => ({
      _sum: {
        remaining: grants
          .filter((g) => g.organizationId === where.organizationId && live(g))
          .reduce((sum, g) => sum + g.remaining, 0),
      },
    }),
    create: async ({ data }: Row) => {
      grants.push({ id: id(), revokedAt: null, ...data });
    },
    update: async ({ where, data }: Row) => {
      const grant = grants.find((g) => g.id === where.id)!;
      grant.remaining +=
        (data.remaining.increment || 0) - (data.remaining.decrement || 0);
      return grant;
    },
  },
  creditAllocation: {
    aggregate: async ({ where }: Row) => ({
      _sum: {
        amount: debt(where.spend.organizationId).reduce(
          (sum, a) => sum + a.amount,
          0
        ),
      },
    }),
    findMany: async ({ where }: Row) => debt(where.spend.organizationId),
    create: async ({ data }: Row) => {
      allocations.push({ id: id(), ...data });
    },
    update: async ({ where, data }: Row) =>
      Object.assign(
        allocations.find((a) => a.id === where.id)!,
        data
      ),
    deleteMany: async ({ where }: Row) => {
      allocations = allocations.filter((a) => a.spendId !== where.spendId);
    },
  },
};

// All or nothing, as in Postgres: a transaction that throws leaves the
// tables as they were.
const transaction = async (work: (tx: any) => Promise<unknown>) => {
  const before = structuredClone({ credits, grants, allocations });
  try {
    return await work(prisma);
  } catch (err) {
    ({ credits, grants, allocations } = before);
    throw err;
  }
};

const repository = () =>
  new CreditsRepository(
    { model: prisma } as any,
    { model: prisma } as any,
    { model: { $transaction: transaction } } as any,
    { model: prisma } as any
  );

const org = 'org-1';
const balance = async () => (await repository().balance(org)).balance;
const reserve = (key: string, amount: number) =>
  repository().reserve(org, { key, amount, action: 'publish' });

beforeEach(() => {
  credits = [];
  allocations = [];
  ids = 0;
  grants = [
    {
      id: 'grant-1',
      organizationId: org,
      remaining: 1000,
      revokedAt: null,
      expiresAt: null,
    },
  ];
});

describe('Reservations', () => {
  it('sets aside an amount once, however often it is asked for', async () => {
    await reserve('publish:p1:a', 40);
    await reserve('publish:p1:a', 40);
    assert.equal(await balance(), 960);
    assert.equal(credits.length, 1);
  });

  it('replaces a reservation whose amount changed, so only the difference has to be free', async () => {
    grants[0].remaining = 500;
    await reserve('publish:p1:a', 40);
    // the text gained a link: 460 left, 500 needed, 40 of it already held
    await reserve('publish:p1:a', 500);
    assert.equal(await balance(), 0);
    const open = await repository().reservations(org, 'publish:p1:');
    assert.deepEqual(
      open.map((r) => [r.idempotencyKey, r.credits]),
      [['publish:p1:a', 500]]
    );
  });

  it('keeps the old reservation when the new amount cannot be paid', async () => {
    grants[0].remaining = 100;
    await reserve('publish:p1:a', 40);
    await assert.rejects(reserve('publish:p1:a', 500), (err) => {
      assert.ok(err instanceof HttpException);
      assert.equal(err.getStatus(), 402);
      return true;
    });
    assert.equal(await balance(), 60);
  });

  it('hands a reservation back at an amount of 0', async () => {
    await reserve('publish:p1:a', 40);
    await reserve('publish:p1:a', 0);
    assert.equal(await balance(), 1000);
    assert.deepEqual(await repository().reservations(org, 'publish:p1:'), []);
  });

  it('lists only what is still set aside for one post', async () => {
    await reserve('publish:p1:a', 40);
    await reserve('publish:p1:b', 500);
    await reserve('publish:p2:a', 40);
    await repository().settle(org, 'publish:p1:a', 'x-1');
    await repository().refund(org, 'publish:p1:b');
    await reserve('publish:p1:c', 40);
    const open = await repository().reservations(org, 'publish:p1:');
    assert.deepEqual(
      open.map((r) => r.idempotencyKey),
      ['publish:p1:c']
    );
  });

  it('settles a used reservation under the release, keeping the charge and freeing the key', async () => {
    await reserve('publish:p1:a', 40);
    assert.equal(await repository().settle(org, 'publish:p1:a', 'x-1'), true);
    assert.equal(await balance(), 960);
    // a repeating post reserves its next run under the same key
    await reserve('publish:p1:a', 40);
    assert.equal(await balance(), 920);
    // the same use settled again (a retried activity) finds it done
    assert.equal(await repository().settle(org, 'publish:p1:a', 'x-1'), false);
    assert.equal(await repository().settle(org, 'publish:p1:a', 'x-2'), true);
    assert.equal(await balance(), 920);
  });

  it('lets credits that expired while they were reserved stay expired', async () => {
    grants[0].expiresAt = new Date(Date.now() + 60_000);
    await reserve('publish:p1:a', 40);
    await reserve('publish:p1:b', 40);
    // the period ends while the posts wait
    grants[0].expiresAt = new Date(Date.now() - 1000);
    await repository().release(org, 'publish:p1:a');
    await reserve('publish:p1:b', 500).catch(() => undefined);
    assert.equal(grants.length, 1);
    assert.equal(await balance(), 0);
    // a failed generation, refunded at once, still gets its credits back
    grants[0].expiresAt = new Date(Date.now() + 60_000);
    await repository().spend(org, {
      key: 'image:1',
      amount: 30,
      action: 'image',
    });
    grants[0].expiresAt = new Date(Date.now() - 1000);
    await repository().refund(org, 'image:1');
    assert.deepEqual(
      grants.slice(1).map((g) => [g.source, g.remaining]),
      [['refund', 30]]
    );
  });

  it('knows whether anything was ever reserved for an item', async () => {
    assert.equal(await repository().everReserved(org, 'publish:p1:a'), false);
    await reserve('publish:p1:a', 40);
    await repository().refund(org, 'publish:p1:a');
    assert.equal(await repository().everReserved(org, 'publish:p1:a'), true);
    assert.equal(await repository().everReserved(org, 'publish:p1:b'), false);
  });
});
