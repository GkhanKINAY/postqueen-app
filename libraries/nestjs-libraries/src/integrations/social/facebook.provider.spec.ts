import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FacebookProvider } from './facebook.provider.ts';
import { RefreshToken } from '../social.abstract.ts';

// The body a page post sends to /feed, with every Graph call answered here.
const feedBody = async (media: string[]) => {
  const provider = new FacebookProvider();
  let feed: any;
  (provider as any).fetch = async (url: string, init: RequestInit) => {
    if (url.includes('/feed?')) {
      feed = JSON.parse(String(init.body));
      return {
        json: async () => ({
          id: 'post',
          permalink_url: 'https://fb.test/post',
        }),
      };
    }
    return { json: async () => ({ id: 'photo' }) };
  };
  await provider.post(
    'page',
    'token',
    [
      {
        id: 'p',
        message: 'hello',
        settings: { url: 'https://postqueen.ai' },
        media: media.map((path) => ({ path })),
      },
    ] as any,
    {} as any
  );
  return feed;
};

describe('Facebook embedded URL', () => {
  it('goes out with a text post', async () => {
    const body = await feedBody([]);
    assert.equal(body.link, 'https://postqueen.ai');
    assert.equal(body.attached_media, undefined);
  });

  it('stays off a post with photos, as the composer says', async () => {
    const body = await feedBody(['https://cdn.test/a.jpg']);
    assert.equal(body.link, undefined);
    assert.deepEqual(body.attached_media, [{ media_fbid: 'photo' }]);
  });
});

describe('Facebook post metrics availability', () => {
  const provider = new FacebookProvider();
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  it('never asks for a Page story, which has no insights live or expired', () => {
    for (const age of [1, 25]) {
      assert.equal(
        provider.postMetricsAvailable({ settings: { post_type: 'story' }, publishDate: hoursAgo(age) }),
        false
      );
    }
  });

  it('keeps asking for posts and reels', () => {
    for (const settings of [{ post_type: 'post' }, { post_type: 'reel' }, {}]) {
      assert.equal(provider.postMetricsAvailable({ settings, publishDate: hoursAgo(24 * 60) }), true);
    }
  });
});

// Metrics Meta removed on 2026-06-15. One of them fails a whole insights
// request with "(#100) The value must be a valid insights metric"; the last
// three were measured doing so on v25.0 on 2026-10-20.
const REMOVED_META_METRICS = [
  /^total_video_impressions/,
  /^page_impressions/,
  /^page_posts_impressions/,
  /^page_video_views/,
  /^post_impressions/,
  /^total_video_views_unique$/,
];

describe('Facebook post metrics', () => {
  // Graph's answer per id, edge and metric list, with every request kept.
  const graph = (answer: (id: string, edge: string, metrics: string) => [number, object]) => {
    const provider = new FacebookProvider();
    const original = globalThis.fetch;
    const asked: string[] = [];
    const respond = async (url: string) => {
      const [path, query] = String(url).split('?');
      const [id, edge] = path.split('/').slice(-2);
      const metrics = new URLSearchParams(query).get('metric') || '';
      asked.push(`${id}/${edge}:${metrics}`);
      const [status, body] = answer(id, edge, metrics);
      return new Response(JSON.stringify(body), { status });
    };
    globalThis.fetch = respond as typeof fetch;
    (provider as any).fetch = respond;
    return {
      provider,
      asked,
      restore: () => {
        globalThis.fetch = original;
      },
    };
  };
  const removed = (asked: string[]) =>
    asked.flatMap((a) =>
      a
        .split(':')[1]
        .split(',')
        .filter((m) => REMOVED_META_METRICS.some((r) => r.test(m)))
    );
  // A feed post's answer as measured: the views come back once per period,
  // and nobody reacting is an empty object.
  const feedData = {
    data: [
      { name: 'post_total_media_view_unique', period: 'lifetime', values: [{ value: 40 }] },
      { name: 'post_reactions_by_type_total', period: 'lifetime', values: [{ value: {} }] },
      { name: 'post_clicks', period: 'lifetime', values: [{ value: 2 }] },
      { name: 'post_clicks_by_type', period: 'lifetime', values: [{ value: {} }] },
      { name: 'post_total_media_view_unique', period: 'day', values: [{ value: 0 }] },
    ],
  };
  // A reel's answer as measured: the total_video_* metrics are left out.
  const reelData = {
    data: [
      { name: 'fb_reels_total_plays', period: 'lifetime', values: [{ value: 12 }] },
      { name: 'post_video_likes_by_reaction_type', period: 'lifetime', values: [{ value: {} }] },
      { name: 'post_video_social_actions', period: 'lifetime', values: [{ value: { COMMENT: 1 } }] },
    ],
  };
  const answer = (id: string): [number, object] => [200, id.includes('_') ? feedData : reelData];

  it('never asks for a metric Meta removed, on any statistics request', async () => {
    const g = graph((id) => (id === 'page' ? [200, { data: [] }] : answer(id)));
    try {
      await g.provider.analytics('page', 'token', 7);
      await g.provider.postAnalytics('fb', 'token', 'page_post', 7);
      await g.provider.postAnalytics('fb', 'token', '987', 7);
      await g.provider.postsAnalytics('fb', 'token', ['page_post', '987']);
      assert.equal(g.asked.length, 5);
      assert.deepEqual(removed(g.asked), []);
    } finally {
      g.restore();
    }
  });

  it('asks a reel or video once, and maps the reel plays and empty reactions', async () => {
    const g = graph(answer);
    try {
      const [row] = await g.provider.postsAnalytics('fb', 'token', ['987']);
      assert.deepEqual(g.asked, [
        '987/video_insights:total_video_views,total_video_reactions_by_type_total,fb_reels_total_plays,post_video_likes_by_reaction_type,post_video_social_actions',
      ]);
      assert.deepEqual(
        [row.impressions, row.reactions, row.comments, row.shares],
        [12, 0, 1, null]
      );
    } finally {
      g.restore();
    }
  });

  it("keeps a feed post's lifetime views and counts no reactions as 0", async () => {
    const g = graph(answer);
    try {
      const [row] = await g.provider.postsAnalytics('fb', 'token', ['page_post']);
      assert.deepEqual([row.impressions, row.reactions], [40, 0]);
      const series = await g.provider.postAnalytics('fb', 'token', 'page_post', 7);
      assert.deepEqual(
        series.map((s) => [s.label, s.data[0].total]),
        [
          ['Impressions', '40'],
          ['Reactions', '0'],
          ['Clicks', '2'],
          ['Clicks by Type', '0'],
        ]
      );
    } finally {
      g.restore();
    }
  });

  it('shows a reel in the Statistics modal from the same metrics', async () => {
    const g = graph(answer);
    try {
      const series = await g.provider.postAnalytics('fb', 'token', '987', 7);
      assert.deepEqual(
        series.map((s) => s.label),
        ['Plays', 'Reactions', 'Engagement']
      );
    } finally {
      g.restore();
    }
  });

  it('stays quiet for a story, and still flags a dead token', async () => {
    const story = graph(() => [
      400,
      { error: { message: '(#100) Tried accessing nonexisting field (video_insights)', code: 100 } },
    ]);
    try {
      assert.deepEqual(await story.provider.postsAnalytics('fb', 'token', ['555']), []);
      assert.equal(story.asked.length, 1);
    } finally {
      story.restore();
    }
    const dead = graph(() => [
      400,
      { error: { message: 'Error validating access token: Session has expired', code: 190 } },
    ]);
    try {
      await assert.rejects(
        dead.provider.postsAnalytics('fb', 'token', ['987']),
        RefreshToken
      );
    } finally {
      dead.restore();
    }
  });
});
