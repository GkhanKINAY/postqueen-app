import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import dayjs from 'dayjs';

const context = readFileSync(
  fileURLToPath(new URL('./calendar.context.tsx', import.meta.url)),
  'utf8',
);
const calendar = readFileSync(
  fileURLToPath(new URL('./calendar.tsx', import.meta.url)),
  'utf8',
);
const filters = readFileSync(
  fileURLToPath(new URL('./filters.tsx', import.meta.url)),
  'utf8',
);
const launches = readFileSync(
  fileURLToPath(new URL('./launches.component.tsx', import.meta.url)),
  'utf8',
);
const repo = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
      import.meta.url,
    ),
  ),
  'utf8',
);

/**
 * Keep in lockstep with `listStateForSeeAll` in calendar.context.tsx — the
 * source-read tests below prove See all still calls it.
 */
function listStateForSeeAll(
  date: dayjs.Dayjs,
  states: Array<string | undefined> = [],
  now: dayjs.Dayjs,
) {
  const unique = new Set(
    states.filter((s): s is string => !!s).map((s) => s.toUpperCase()),
  );
  if (unique.size === 1) {
    if (unique.has('PUBLISHED')) return 'published';
    if (unique.has('DRAFT')) return 'draft';
    if (unique.has('QUEUE')) return 'scheduled';
  }
  if (unique.has('PUBLISHED')) return 'published';
  if (date.endOf('day').isBefore(now)) return 'published';
  if (unique.has('DRAFT') && !unique.has('QUEUE')) return 'draft';
  return 'all';
}

describe('See all opens the matching Posts tab', () => {
  const now = dayjs('2026-09-16T12:00:00');

  it('sends a past published cell to Posted, not All/Scheduled', () => {
    assert.equal(
      listStateForSeeAll(dayjs('2026-09-14'), ['PUBLISHED', 'PUBLISHED'], now),
      'published',
    );
    assert.equal(listStateForSeeAll(dayjs('2026-09-14'), [], now), 'published');
  });

  it('keeps a future queue cell on Scheduled and mixed future on All', () => {
    assert.equal(
      listStateForSeeAll(dayjs('2026-09-20'), ['QUEUE', 'QUEUE'], now),
      'scheduled',
    );
    assert.equal(
      listStateForSeeAll(dayjs('2026-09-20'), ['QUEUE', 'DRAFT'], now),
      'all',
    );
  });

  it('wires See all and day headers through listStateForSeeAll', () => {
    assert.match(context, /export function listStateForSeeAll/);
    assert.match(context, /listStateForSeeAll\(date, states\)/);
    assert.match(context, /setListStateRaw\(nextState\)/);
    assert.match(
      calendar,
      /openPostsForDay\(\s*getDate\.startOf\('day'\),\s*postList\.map\(\(p\) => p\.state\)/,
    );
    assert.match(calendar, /postStatesOnDay\(posts, day\.date\)/);
  });

  it('paints dated drafts on the calendar grid with a Draft label', () => {
    const getPosts = repo.slice(repo.indexOf('async getPosts('));
    const getPostsWhere = getPosts.slice(
      getPosts.indexOf('where: {'),
      getPosts.indexOf('select: {'),
    );
    assert.doesNotMatch(getPostsWhere, /state: \{ not: State\.DRAFT \}/);
    assert.doesNotMatch(getPostsWhere, /never paint drafts/);
    assert.doesNotMatch(context, /p.state !== 'DRAFT' && matchChannel/);
    assert.match(context, /return base.filter\(\(p\) => matchChannel\(p\)\)/);
    assert.match(calendar, /state === 'DRAFT' && \(/);
    assert.match(calendar, /t\('draft', 'Draft'\)/);
  });

  it('falls back to the calendar cell when the list page has no rows for that day', () => {
    assert.match(context, /listStateMatchesPost\(p\.state, listState\)/);
    assert.doesNotMatch(
      context,
      /!listData &&\s*listRange\.startsWith\('day:'\)/,
    );
  });
});

describe('Posts list toolbar stays on screen', () => {
  it('keeps date + status + sort in a named toolbar', () => {
    assert.match(filters, /data-pq="posts-list-toolbar"/);
    assert.match(filters, /\['all', t\('all', 'All'\)\]/);
    assert.match(filters, /\['published', t\('posted', 'Posted'\)\]/);
  });

  it('does not let overflow-y-auto collapse the filters flex item', () => {
    assert.match(filters, /flex w-full shrink-0 select-none/);
    assert.doesNotMatch(
      filters,
      /containedColumn &&\s*'mx-auto max-w-\[860px\] overflow-y-auto/,
    );
  });

  it('scrolls the posts column under a shrink-0 Filters row', () => {
    assert.match(launches, /<div className="shrink-0">\s*<Filters \/>/);
    assert.match(
      launches,
      /isList\s*\?\s*'min-h-0 flex-1 flex-col overflow-y-auto/,
    );
    assert.doesNotMatch(
      launches,
      /isList &&\s*'overflow-y-auto scrollbar scrollbar-thumb-pqBorder scrollbar-track-pqInner'/,
    );
  });
});

describe('Posts All is mixed history, newest first', () => {
  it('does not hide past rows on All, only on Scheduled', () => {
    const list = repo.slice(repo.indexOf('async getPostsList('));
    assert.match(
      list,
      /stateFilter === 'scheduled'\s*\? \{ publishDate: \{ gte: dayjs\.utc\(\)\.toDate\(\) \} \}/,
    );
    assert.doesNotMatch(
      list,
      /stateFilter === 'published' \|\| stateFilter === 'draft'/,
    );
  });

  it('defaults the list to newest-first and sends order to the API', () => {
    assert.match(context, /useState<ListSortOrder>\('desc'\)/);
    assert.match(context, /order: listSort/);
    assert.match(context, /listSort: 'desc'/);
  });
});
