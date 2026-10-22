import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TiktokProvider,
  classifyTikTokPostId,
} from './tiktok.provider.ts';
import { TiktokBusinessProvider } from './tiktok.business.provider.ts';
import { BadBody, RefreshToken } from '../social.abstract.ts';

const pictures = (count: number, ext = 'jpg') =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.${ext}` }));

// Both tiles also measure every photo with sharp, which reads the file over
// the network. These tests are about counts and formats, so each photo
// measures as TikTok allows; the size rules have their own tests below.
class MeasuredTiktokProvider extends TiktokProvider {
  constructor(
    private readonly size = { width: 1080, height: 1920 },
    private readonly videoBytes = 1024
  ) {
    super();
  }

  protected override async getImageDimensions() {
    if (!this.size) {
      throw new Error('measured');
    }
    return this.size;
  }

  protected override async mediaSize() {
    if (!this.videoBytes) {
      throw new Error('measured');
    }
    return this.videoBytes;
  }
}

class MeasuredTiktokBusinessProvider extends TiktokBusinessProvider {
  constructor(
    private readonly size = { width: 1080, height: 1920 },
    private readonly videoBytes = 1024
  ) {
    super();
  }

  protected override async getImageDimensions() {
    if (!this.size) {
      throw new Error('measured');
    }
    return this.size;
  }

  protected override async mediaSize() {
    if (!this.videoBytes) {
      throw new Error('measured');
    }
    return this.videoBytes;
  }
}

const tiles = [
  ['TikTok', new MeasuredTiktokProvider()],
  ['TikTok Business', new MeasuredTiktokBusinessProvider()],
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

describe('TikTok photo size, on the TikTok Business tile', () => {
  it('refuses a 36th picture or a BMP before measuring any of them', async () => {
    const provider = new MeasuredTiktokBusinessProvider(null as any);
    assert.equal(
      await provider.checkValidity([pictures(36)]),
      'You can select up to 35 pictures'
    );
    assert.match(
      String(await provider.checkValidity([pictures(1, 'bmp')])),
      /BMP files cannot be converted/
    );
  });

  it('takes up to 1080x1920 either way round', async () => {
    for (const size of [
      { width: 1080, height: 1920 },
      { width: 1920, height: 1080 },
      { width: 1024, height: 1536 },
    ]) {
      assert.equal(
        await new MeasuredTiktokBusinessProvider(size).checkValidity([pictures(2)]),
        true,
        `${size.width}x${size.height}`
      );
    }
  });

  it('names a picture over 1080 on its shorter side or 1920 on its longer one', async () => {
    assert.equal(
      await new MeasuredTiktokBusinessProvider({ width: 1080, height: 2400 }).checkValidity([pictures(2)]),
      'Image 1 is 1080x2400, TikTok Business allows a maximum of 1080x1920 (or 1920x1080)'
    );
    assert.equal(
      await new MeasuredTiktokBusinessProvider({ width: 1440, height: 1440 }).checkValidity([pictures(1)]),
      'Image 1 is 1440x1440, TikTok Business allows a maximum of 1080x1920 (or 1920x1080)'
    );
  });

  it('measures no video', async () => {
    const provider = new MeasuredTiktokBusinessProvider(null as any);
    assert.equal(
      await provider.checkValidity([[{ path: 'https://cdn.test/a.mp4' }]]),
      true
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

// creator_info answers HTTP 200 whether or not the creator may post; the
// reason a creator cannot post rides in error.code.
class CreatorInfoTiktokProvider extends TiktokProvider {
  constructor(private readonly reply: unknown) {
    super();
  }

  override async fetch() {
    return new Response(JSON.stringify(this.reply));
  }
}

describe('TikTok creatorInfo', () => {
  const data = {
    creator_nickname: 'RedSim',
    creator_username: 'redsim.app',
    creator_avatar_url: 'https://cdn.test/avatar.jpg',
    privacy_level_options: ['FOLLOWER_OF_CREATOR', 'SELF_ONLY'],
    max_video_post_duration_sec: 600,
    comment_disabled: false,
    duet_disabled: true,
    stitch_disabled: true,
  };

  it('names the creator and lists what they may use', async () => {
    const info = await new CreatorInfoTiktokProvider({
      data,
      error: { code: 'ok' },
    }).creatorInfo('token');
    assert.equal(info.cannotPost, undefined);
    assert.equal(info.creatorNickname, 'RedSim');
    assert.equal(info.creatorUsername, 'redsim.app');
    assert.equal(info.creatorAvatarUrl, 'https://cdn.test/avatar.jpg');
    assert.deepEqual(info.privacyLevelOptions, ['FOLLOWER_OF_CREATOR', 'SELF_ONLY']);
    assert.equal(info.maxDurationSeconds, 600);
    assert.equal(info.duetDisabled, true);
  });

  it('passes on why the creator cannot post right now', async () => {
    for (const code of [
      'spam_risk_too_many_posts',
      'spam_risk_user_banned_from_posting',
      'reached_active_user_cap',
    ]) {
      const info = await new CreatorInfoTiktokProvider({
        data: {},
        error: { code, message: '' },
      }).creatorInfo('token');
      assert.equal(info.cannotPost, code);
      assert.deepEqual(info.privacyLevelOptions, []);
    }
  });
});

// Answers each Business endpoint by its path, and keeps the URLs it was asked.
class CreatorInfoTiktokBusinessProvider extends TiktokBusinessProvider {
  readonly asked: string[] = [];

  constructor(private readonly replies: Record<string, unknown>) {
    super();
  }

  override async fetch(url: string) {
    this.asked.push(url);
    const path = Object.keys(this.replies).find((p) => url.includes(p));
    return new Response(JSON.stringify(path ? this.replies[path] : {}));
  }
}

describe('TikTok Business creatorInfo', () => {
  const account = {
    code: 0,
    data: {
      display_name: 'RedSim',
      username: 'redsim.app',
      profile_image: 'https://cdn.test/avatar.jpg',
    },
  };

  it('reads the account settings in the TikTok tile shape', async () => {
    const provider = new CreatorInfoTiktokBusinessProvider({
      '/business/video/settings/': {
        code: 0,
        data: {
          privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
          max_video_post_duration_sec: 600,
          comment_disabled: true,
          duet_disabled: false,
          stitch_disabled: true,
        },
      },
      '/business/get/': account,
    });
    const info = await provider.creatorInfo('token', {}, 'business-1');
    assert.equal(info.creatorNickname, 'RedSim');
    assert.equal(info.creatorUsername, 'redsim.app');
    assert.equal(info.creatorAvatarUrl, 'https://cdn.test/avatar.jpg');
    assert.deepEqual(info.privacyLevelOptions, ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']);
    assert.equal(info.maxDurationSeconds, 600);
    assert.equal(info.commentDisabled, true);
    assert.equal(info.duetDisabled, false);
    assert.equal(info.stitchDisabled, true);
    assert.match(provider.asked[0], /\/business\/video\/settings\/\?business_id=business-1/);
  });

  it('asks for a new token when TikTok refuses the one it has', async () => {
    const provider = new CreatorInfoTiktokBusinessProvider({
      '/business/video/settings/': {
        code: 40105,
        message: 'Access token is incorrect or has been revoked.',
      },
      '/business/get/': account,
    });
    await assert.rejects(provider.creatorInfo('token', {}, 'business-1'), RefreshToken);
  });

  it('fails rather than answering with no privacy level', async () => {
    const provider = new CreatorInfoTiktokBusinessProvider({
      '/business/video/settings/': { code: 40001, message: 'No permission' },
      '/business/get/': account,
    });
    await assert.rejects(provider.creatorInfo('token', {}, 'business-1'), BadBody);
  });
});

describe('TikTok direct post body', () => {
  const body = (settings: Record<string, unknown>) =>
    (new TiktokProvider() as any).buildTikokPostInfoBody({
      message: 'Caption',
      media: [{ path: 'https://cdn.test/a.mp4' }],
      settings: {
        content_posting_method: 'DIRECT_POST',
        privacy_level: 'SELF_ONLY',
        duet: false,
        stitch: false,
        comment: false,
        brand_content_toggle: false,
        brand_organic_toggle: false,
        ...settings,
      },
    }).post_info;

  it('never falls back to a public post', () => {
    assert.equal(body({ privacy_level: undefined }).privacy_level, 'SELF_ONLY');
    assert.equal(body({ privacy_level: '' }).privacy_level, 'SELF_ONLY');
    assert.equal(
      body({ privacy_level: 'FOLLOWER_OF_CREATOR' }).privacy_level,
      'FOLLOWER_OF_CREATOR'
    );
  });

  it('sends no brand labels once Disclose was turned off', () => {
    const off = body({ disclose: false, brand_organic_toggle: true, brand_content_toggle: true });
    assert.equal(off.brand_organic_toggle, false);
    assert.equal(off.brand_content_toggle, false);
  });

  it('keeps the brand labels of a disclosure, and of posts that never sent disclose', () => {
    const on = body({ disclose: true, brand_organic_toggle: true });
    assert.equal(on.brand_organic_toggle, true);
    const api = body({ brand_content_toggle: true, privacy_level: 'FOLLOWER_OF_CREATOR' });
    assert.equal(api.brand_content_toggle, true);
  });
});

describe('TikTok AI label', () => {
  const post = (path: string, settings: Record<string, unknown>) => ({
    message: 'Caption',
    media: [{ path }],
    settings: {
      content_posting_method: 'DIRECT_POST',
      privacy_level: 'SELF_ONLY',
      comment: false,
      autoAddMusic: 'no',
      brand_content_toggle: false,
      brand_organic_toggle: false,
      ...settings,
    },
  });
  const tiktok = (path: string, settings: Record<string, unknown>) =>
    (new TiktokProvider() as any).buildTikokPostInfoBody(post(path, settings));

  it('labels a TikTok photo beside post_info, and a video inside it', () => {
    const photo = tiktok('https://cdn.test/a.jpg', { video_made_with_ai: true });
    assert.equal(photo.is_aigc, true);
    assert.equal('is_aigc' in photo.post_info, false);
    const video = tiktok('https://cdn.test/a.mp4', { video_made_with_ai: true });
    assert.equal(video.post_info.is_aigc, true);
    assert.equal('is_aigc' in video, false);
  });

  it('leaves an unlabeled TikTok photo body as it was', () => {
    assert.equal('is_aigc' in tiktok('https://cdn.test/a.jpg', { video_made_with_ai: false }), false);
    assert.equal('is_aigc' in tiktok('https://cdn.test/a.jpg', {}), false);
  });

  it('sends no AI label with a TikTok photo going to the inbox', () => {
    const upload = tiktok('https://cdn.test/a.jpg', {
      content_posting_method: 'UPLOAD',
      video_made_with_ai: true,
    });
    assert.doesNotMatch(JSON.stringify(upload), /aigc/);
  });

  it('has no AI field to send on a TikTok Business photo, only on a video', async () => {
    const provider = new TiktokBusinessProvider() as any;
    const photo = await provider.buildPhotoBody(
      'business-1',
      post('https://cdn.test/a.jpg', { video_made_with_ai: true }),
      'token'
    );
    assert.doesNotMatch(JSON.stringify(photo), /ai_generated|aigc/);
    const video = provider.buildVideoBody(
      'business-1',
      post('https://cdn.test/a.mp4', { video_made_with_ai: true })
    );
    assert.equal(video.post_info.is_ai_generated, true);
  });
});

describe('TikTok Business media domain refusal', () => {
  it('names the refusal TikTok Business sends without an error name', () => {
    const answer = new TiktokBusinessProvider().handleErrors(
      // the sentence a live photo post got back on 2026-10-20
      JSON.stringify({
        message:
          'Please review our URL ownership verification rules at https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide/#pull_from_url.',
      })
    );
    assert.equal(answer?.type, 'bad-body');
    assert.match(String(answer?.value), /Upload the media to PostQueen/);
  });
});

describe('Upload to the TikTok inbox, on both tiles', () => {
  it('asks for video.upload on both tiles', () => {
    assert.equal(new TiktokProvider().scopes.includes('video.upload'), true);
    assert.equal(new TiktokBusinessProvider().scopes.includes('video.upload'), true);
  });
});

// The Content Posting API names the error in error.code; the Business API
// answers HTTP 200 with a numeric code. Both shapes as TikTok sends them.
const contentPosting = (code: string, message = '') =>
  JSON.stringify({ error: { code, message, log_id: '202610210000000' } });
const contentPostingFailed = (failReason: string) =>
  JSON.stringify({
    data: { status: 'FAILED', fail_reason: failReason },
    error: { code: 'ok', message: '', log_id: '202610210000000' },
  });
const business = (code: number, message: string) =>
  JSON.stringify({ code, message, request_id: '202610210000000' });
const businessFailed = (reason: string) => {
  const post = { code: 0, message: 'OK', data: { status: 'FAILED', reason } };
  // checkPostStatus hands the reason in front of the body
  return `${reason} ${JSON.stringify(post)}`;
};

describe('TikTok error mapping', () => {
  const withMigrate = (value: string | undefined, run: () => void) => {
    const before = process.env.MIGRATE_PROVIDERS;
    if (value === undefined) {
      delete process.env.MIGRATE_PROVIDERS;
    } else {
      process.env.MIGRATE_PROVIDERS = value;
    }
    try {
      run();
    } finally {
      if (before === undefined) {
        delete process.env.MIGRATE_PROVIDERS;
      } else {
        process.env.MIGRATE_PROVIDERS = before;
      }
    }
  };

  it('keeps a channel connected at the daily active user cap', () => {
    const body = contentPosting(
      'reached_active_user_cap',
      'The daily quota for active publishing users from your client is reached.'
    );
    withMigrate(undefined, () => {
      const answer = new TiktokProvider().handleErrors(body);
      assert.equal(answer?.type, 'bad-body');
      assert.match(String(answer?.value), /Your channel is fine/);
    });
    withMigrate('linkedin:linkedin-page', () => {
      assert.equal(new TiktokProvider().handleErrors(body)?.type, 'bad-body');
    });
  });

  it('disconnects at the cap only when TikTok is being migrated', () => {
    withMigrate('linkedin:linkedin-page, tiktok:tiktok-business', () => {
      const answer = new TiktokProvider().handleErrors(
        contentPosting('reached_active_user_cap')
      );
      assert.equal(answer?.type, 'disconnect');
      assert.match(String(answer?.value), /Reconnect the channel in Channels/);
      assert.doesNotMatch(String(answer?.value), /re-connect/);
    });
  });

  it('asks for a reconnect when a scope is missing, without disconnecting', () => {
    for (const code of ['scope_not_authorized', 'scope_permission_missed']) {
      const answer = new TiktokProvider().handleErrors(contentPosting(code));
      assert.equal(answer?.type, 'bad-body', code);
      assert.match(String(answer?.value), /allow every permission/);
    }
  });

  it('never resends a publish TikTok failed on its side', () => {
    const answer = new TiktokProvider().handleErrors(
      contentPosting('internal_error', 'Something went wrong.')
    );
    assert.equal(answer?.type, 'bad-body');
    assert.match(String(answer?.value), /server problem/);
  });

  it('names the status check fail_reason internal as a server problem', () => {
    const answer = new TiktokProvider().handleErrors(
      contentPostingFailed('internal')
    );
    assert.equal(answer?.type, 'retry');
    assert.match(String(answer?.value), /server problem/);
  });

  it('no longer reads "internal" or "international" in a message as a server error', () => {
    const provider = new TiktokProvider();
    assert.equal(
      provider.handleErrors(
        contentPosting('some_new_code', 'Not available for international accounts')
      ),
      undefined
    );
    assert.equal(
      provider.handleErrors(contentPosting('some_new_code', 'an internal note')),
      undefined
    );
    assert.equal(
      new TiktokBusinessProvider().handleErrors(
        business(40002, 'Not available for international accounts')
      ),
      undefined
    );
  });

  it('reads invalid_param, singular, and passes on what TikTok refused', () => {
    const answer = new TiktokProvider().handleErrors(
      contentPosting('invalid_param', 'The title is too long.')
    );
    assert.equal(answer?.type, 'bad-body');
    assert.equal(answer?.value, 'The title is too long.');
    assert.equal(
      new TiktokProvider().handleErrors(contentPosting('invalid_param'))?.value,
      'TikTok refused the post settings. Check them, then schedule the post again.'
    );
  });

  it('names a revoked app during the upload, and does not retry it', () => {
    for (const answer of [
      new TiktokProvider().handleErrors(contentPostingFailed('auth_removed')),
      new TiktokBusinessProvider().handleErrors(businessFailed('auth_removed')),
    ]) {
      assert.equal(answer?.type, 'bad-body');
      assert.match(String(answer?.value), /removed PostQueen's access/);
    }
  });

  it('names the self only gate without sending anyone to support', () => {
    const answer = new TiktokProvider().handleErrors(
      contentPosting('unaudited_client_can_only_post_to_private_accounts')
    );
    assert.match(String(answer?.value), /Self only/);
    assert.doesNotMatch(String(answer?.value), /contact support/);
  });

  it('names the daily post cap on both tiles', () => {
    assert.match(
      String(
        new TiktokProvider().handleErrors(
          contentPosting('spam_risk_too_many_posts')
        )?.value
      ),
      /about 15 posts a day/
    );
    assert.match(
      String(
        new TiktokBusinessProvider().handleErrors(
          businessFailed('spam_risk_too_many_posts')
        )?.value
      ),
      /limit of 15 posts a day/
    );
  });

  it('reads the TikTok Business token codes', () => {
    for (const code of [40102, 40104, 40105]) {
      assert.equal(
        new TiktokBusinessProvider().handleErrors(
          business(code, 'Access token error.')
        )?.type,
        'refresh-token',
        String(code)
      );
    }
  });

  it('reads the TikTok Business rate limit codes', () => {
    for (const code of [40016, 40100, 40133]) {
      const answer = new TiktokBusinessProvider().handleErrors(
        business(code, 'Requests made too frequently.')
      );
      assert.equal(answer?.type, 'bad-body', String(code));
      assert.match(String(answer?.value), /limiting requests/);
    }
  });

  it('never resends a TikTok Business publish that failed on its side', () => {
    for (const body of [
      business(50000, 'System error'),
      business(50002, 'Error processing request on TikTok side.'),
      business(60001, 'The system is in maintenance.'),
    ]) {
      const answer = new TiktokBusinessProvider().handleErrors(body);
      assert.equal(answer?.type, 'bad-body', body);
      assert.match(String(answer?.value), /server problem/);
    }
  });

  it('names the TikTok Business status reason internal as a server problem', () => {
    const answer = new TiktokBusinessProvider().handleErrors(
      businessFailed('internal')
    );
    assert.equal(answer?.type, 'retry');
    assert.match(String(answer?.value), /server problem/);
  });

  it('names the TikTok Business media size limits', () => {
    assert.match(
      String(
        new TiktokBusinessProvider().handleErrors(
          businessFailed('picture_size_check_failed')
        )?.value
      ),
      /1080x1920 or 1920x1080/
    );
  });
});

class FailedTiktokProvider extends TiktokProvider {
  constructor(private readonly failReason?: string) {
    super();
  }

  override async fetch() {
    return new Response(
      JSON.stringify({
        data: { status: 'FAILED', fail_reason: this.failReason },
        error: { code: 'ok', message: '' },
      })
    );
  }
}

describe('TikTok status check FAILED', () => {
  const check = (provider: TiktokProvider) =>
    provider.checkPostStatus(
      'token',
      { publishId: 'v_pub_file~v2-1.111' },
      { profile: 'creator' } as any
    );

  it('names the fail_reason it has no message for', async () => {
    await assert.rejects(check(new FailedTiktokProvider('something_new')), {
      message: 'TikTok did not publish the post (something_new)',
    });
    await assert.rejects(check(new FailedTiktokProvider()), {
      message: 'TikTok did not publish the post (no reason given)',
    });
  });

  it('keeps the message of a fail_reason it knows', async () => {
    await assert.rejects(
      check(new FailedTiktokProvider('frame_rate_check_failed')),
      (err: any) => err instanceof BadBody && /23 and 60/.test(err.message)
    );
  });
});

describe('TikTok video size, on both tiles', () => {
  const video = [[{ path: 'https://cdn.test/a.mp4' }]];
  const GB = 1024 ** 3;

  it('TikTok takes a video up to 4 GB, and names a larger one', async () => {
    assert.equal(
      await new MeasuredTiktokProvider(undefined, 4 * GB).checkValidity(video),
      true
    );
    assert.equal(
      await new MeasuredTiktokProvider(undefined, 4 * GB + 1).checkValidity(video),
      'TikTok accepts videos up to 4 GB. Use a smaller file.'
    );
  });

  it('TikTok Business takes a video up to 1 GB, and names a larger one', async () => {
    assert.equal(
      await new MeasuredTiktokBusinessProvider(undefined, GB).checkValidity(video),
      true
    );
    assert.equal(
      await new MeasuredTiktokBusinessProvider(undefined, GB + 1).checkValidity(video),
      'TikTok Business accepts videos up to 1 GB. Use a smaller file.'
    );
  });

  it('leaves a video whose size cannot be read to TikTok', async () => {
    assert.equal(
      await new MeasuredTiktokProvider(undefined, 0).checkValidity(video),
      true
    );
    assert.equal(
      await new MeasuredTiktokBusinessProvider(undefined, 0).checkValidity(video),
      true
    );
  });
});
