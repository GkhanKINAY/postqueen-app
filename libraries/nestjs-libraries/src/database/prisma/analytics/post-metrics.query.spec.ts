import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyticsPublishDateRange,
  firstMediaPath,
  mapSnapshotRow,
  matchesAnalyticsQuery,
  previewText,
  overlaySnapshotSeries,
  lifetimeToDailyRange,
  sortAnalyticsPosts,
  sumComplete,
  sumKnown,
  summarizeAnalyticsPosts,
  topAnalyticsPosts,
  type AnalyticsPostRow,
} from './post-metrics.query.ts';

const row = (
  partial: Partial<AnalyticsPostRow> & { id: string },
): AnalyticsPostRow => ({
  group: partial.group || partial.id,
  content: '',
  thumbnail: null,
  publishDate: '2026-09-01T10:00:00.000Z',
  releaseURL: null,
  integrationId: 'int-1',
  platform: 'x',
  channelName: 'PostQueen',
  channelPicture: null,
  impressions: null,
  reactions: null,
  comments: null,
  shares: null,
  engagementRate: null,
  previous: null,
  ...partial,
});

describe('previewText', () => {
  it('strips tags and truncates', () => {
    assert.equal(
      previewText('<p>Hello <strong>world</strong></p>'),
      'Hello world',
    );
    assert.equal(previewText('a'.repeat(10), 8), 'aaaaaaaa…');
  });
});
describe('matchesAnalyticsQuery', () => {
  const post = row({
    id: 'p1',
    content: '<p>Tuesday launch on X</p>',
    platform: 'x',
    channelName: 'PostQueen HQ',
  });

  it('filters by platform', () => {
    assert.equal(matchesAnalyticsQuery(post, undefined, 'x'), true);
    assert.equal(matchesAnalyticsQuery(post, undefined, 'instagram'), false);
  });

  it('finds posts by caption or channel', () => {
    assert.equal(matchesAnalyticsQuery(post, 'tuesday'), true);
    assert.equal(matchesAnalyticsQuery(post, 'HQ'), true);
    assert.equal(matchesAnalyticsQuery(post, 'p1'), true);
    assert.equal(matchesAnalyticsQuery(post, 'linkedin'), false);
  });
});
describe('sortAnalyticsPosts', () => {
  it('ranks unknown metrics last when sorting desc', () => {
    const sorted = sortAnalyticsPosts(
      [
        row({ id: 'a', reactions: null }),
        row({ id: 'b', reactions: 12 }),
        row({ id: 'c', reactions: 4 }),
      ],
      'reactions',
      'desc',
    );
    assert.deepEqual(
      sorted.map((p) => p.id),
      ['b', 'c', 'a'],
    );
  });

  it('never ranks posts whose selected metric is unknown', () => {
    const top = topAnalyticsPosts(
      [
        row({ id: 'a', reactions: null }),
        row({ id: 'b', reactions: 12 }),
        row({ id: 'c', reactions: 4 }),
      ],
      'reactions',
    );
    assert.deepEqual(
      top.map((post) => post.id),
      ['b', 'c'],
    );
  });

  it('keeps unknown metrics last when sorting ascending', () => {
    const sorted = sortAnalyticsPosts(
      [
        row({ id: 'unknown', comments: null }),
        row({ id: 'high', comments: 12 }),
        row({ id: 'low', comments: 4 }),
      ],
      'comments',
      'asc',
    );
    assert.deepEqual(
      sorted.map((post) => post.id),
      ['low', 'high', 'unknown'],
    );
  });
});

describe('analyticsPublishDateRange', () => {
  it('covers exactly the selected UTC calendar dates, including today', () => {
    const range = analyticsPublishDateRange(
      7,
      new Date('2026-09-15T16:00:00.000Z'),
    );
    assert.equal(range.from.toISOString(), '2026-09-09T00:00:00.000Z');
    assert.equal(range.to.toISOString(), '2026-09-15T23:59:59.999Z');
  });
});

describe('firstMediaPath', () => {
  it('prefers thumbnail then path', () => {
    assert.equal(
      firstMediaPath(
        JSON.stringify([{ path: '/full.jpg', thumbnail: '/thumb.jpg' }]),
      ),
      '/thumb.jpg',
    );
    assert.equal(
      firstMediaPath(JSON.stringify([{ path: '/full.jpg' }])),
      '/full.jpg',
    );
  });

  it('returns null for missing or invalid image json', () => {
    assert.equal(firstMediaPath(null), null);
    assert.equal(firstMediaPath('not-json'), null);
    assert.equal(firstMediaPath('[]'), null);
  });
});

describe('mapSnapshotRow', () => {
  const base = {
    id: 'p1',
    content: '<p>Hello</p>',
    image: JSON.stringify([{ path: '/a.jpg' }]),
    publishDate: new Date('2026-09-01T10:00:00.000Z'),
    releaseURL: 'https://x.com/1',
    integrationId: 'int-1',
    integration: {
      providerIdentifier: 'x',
      name: 'PostQueen',
      picture: null,
    },
  };

  it('keeps unknown metrics null and hides rates with unknown comments', () => {
    const mapped = mapSnapshotRow({
      ...base,
      postMetricSnapshots: [
        {
          impressions: 1000,
          reactions: 50,
          comments: null,
          shares: null,
        },
      ],
    });
    assert.equal(mapped.comments, null);
    assert.equal(mapped.engagementRate, null);
    assert.equal(mapped.thumbnail, '/a.jpg');
    assert.equal(mapped.group, 'p1');
  });

  it('keeps the post group for duplicate and delete', () => {
    const mapped = mapSnapshotRow({
      ...base,
      group: 'grp-9',
      postMetricSnapshots: [],
    });
    assert.equal(mapped.group, 'grp-9');
  });

  it('is null when impressions are missing even if reactions exist', () => {
    const mapped = mapSnapshotRow({
      ...base,
      postMetricSnapshots: [
        {
          impressions: null,
          reactions: 50,
          comments: 2,
          shares: null,
        },
      ],
    });
    assert.equal(mapped.engagementRate, null);
  });
});

describe('sumKnown', () => {
  it('returns null when every value is unknown', () => {
    assert.equal(
      sumKnown([row({ id: 'a' }), row({ id: 'b' })], (p) => p.comments),
      null,
    );
  });

  it('sums known values and ignores nulls', () => {
    assert.equal(
      sumKnown(
        [
          row({ id: 'a', reactions: 10 }),
          row({ id: 'b', reactions: null }),
          row({ id: 'c', reactions: 5 }),
        ],
        (p) => p.reactions,
      ),
      15,
    );
  });
});

describe('sumComplete', () => {
  it('returns null rather than presenting a partial mixed-provider total', () => {
    assert.equal(
      sumComplete(
        [
          row({ id: 'known', comments: 5 }),
          row({ id: 'facebook', comments: null }),
        ],
        (post) => post.comments,
      ),
      null,
    );
  });
});

describe('summarizeAnalyticsPosts', () => {
  it('uses every filtered post rather than only the visible page', () => {
    const rows = [
      row({
        id: 'a',
        integrationId: 'one',
        publishDate: '2026-09-14T10:00:00.000Z',
        impressions: 100,
        reactions: 10,
        comments: 2,
      }),
      row({
        id: 'b',
        integrationId: 'two',
        platform: 'instagram',
        channelName: 'IG',
        publishDate: '2026-09-15T10:00:00.000Z',
        impressions: 50,
        reactions: 5,
        comments: 1,
      }),
    ];
    const summary = summarizeAnalyticsPosts(rows);
    assert.equal(summary.impressions, 150);
    assert.equal(summary.channels.length, 2);
    assert.deepEqual(summary.weekdays, [1, 1, 0, 0, 0, 0, 0]);
    assert.deepEqual(summary.engagementMix, { reactions: 15, comments: 3 });
  });

  it('keeps the engagement mix when some comments are unknown', () => {
    const summary = summarizeAnalyticsPosts([
      row({ id: 'facebook', reactions: 10, comments: null }),
      row({ id: 'x', reactions: 4, comments: 2 }),
    ]);
    assert.equal(summary.reactions, 14);
    assert.equal(summary.comments, null);
    assert.deepEqual(summary.engagementMix, { reactions: 14, comments: 2 });
  });
});

describe('overlaySnapshotSeries', () => {
  const range = {
    rangeStart: '2026-09-10',
    rangeEnd: '2026-09-16',
  };

  it('turns a single lifetime point into a daily bump in the selected range', () => {
    const live = [
      {
        label: 'Comments',
        percentageChange: 0,
        data: [{ total: '3', date: '2026-09-15' }],
      },
    ];
    const out = overlaySnapshotSeries(
      live,
      [
        {
          capturedDay: '2026-09-15',
          impressions: 0,
          reactions: 0,
          comments: 3,
          shares: 0,
          raw: null,
        },
      ],
      range,
    );
    assert.deepEqual(
      out[0].data.map((point) => point.total),
      ['0', '0', '0', '0', '0', '3', '0'],
    );
    assert.equal(out[0].data[5].date, '2026-09-15');
  });

  it('plots daily growth, not a lifetime plateau, across the selected days', () => {
    const live = [
      {
        label: 'Comments',
        percentageChange: 0,
        data: [{ total: '3', date: '2026-09-15' }],
      },
    ];
    const out = overlaySnapshotSeries(
      live,
      [
        {
          capturedDay: '2026-09-13',
          impressions: 0,
          reactions: 0,
          comments: 0,
          shares: 0,
          raw: null,
        },
        {
          capturedDay: '2026-09-14',
          impressions: 0,
          reactions: 0,
          comments: 3,
          shares: 0,
          raw: null,
        },
        {
          capturedDay: '2026-09-15',
          impressions: 0,
          reactions: 0,
          comments: 3,
          shares: 0,
          raw: null,
        },
      ],
      range,
    );
    assert.deepEqual(
      out[0].data.map((point) => [point.date, point.total]),
      [
        ['2026-09-10', '0'],
        ['2026-09-11', '0'],
        ['2026-09-12', '0'],
        ['2026-09-13', '0'],
        ['2026-09-14', '3'],
        ['2026-09-15', '0'],
        ['2026-09-16', '0'],
      ],
    );
  });

  it('plots Threads/X Replies from the comments snapshots as a daily bump', () => {
    const live = [
      {
        label: 'Replies',
        percentageChange: 0,
        data: [{ total: '1', date: '2026-09-16' }],
      },
    ];
    const out = overlaySnapshotSeries(
      live,
      [
        {
          capturedDay: '2026-09-14',
          impressions: 8,
          reactions: 0,
          comments: 0,
          shares: 0,
          raw: null,
        },
        {
          capturedDay: '2026-09-16',
          impressions: 8,
          reactions: 0,
          comments: 1,
          shares: 0,
          raw: null,
        },
      ],
      range,
    );
    assert.deepEqual(
      out[0].data.map((point) => point.total),
      ['0', '0', '0', '0', '0', '0', '1'],
    );
  });

  it('does the same daily bump for Views, Comments and zero series in one pass', () => {
    const live = [
      {
        label: 'Views',
        percentageChange: 0,
        data: [{ total: '8', date: '2026-09-16' }],
      },
      {
        label: 'Comments',
        percentageChange: 0,
        data: [{ total: '1', date: '2026-09-16' }],
      },
      {
        label: 'Saves',
        percentageChange: 0,
        data: [{ total: '0', date: '2026-09-16' }],
      },
    ];
    const snapshots = [
      {
        capturedDay: '2026-09-14',
        impressions: 8,
        reactions: 0,
        comments: 1,
        shares: 0,
        raw: { saves: 0, reach: 0 },
      },
      {
        capturedDay: '2026-09-16',
        impressions: 8,
        reactions: 0,
        comments: 1,
        shares: 0,
        raw: { saves: 0, reach: 0 },
      },
    ];
    const out = overlaySnapshotSeries(live, snapshots, range);
    assert.deepEqual(
      out[0].data.map((point) => point.total),
      ['0', '0', '0', '0', '8', '0', '0'],
    );
    assert.deepEqual(
      out[1].data.map((point) => point.total),
      ['0', '0', '0', '0', '1', '0', '0'],
    );
    assert.deepEqual(
      out[2].data.map((point) => point.total),
      ['0', '0', '0', '0', '0', '0', '0'],
    );
  });
});

describe('lifetimeToDailyRange', () => {
  it('puts the growth on the day the lifetime total jumped, then returns to 0', () => {
    const daily = lifetimeToDailyRange(
      [
        { total: '8', date: '2026-09-14' },
        { total: '8', date: '2026-09-16' },
      ],
      '2026-09-10',
      '2026-09-16',
    );
    assert.deepEqual(
      daily.map((point) => point.total),
      ['0', '0', '0', '0', '8', '0', '0'],
    );
  });
});
