import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { XRPCError } from '@atproto/api';
import { XProvider } from './x.provider.ts';
import { BlueskyProvider } from './bluesky.provider.ts';
import { MastodonProvider } from './mastodon.provider.ts';
import { MastodonCustomProvider } from './mastodon.custom.provider.ts';
import { TumblrProvider } from './tumblr.provider.ts';
import { BadBody } from '../social.abstract.ts';

// TwitterApi refuses to build a client without consumer keys.
process.env.X_API_KEY = process.env.X_API_KEY || 'x-spec-key';
process.env.X_API_SECRET = process.env.X_API_SECRET || 'x-spec-secret';

const media = (...exts: string[]) =>
  exts.map((ext, i) => ({ path: `https://cdn.test/${i}.${ext}` }));

const CASHTAG =
  'X allows only one cashtag (like $TSLA) per post sent through its API. Remove the others.';

describe('X cashtags, before scheduling', () => {
  const x = new XProvider();
  const post = { post_type: 'post' };

  it('takes one cashtag, or none', async () => {
    assert.equal(await x.checkValidity([[]], post, [], ['Buying $TSLA']), true);
    assert.equal(await x.checkValidity([[]], post, [], ['No tickers']), true);
    assert.equal(await x.checkValidity([[]], post, []), true);
  });

  it('counts the same cashtag twice, in any case, as one', async () => {
    assert.equal(
      await x.checkValidity([[]], post, [], ['$TSLA up today, $tsla up again']),
      true
    );
  });

  it('refuses a second one in the post or in any thread reply', async () => {
    assert.equal(
      await x.checkValidity([[]], post, [], ['$TSLA and $AAPL']),
      CASHTAG
    );
    assert.equal(
      await x.checkValidity([[], []], post, [], ['$TSLA', '<p>$TSLA or $AAPL</p>']),
      CASHTAG
    );
  });

  it('leaves articles to their own rules', async () => {
    const article = { post_type: 'article', article_status: 'published' };
    assert.equal(
      await x.checkValidity([media('jpg')], article, [], ['$TSLA and $AAPL']),
      true
    );
  });

  it('says the same when X refuses it at publish time', () => {
    assert.deepEqual(
      x.handleErrors('{"detail":"Tweet can have a maximum of one cashtag"}'),
      { type: 'bad-body', value: CASHTAG }
    );
  });
});

describe('X errors in plain words', () => {
  const x = new XProvider();

  it('reads the video limit X names, whatever it is', () => {
    for (const minutes of ['2', '10', '140']) {
      assert.deepEqual(
        x.handleErrors(
          `{"detail":"This user is not allowed to post a video longer than ${minutes} minutes"}`
        ),
        {
          type: 'bad-body',
          value: `X lets this account post videos up to ${minutes} minutes. Trim the video and schedule it again.`,
        }
      );
    }
  });

  it('warns that a duplicate after an X outage may already be live', () => {
    for (const noun of ['Tweet', 'post']) {
      const handled = x.handleErrors(
        `{"detail":"You are not allowed to create a ${noun} with duplicate content."}`
      );
      assert.equal(handled?.type, 'bad-body');
      assert.match(handled!.value, /may already be live/);
    }
  });

  it('says the allowance ran out on a usage cap', () => {
    assert.match(
      x.handleErrors('{"title":"UsageCapExceeded","type":"usage-capped"}')!
        .value,
      /X API allowance ran out/
    );
  });

  it('no longer maps duplicate-rules, which X never sends for posts', () => {
    assert.equal(x.handleErrors('{"type":"duplicate-rules"}'), undefined);
  });

  it('says post, not Tweet', () => {
    const handled = x.handleErrors(
      '{"detail":"The Tweet contains an invalid URL."}'
    );
    assert.doesNotMatch(handled!.value, /Tweet/);
  });
});

describe('Bluesky thread replies', () => {
  // A logged-in agent that finds the parent and then has the reply refused.
  const replyingWith = (error: unknown) => {
    const bluesky = new BlueskyProvider();
    (bluesky as any).getAgent = async () => ({
      getPostThread: async () => ({
        data: { thread: { post: { cid: 'parent-cid', record: {} } } },
      }),
      post: async () => {
        throw error;
      },
    });
    return bluesky.comment(
      'did:plc:me',
      'at://did:plc:me/app.bsky.feed.post/root',
      undefined,
      'token',
      [{ id: 'reply', message: 'A reply', settings: {}, media: [] } as any],
      {} as any
    );
  };

  it('fails a refused reply with Bluesky reason, instead of retrying it', async () => {
    await assert.rejects(
      replyingWith(new XRPCError(400, 'InvalidRequest', 'Invalid record')),
      (err: any) => {
        assert.ok(err instanceof BadBody);
        assert.equal(
          err.message,
          'Bluesky refused the post, nothing was published: Invalid record'
        );
        return true;
      }
    );
  });

  it('leaves a 5xx or a rate limit to the retry it had before', async () => {
    for (const status of [429, 502]) {
      const error = new XRPCError(status, 'Upstream', 'try later');
      await assert.rejects(replyingWith(error), (err: any) => {
        assert.equal(err, error);
        return true;
      });
    }
  });
});

describe('Mastodon media per post', () => {
  const mastodon = new MastodonProvider();

  it('takes up to 4 files, or one video alone', async () => {
    assert.equal(await mastodon.checkValidity([media('jpg', 'png', 'gif', 'jpg')]), true);
    assert.equal(await mastodon.checkValidity([media('mp4')]), true);
    assert.equal(await mastodon.checkValidity([[], media('jpg')]), true);
  });

  it('refuses a fifth file, in the post or a reply', async () => {
    assert.equal(
      await mastodon.checkValidity([[], media('jpg', 'jpg', 'jpg', 'jpg', 'jpg')]),
      'Mastodon allows up to 4 files per post.'
    );
  });

  it('refuses a video next to anything else', async () => {
    assert.equal(
      await mastodon.checkValidity([media('mp4', 'jpg')]),
      'Mastodon allows one video per post, without other media.'
    );
  });

  it('leaves a custom instance to set its own limits', async () => {
    const custom = new MastodonCustomProvider();
    assert.equal(
      await custom.checkValidity([media('jpg', 'jpg', 'jpg', 'jpg', 'jpg')]),
      true
    );
    assert.equal(await custom.checkValidity([media('mp4', 'jpg')]), true);
  });
});

describe('Mastodon errors', () => {
  const mastodon = new MastodonProvider();

  it('passes on what the instance says about the login', () => {
    assert.deepEqual(
      mastodon.handleErrors(
        '{"error":"Your login is currently pending approval"}',
        403
      ),
      {
        type: 'bad-body',
        value:
          'Your login is currently pending approval. Sign in on the instance to fix it.',
      }
    );
  });

  it('waits for media that is still processing', () => {
    assert.equal(
      mastodon.handleErrors(
        '{"error":"Cannot attach files that have not finished processing. Try again in a moment!"}',
        422
      )?.type,
      'retry'
    );
  });

  it('matches the words Mastodon uses for media it cannot find', () => {
    assert.match(
      mastodon.handleErrors(
        '{"error":"Media 123 not found or already attached to another post"}',
        422
      )!.value,
      /expired before the post was published/
    );
  });

  it('waits out a rate limit', () => {
    assert.equal(
      mastodon.handleErrors('{"error":"Too many requests"}', 429)?.type,
      'retry'
    );
  });

  it('names any other refusal in the instance words', () => {
    assert.deepEqual(
      mastodon.handleErrors(
        '{"error":"Validation failed: Text character limit of 500 exceeded"}',
        422
      ),
      {
        type: 'bad-body',
        value: 'Validation failed: Text character limit of 500 exceeded',
      }
    );
  });

  it('survives a body that is not JSON', () => {
    assert.deepEqual(mastodon.handleErrors('<html>Bad gateway</html>', 422), {
      type: 'bad-body',
      value: 'Mastodon refused the post.',
    });
    assert.equal(mastodon.handleErrors('<html>Bad gateway</html>', 502), undefined);
  });
});

describe('Tumblr wording', () => {
  it('asks to reconnect the Tumblr channel', () => {
    assert.deepEqual(new TumblrProvider().handleErrors('{}', 401), {
      type: 'refresh-token',
      value: 'Reconnect the Tumblr channel.',
    });
  });

  it('passes on the reason Tumblr gives for a content format refusal', () => {
    const tumblr = new TumblrProvider();
    assert.equal(
      tumblr.handleErrors(
        '{"errors":[{"title":"Bad Request","code":8001,"detail":"Posts cannot be empty."}]}',
        400
      )?.value,
      'Posts cannot be empty.'
    );
    assert.equal(
      tumblr.handleErrors('{"errors":[{"title":"Bad Request","code":8001}]}', 400)
        ?.value,
      'Tumblr rejected the post content format.'
    );
    assert.equal(
      tumblr.handleErrors('code 8001', 400)?.value,
      'Tumblr rejected the post content format.'
    );
  });
});
