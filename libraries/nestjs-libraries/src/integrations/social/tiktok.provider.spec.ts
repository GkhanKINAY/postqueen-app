import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TiktokProvider,
  classifyTikTokPostId,
} from './tiktok.provider.ts';
import { TiktokBusinessProvider } from './tiktok.business.provider.ts';

const pictures = (count: number, ext = 'jpg') =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.${ext}` }));

// The TikTok tile also measures every photo with sharp, which reads the file
// over the network. These tests are about counts and formats, so each photo
// measures as TikTok allows; the size rule has its own test below.
class MeasuredTiktokProvider extends TiktokProvider {
  constructor(private readonly size = { width: 1080, height: 1920 }) {
    super();
  }

  protected override async getImageDimensions() {
    if (!this.size) {
      throw new Error('measured');
    }
    return this.size;
  }
}

const tiles = [
  ['TikTok', new MeasuredTiktokProvider()],
  ['TikTok Business', new TiktokBusinessProvider()],
] as const;

describe('TikTok photo limits, on both tiles', () => {
  for (const [name, provider] of tiles) {
    it(`${name}: takes up to 35 pictures, not 36`, async () => {
      assert.equal(await provider.checkValidity([pictures(35)]), true);
      assert.equal(
        await provider.checkValidity([pictures(36)]),
        'You can select up to 35 pictures'
      );
    });

    it(`${name}: converts pictures, and refuses the one format it cannot convert`, async () => {
      assert.equal(provider.convertToJPEG, true);
      for (const ext of ['png', 'gif', 'avif', 'tiff', 'webp']) {
        assert.equal(await provider.checkValidity([pictures(2, ext)]), true, ext);
      }
      assert.match(
        String(await provider.checkValidity([pictures(1, 'bmp')])),
        /BMP files cannot be converted/
      );
    });

    it(`${name}: keeps the one-video rule`, async () => {
      assert.equal(
        await provider.checkValidity([[{ path: 'https://cdn.test/a.mp4' }]]),
        true
      );
      assert.equal(
        await provider.checkValidity([
          [{ path: 'https://cdn.test/a.mp4' }, { path: 'https://cdn.test/b.jpg' }],
        ]),
        'Only pictures are supported when selecting multiple items'
      );
    });
  }
});

describe('TikTok photo size, on the TikTok tile', () => {
  it('refuses a 36th picture or a BMP before measuring any of them', async () => {
    const provider = new MeasuredTiktokProvider(null as any);
    assert.equal(
      await provider.checkValidity([pictures(36)]),
      'You can select up to 35 pictures'
    );
    assert.match(
      String(await provider.checkValidity([pictures(1, 'bmp')])),
      /BMP files cannot be converted/
    );
  });

  it('still names a picture over 1080px on its shorter side', async () => {
    const provider = new MeasuredTiktokProvider({ width: 1086, height: 1448 });
    assert.equal(
      await provider.checkValidity([pictures(2)]),
      'Image 1 is 1086x1448, TikTok allows a maximum of 1080px on the shorter side'
    );
  });
});

describe('TikTok releaseId shapes', () => {
  it('reads an integer as a video id', () => {
    assert.equal(classifyTikTokPostId('7686589375119149078'), 'video');
  });

  it('reads every publish id kind as a publish id, not only v_pub_url', () => {
    for (const id of [
      'v_pub_url~v2-1.7686589375119149078',
      'v_pub_file~v2-1.7686589375119149078',
      'p_pub_url~v2.7686589375119149078',
    ]) {
      assert.equal(classifyTikTokPostId(id), 'publish', id);
    }
  });

  it('skips anything else, such as the inbox marker', () => {
    for (const id of ['missing', '', '123abc']) {
      assert.equal(classifyTikTokPostId(id), 'skip', id);
    }
  });
});

// Answers the two TikTok endpoints postsAnalytics calls, and records what went
// into video_ids. A non-integer id fails the whole batch, as TikTok does.
class StubbedTiktokProvider extends TiktokProvider {
  videoIdBatches: string[][] = [];

  override async fetch(url: string, options: RequestInit = {}) {
    const body = JSON.parse(String(options.body));
    if (url.includes('/post/publish/status/fetch/')) {
      // Written as raw JSON numbers, the way TikTok sends them: an int64
      // past 2^53 only survives when it is read from the text.
      const published: Record<string, string> = {
        'v_pub_file~v2-1.111': '222',
        'v_pub_url~v2-1.333': '444',
        'v_pub_file~v2-1.big': '7559000000000000123',
        'p_pub_url~v2-1.photo': '666',
        'v_inbox_file~v2-1.draft': '777',
      };
      const id = published[body.publish_id];
      return new Response(
        id ? `{"data":{"publicaly_available_post_id":[${id}]}}` : '{"data":{}}'
      );
    }
    const ids: string[] = body.filters.video_ids;
    this.videoIdBatches.push(ids);
    if (ids.some((id) => !/^\d+$/.test(id))) {
      return new Response(
        JSON.stringify({ error: { code: 'invalid_params' }, data: {} })
      );
    }
    return new Response(
      JSON.stringify({
        data: {
          videos: ids.map((id) => ({ id, view_count: 10, like_count: 1 })),
        },
      })
    );
  }
}

describe('TikTok postsAnalytics with mixed releaseIds', () => {
  it('resolves publish ids, skips the rest, and sends only integers', async () => {
    const provider = new StubbedTiktokProvider();
    const rows = await provider.postsAnalytics('integration', 'token', [
      '555',
      'v_pub_file~v2-1.111',
      'v_pub_url~v2-1.333',
      'v_pub_file~v2-1.unresolved',
      'v_pub_file~v2-1.big',
      'missing',
    ]);

    assert.deepEqual(provider.videoIdBatches, [
      ['555', '222', '444', '7559000000000000123'],
    ]);
    assert.deepEqual(
      rows.map((r) => r.platformPostId).sort(),
      [
        '555',
        'v_pub_file~v2-1.111',
        'v_pub_url~v2-1.333',
        'v_pub_file~v2-1.big',
      ].sort()
    );
  });
});

describe('TikTok resolveReleaseId', () => {
  const integration = { profile: 'creator' } as any;

  it('resolves a publish id to the full post id, under /photo/ for photos', async () => {
    const provider = new StubbedTiktokProvider();
    assert.deepEqual(
      await provider.resolveReleaseId('token', 'v_pub_file~v2-1.big', integration, {}, ''),
      {
        postId: '7559000000000000123',
        releaseURL: 'https://www.tiktok.com/@creator/video/7559000000000000123',
      }
    );
    assert.deepEqual(
      await provider.resolveReleaseId('token', 'p_pub_url~v2-1.photo', integration, {}, ''),
      { postId: '666', releaseURL: 'https://www.tiktok.com/@creator/photo/666' }
    );
  });

  it('reports pending, unavailable, or nothing to resolve', async () => {
    const provider = new StubbedTiktokProvider();
    assert.deepEqual(
      await provider.resolveReleaseId('token', 'v_pub_file~v2-1.unresolved', integration, {}, ''),
      { pending: true }
    );
    assert.deepEqual(
      await provider.resolveReleaseId('token', 'v_pub_file~v2-1.111', integration, { privacy_level: 'SELF_ONLY' }, ''),
      { unavailable: true }
    );
    assert.equal(
      await provider.resolveReleaseId('token', '555', integration, {}, ''),
      undefined
    );
  });

  it('connects an inbox draft through the publish id in its URL fragment', async () => {
    const provider = new StubbedTiktokProvider();
    const inbox = 'https://www.tiktok.com/messages?lang=en';
    assert.deepEqual(
      await provider.resolveReleaseId('token', 'missing', integration, { privacy_level: 'SELF_ONLY' }, `${inbox}#v_inbox_file~v2-1.draft`),
      { postId: '777', releaseURL: 'https://www.tiktok.com/@creator/video/777' }
    );
    // not published yet: keep opening the inbox
    assert.equal(
      await provider.resolveReleaseId('token', 'missing', integration, {}, `${inbox}#v_inbox_file~v2-1.unresolved`),
      undefined
    );
    // stored before the fragment existed: no request at all
    assert.equal(
      await provider.resolveReleaseId('token', 'missing', integration, {}, inbox),
      undefined
    );
  });
});
