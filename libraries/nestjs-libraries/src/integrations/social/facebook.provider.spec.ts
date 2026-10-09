import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FacebookProvider } from './facebook.provider.ts';

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
