import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import { TwitterApi } from 'twitter-api-v2';
import { XProvider } from './x.provider.ts';

// TwitterApi refuses to build a client without consumer keys.
process.env.X_API_KEY = process.env.X_API_KEY || 'x-spec-key';
process.env.X_API_SECRET = process.env.X_API_SECRET || 'x-spec-secret';

const provider = new XProvider();
const media = (...exts: string[]) =>
  exts.map((ext, i) => ({ path: `https://cdn.test/${i}.${ext}` }));
const post = { post_type: 'post' };

describe('X media per post', () => {
  it('takes up to 4 pictures, or a lone GIF or video, or nothing', async () => {
    assert.equal(await provider.checkValidity([media()], post, []), true);
    assert.equal(
      await provider.checkValidity([media('jpg', 'png', 'webp', 'jpeg')], post, []),
      true
    );
    assert.equal(await provider.checkValidity([media('gif')], post, []), true);
    assert.equal(await provider.checkValidity([media('mp4')], post, []), true);
  });

  it('refuses a fifth picture', async () => {
    assert.equal(
      await provider.checkValidity([media('jpg', 'jpg', 'jpg', 'jpg', 'jpg')], post, []),
      'X allows up to 4 pictures per post'
    );
  });

  it('refuses a GIF or a video next to anything else', async () => {
    for (const mix of [
      media('mp4', 'jpg'),
      media('gif', 'png'),
      media('mp4', 'mp4'),
      media('gif', 'gif'),
    ]) {
      assert.equal(
        await provider.checkValidity([mix], post, []),
        'X allows one video or one GIF per post, without other media'
      );
    }
  });

  it('holds every thread reply to the same rule', async () => {
    assert.equal(
      await provider.checkValidity([media('jpg'), media('mp4', 'jpg')], post, []),
      'X allows one video or one GIF per post, without other media'
    );
    assert.equal(
      await provider.checkValidity([media('mp4'), media('jpg', 'jpg')], post, []),
      true
    );
  });

  it('leaves articles to their own rules', async () => {
    const article = { post_type: 'article', article_status: 'published' };
    assert.equal(
      await provider.checkValidity([media('jpg', 'jpg', 'jpg', 'jpg', 'jpg')], article, []),
      true
    );
    assert.equal(
      await provider.checkValidity([media('mp4')], article, []),
      'X articles only support images'
    );
  });
});

describe('X Premium-only settings follow the subscription kept at connect', () => {
  // The "Verified" entry as `authenticate` stores it. A channel connected
  // before the subscription was kept has no `subscriptionType` at all.
  const connected = (longPosts: boolean, subscriptionType?: string) => [
    {
      title: 'Verified',
      description: 'Is this a verified user? (Premium)',
      type: 'checkbox',
      value: longPosts,
      ...(subscriptionType ? { subscriptionType } : {}),
    },
  ];
  const article = { post_type: 'article', article_status: 'published' };
  const replies = (who_can_reply_post: string) => ({
    post_type: 'post',
    who_can_reply_post,
  });

  it('refuses each Premium-only option when X said None', async () => {
    const none = connected(true, 'None');
    assert.equal(
      await provider.checkValidity([media()], article, none),
      'X articles need an X Premium subscription, reconnect the channel if this account has Premium now'
    );
    for (const who of ['subscribers', 'verified']) {
      assert.equal(
        await provider.checkValidity([media()], replies(who), none),
        'X only lets Premium accounts limit replies to subscribers or verified accounts, reconnect the channel if this account has Premium now'
      );
    }
    // The "Long posts" switch is on, and still cannot unlock 4000.
    assert.equal(provider.maxLength(none, post), 280);
  });

  it('keeps the options every account has when X said None', async () => {
    const none = connected(false, 'None');
    for (const who of ['everyone', 'following', 'mentionedUsers']) {
      assert.equal(
        await provider.checkValidity([media()], replies(who), none),
        true
      );
    }
  });

  it('allows all three on a paid tier', async () => {
    for (const tier of ['Basic', 'Premium', 'PremiumPlus']) {
      const paid = connected(true, tier);
      assert.equal(
        await provider.checkValidity([media()], article, paid),
        true
      );
      for (const who of ['subscribers', 'verified']) {
        assert.equal(
          await provider.checkValidity([media()], replies(who), paid),
          true
        );
      }
      assert.equal(provider.maxLength(paid, post), 4000);
    }
  });

  it('leaves an unknown subscription to the rules it had before', async () => {
    // Connected before the answer was kept, a value this code has not seen,
    // or no stored settings at all.
    for (const unknown of [
      connected(true),
      connected(true, 'SomethingNew'),
      [],
      undefined,
    ]) {
      assert.equal(
        await provider.checkValidity([media()], article, unknown as any),
        true
      );
      for (const who of ['subscribers', 'verified']) {
        assert.equal(
          await provider.checkValidity([media()], replies(who), unknown as any),
          true
        );
      }
    }
    assert.equal(provider.maxLength(connected(true), post), 4000);
    assert.equal(provider.maxLength(connected(false), post), 280);
    assert.equal(provider.maxLength(true), 4000);
    assert.equal(provider.maxLength(false), 280);
  });
});

describe('X keeps the subscription when a channel connects', () => {
  const connect = async (
    t: TestContext,
    me: { verified: boolean; subscription_type?: string }
  ) => {
    const asked: string[] = [];
    t.mock.method(TwitterApi.prototype, 'login', async () => ({
      accessToken: 'token',
      accessSecret: 'secret',
      client: {
        v2: {
          me: async (params: { 'user.fields': string[] }) => {
            asked.push(...params['user.fields']);
            return { data: { id: '1', name: 'Name', username: 'name', ...me } };
          },
        },
      },
    }));
    const auth = await provider.authenticate({
      code: 'code',
      codeVerifier: 'oauth:secret',
    });
    return { asked, verified: auth.additionalSettings[0] };
  };

  it('asks for subscription_type in the call it already makes', async (t) => {
    const { asked } = await connect(t, {
      verified: true,
      subscription_type: 'Premium',
    });
    assert.ok(asked.includes('subscription_type'));
  });

  it('keeps what X said on the Verified entry', async (t) => {
    const { verified } = await connect(t, {
      verified: true,
      subscription_type: 'Premium',
    });
    assert.equal(verified.value, true);
    assert.equal(verified.subscriptionType, 'Premium');
  });

  it('starts a verified account with no subscription on 280', async (t) => {
    const { verified } = await connect(t, {
      verified: true,
      subscription_type: 'None',
    });
    assert.equal(verified.value, false);
    assert.equal(verified.subscriptionType, 'None');
    assert.equal(provider.maxLength([verified], post), 280);
  });

  it('keeps "X did not say" apart from "X said None"', async (t) => {
    const { verified } = await connect(t, { verified: true });
    assert.equal(verified.value, true);
    assert.equal(verified.subscriptionType, undefined);
    assert.equal(provider.maxLength([verified], post), 4000);
  });
});

describe('What X bills, from the credits balance', () => {
  const publish = (message: string, index = 0, settings: any = post) =>
    provider.creditCost({ type: 'publish', message, settings, index });

  it('prices a post by whether its text carries a link', () => {
    assert.equal(publish('<p>Launch day</p>'), 40);
    assert.equal(publish('<p>Launch day https://example.com/launch</p>'), 500);
    // X links a bare domain the same way
    assert.equal(publish('<p>Read more on example.com</p>'), 500);
    assert.equal(publish('<p>write to hello@example.com</p>'), 40);
    // every item of a thread on its own
    assert.equal(publish('<p>and a reply</p>', 1), 40);
  });

  it('prices a link this instance strips as a plain post', (t) => {
    t.mock.method(provider, 'stripLinks', () => true);
    assert.equal(publish('<p>Launch day https://example.com/launch</p>'), 40);
  });

  it('prices an article by its body', () => {
    const article = { post_type: 'article' };
    assert.equal(publish('<h1>Notes</h1><p>plain</p>', 0, article), 40);
    assert.equal(
      publish('<p>see <a href="https://example.com">this</a></p>', 0, article),
      500
    );
  });

  it('charges the two methods the app calls that read a user, and nothing else', () => {
    for (const name of ['mention', 'subscriptionInfo']) {
      assert.equal(provider.creditCost({ type: 'function', name }), 25);
    }
    assert.equal(
      provider.creditCost({ type: 'function', name: 'other' }),
      undefined
    );
  });

  it('prices a plug by its look at the post and what it does when it fires', () => {
    assert.equal(
      provider.creditCost({ type: 'plug-check', plug: 'autoRepostPost' }),
      13
    );
    for (const plug of ['autoRepostPost', 'repostPostUsers']) {
      assert.equal(
        provider.creditCost({ type: 'plug-trigger', plug, fields: {} }),
        40
      );
    }
    const reply = (text: string) =>
      provider.creditCost({
        type: 'plug-trigger',
        plug: 'autoPlugPost',
        fields: { post: text },
      });
    assert.equal(reply('<p>Thanks for the likes</p>'), 40);
    assert.equal(reply('<p>Get it at https://example.com</p>'), 500);
  });
});

describe('X plugs read the like count from the post', () => {
  const client = (likes: number, calls: string[]) => ({
    singleTweet: async (id: string, params: any) => {
      calls.push(`read ${id} ${params['tweet.fields']}`);
      return { data: { id, public_metrics: { like_count: likes } } };
    },
    tweetLikedBy: async () => {
      calls.push('likers');
      return { meta: { result_count: 0 } };
    },
    retweet: async (user: string, id: string) => {
      calls.push(`repost ${id} as ${user}`);
    },
    me: async () => {
      calls.push('me');
      return { data: { id: 'someone-else' } };
    },
  });
  const integration = { token: 'a:b', internalId: '42' } as any;

  it('reposts once the post has the likes, with one post read', async (t) => {
    const calls: string[] = [];
    t.mock.getter(TwitterApi.prototype, 'v2', () => client(250, calls));
    // It waits two seconds before reposting.
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let result: boolean | undefined;
    const done = provider
      .autoRepostPost(integration, '7', { likesAmount: '200' })
      .then((value) => (result = value));
    while (result === undefined) {
      await new Promise((resolve) => setImmediate(resolve));
      t.mock.timers.tick(2000);
    }
    await done;
    assert.equal(result, true);
    assert.deepEqual(calls, ['read 7 public_metrics', 'repost 7 as 42']);
  });

  it('waits while the post has fewer', async (t) => {
    const calls: string[] = [];
    t.mock.getter(TwitterApi.prototype, 'v2', () => client(3, calls));
    assert.equal(
      await provider.autoRepostPost(integration, '7', { likesAmount: '200' }),
      false
    );
    assert.deepEqual(calls, ['read 7 public_metrics']);
  });

  it('reposts from a re-poster channel by its own id, without asking X who it is', async (t) => {
    const calls: string[] = [];
    t.mock.getter(TwitterApi.prototype, 'v2', () => client(0, calls));
    await provider.repostPostUsers(integration, integration, '7', {});
    assert.deepEqual(calls, ['repost 7 as 42']);
  });
});
