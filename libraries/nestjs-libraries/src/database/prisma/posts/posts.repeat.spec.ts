import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostsRepository } from './posts.repository.ts';

// The calendar's posts for a window: repeating posts are expanded into the
// occurrences that fall inside it, and only those.
//
// The window's one-off posts and the repeating posts are two queries. The
// stand-in answers each the way PostgreSQL would for the two filters that
// tell them apart, and keeps every `where` it was given.
const matches = (row: any, where: any) => {
  if (where.intervalInDays === null && row.intervalInDays !== null) {
    return false;
  }
  if (where.intervalInDays?.not === null && row.intervalInDays === null) {
    return false;
  }
  const { gte, lte } = where.publishDate || {};
  if (gte && row.publishDate < gte) {
    return false;
  }
  if (lte && row.publishDate > lte) {
    return false;
  }
  return true;
};

const repositoryOver = (rows: any[], wheres: any[] = []) =>
  new PostsRepository(
    {
      model: {
        post: {
          findMany: async ({ where }: any) => {
            wheres.push(where);
            return rows.filter((row) => matches(row, where));
          },
        },
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

const row = (id: string, publishDate: string, intervalInDays: number | null) => ({
  id,
  publishDate: new Date(publishDate),
  intervalInDays,
  integration: { id: 'ch-1', name: 'PostQueen', customName: null },
});

const march = {
  startDate: '2026-03-01T00:00:00.000Z',
  endDate: '2026-03-31T23:59:59.999Z',
} as any;

const dates = (posts: any[]) =>
  posts.map((p) => new Date(p.publishDate).toISOString());

describe('posts in a calendar window', () => {
  it('expands a weekly post only inside the window', async () => {
    const posts = await repositoryOver([
      row('weekly', '2026-01-01T10:00:00.000Z', 7),
    ]).getPosts('org-1', march);

    assert.deepEqual(dates(posts), [
      '2026-03-05T10:00:00.000Z',
      '2026-03-12T10:00:00.000Z',
      '2026-03-19T10:00:00.000Z',
      '2026-03-26T10:00:00.000Z',
    ]);
    assert.ok(
      posts.every(
        (p: any) => p.actualDate.toISOString() === '2026-01-01T10:00:00.000Z'
      )
    );
  });

  it('starts on the first publish date when that is inside the window', async () => {
    const posts = await repositoryOver([
      row('daily', '2026-03-29T08:00:00.000Z', 1),
    ]).getPosts('org-1', march);

    assert.deepEqual(dates(posts), [
      '2026-03-29T08:00:00.000Z',
      '2026-03-30T08:00:00.000Z',
      '2026-03-31T08:00:00.000Z',
    ]);
  });

  it('keeps an occurrence exactly on the window start', async () => {
    const posts = await repositoryOver([
      row('weekly', '2026-02-22T00:00:00.000Z', 7),
    ]).getPosts('org-1', march);

    assert.equal(dates(posts)[0], '2026-03-01T00:00:00.000Z');
    assert.equal(posts.length, 5);
  });

  it('shows nothing of a repeating post that starts after the window', async () => {
    const posts = await repositoryOver([
      row('later', '2026-04-02T10:00:00.000Z', 1),
    ]).getPosts('org-1', march);

    assert.deepEqual(posts, []);
  });

  it('returns one-off posts and rows with a non-positive interval once, named', async () => {
    const posts = await repositoryOver([
      row('once', '2026-03-10T10:00:00.000Z', null),
      row('broken', '2026-03-11T10:00:00.000Z', 0),
    ]).getPosts('org-1', march);

    assert.deepEqual(
      posts.map((p: any) => [p.id, p.integration.name]),
      [
        ['once', 'PostQueen'],
        ['broken', 'PostQueen'],
      ]
    );
  });

  it('shows a repeating post that started long before the window', async () => {
    const posts = await repositoryOver([
      row('monthly', '2025-06-15T09:00:00.000Z', 30),
    ]).getPosts('org-1', march);

    assert.deepEqual(dates(posts), ['2026-03-12T09:00:00.000Z']);
  });

  it('loads one-off posts of the window only, each once', async () => {
    const posts = await repositoryOver([
      row('before', '2026-02-28T23:59:59.000Z', null),
      row('inside', '2026-03-15T12:00:00.000Z', null),
      row('after', '2026-04-01T00:00:00.000Z', null),
    ]).getPosts('org-1', march);

    assert.deepEqual(
      posts.map((p: any) => [p.id, new Date(p.publishDate).toISOString()]),
      [['inside', '2026-03-15T12:00:00.000Z']]
    );
    assert.equal(posts[0].actualDate, undefined);
  });

  it('keeps the organization, channel and customer filters on both queries', async () => {
    const wheres: any[] = [];
    await repositoryOver([], wheres).getPosts('org-1', {
      ...march,
      customer: 'cust-1',
    });

    assert.equal(wheres.length, 2);
    for (const where of wheres) {
      assert.deepEqual(where.AND, [{ OR: [{ organizationId: 'org-1' }] }]);
      assert.deepEqual(where.integration, {
        deletedAt: null,
        organizationId: 'org-1',
        customerId: 'cust-1',
      });
      assert.equal(where.deletedAt, null);
      assert.equal(where.parentPostId, null);
    }

    const [oneOff, repeating] = wheres;
    assert.equal(oneOff.intervalInDays, null);
    assert.deepEqual(oneOff.publishDate, {
      gte: new Date(march.startDate),
      lte: new Date(march.endDate),
    });
    assert.deepEqual(repeating.intervalInDays, { not: null });
    assert.equal(repeating.publishDate, undefined);
  });
});
