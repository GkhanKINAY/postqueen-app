import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { RedditProvider, redditRateLimitWait } from './reddit.provider.ts';

/**
 * Reddit refuses a submit with RATELIMIT (an HTTP 200 carrying an errors
 * array) and says how long to wait. The post used to be resubmitted, media
 * re-uploaded, on every 20-second check until the workflow gave up with
 * "could not confirm". These pin down the wait: no call to Reddit until it is
 * over, one more try, then a failure in Reddit's own words.
 */

const realFetch = globalThis.fetch;
let calls: string[] = [];

const answer = (body: unknown) => {
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
};

const noNetwork = () => {
  globalThis.fetch = (async (url: string) => {
    throw new Error(`unexpected call to ${url}`);
  }) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = realFetch;
  calls = [];
});

const RATELIMIT = (text: string, ratelimit?: number) => ({
  json: {
    errors: [['RATELIMIT', text, 'ratelimit']],
    ...(ratelimit ? { ratelimit } : {}),
  },
});

const sub = (name: string) => ({
  value: { subreddit: `r/${name}`, title: 'Launch', type: 'self' },
});

const armed = (sr: string) => ({
  sr,
  title: 'Launch',
  armedAt: Date.now(),
  media: false,
  submitted: false,
  lookups: 0,
});

const pending = (extra: Record<string, any> = {}) => ({
  subreddits: [sub('first')],
  message: 'Hello',
  cursor: 0,
  results: [],
  armed: armed('first'),
  ...extra,
});

const integration = { profile: 'poster' } as any;
const MINUTE = 60 * 1000;

const rejectsWith = (promise: Promise<unknown>, pattern: RegExp) =>
  assert.rejects(promise, (err: any) => {
    assert.match(String(err?.message), pattern);
    return true;
  });

describe('redditRateLimitWait', () => {
  it('prefers the ratelimit field, in seconds', () => {
    assert.equal(
      redditRateLimitWait(RATELIMIT('Take a break for 9 minutes', 297.4).json),
      297400
    );
  });

  it('reads the wait from the message, a unit up for minutes', () => {
    assert.equal(
      redditRateLimitWait(
        RATELIMIT(
          "Looks like you've been doing that a lot. Take a break for 5 minutes before trying again."
        ).json
      ),
      6 * MINUTE
    );
    assert.equal(
      redditRateLimitWait(
        RATELIMIT('you are doing that too much. try again in 30 seconds.').json
      ),
      30 * 1000
    );
    assert.equal(
      redditRateLimitWait(RATELIMIT('try again in 1 minute').json),
      2 * MINUTE
    );
  });

  it('gives up when there is no number', () => {
    assert.equal(
      redditRateLimitWait(RATELIMIT('you are doing that too much').json),
      undefined
    );
  });
});

describe('Reddit RATELIMIT', () => {
  it('waits out the time Reddit gave instead of resubmitting', async () => {
    answer(RATELIMIT('Take a break for 9 minutes before trying again.'));
    const before = Date.now();

    const result: any = await new RedditProvider().finalizePost(
      'token',
      pending() as any,
      integration
    );

    assert.equal(result.status, 'pending');
    assert.equal(result.pendingData.armed, undefined);
    assert.equal(calls.length, 1);
    const until = result.pendingData.rateLimit.until;
    assert.ok(until >= before + 10 * MINUTE + 15 * 1000);
    assert.ok(until <= Date.now() + 10 * MINUTE + 15 * 1000);
    assert.equal(result.pendingData.rateLimit.cursor, 0);
  });

  it('does not call Reddit while the wait is running', async () => {
    noNetwork();
    const result: any = await new RedditProvider().checkPostStatus(
      'token',
      pending({
        armed: undefined,
        rateLimit: {
          until: Date.now() + 5 * MINUTE,
          cursor: 0,
          waited: 5 * MINUTE,
          reason: 'slow down',
        },
      }) as any,
      integration
    );

    assert.equal(result.status, 'pending');
  });

  it('arms the same subreddit again once the wait is over', async () => {
    noNetwork();
    const result: any = await new RedditProvider().checkPostStatus(
      'token',
      pending({
        armed: undefined,
        rateLimit: {
          until: Date.now() - 1,
          cursor: 0,
          waited: 5 * MINUTE,
          reason: 'slow down',
        },
      }) as any,
      integration
    );

    assert.equal(result.status, 'ready');
    assert.equal(result.pendingData.armed.sr, 'first');
  });

  it('fails with Reddit’s reason when the same subreddit is refused again', async () => {
    answer(RATELIMIT('Take a break for 2 minutes before trying again.'));

    await rejectsWith(
      new RedditProvider().finalizePost(
        'token',
        pending({
          rateLimit: {
            until: Date.now() - 1,
            cursor: 0,
            waited: 5 * MINUTE,
            reason: 'earlier',
          },
        }) as any,
        integration
      ),
      /r\/first was not posted: Take a break for 2 minutes/
    );
  });

  it('fails at once when the wait is longer than the check budget', async () => {
    answer(RATELIMIT('Take a break for 60 minutes before trying again.'));

    await rejectsWith(
      new RedditProvider().finalizePost('token', pending() as any, integration),
      /limiting how often this account can post/
    );
  });

  it('names the subreddits that were already published', async () => {
    answer(RATELIMIT('Take a break for 60 minutes before trying again.'));

    await rejectsWith(
      new RedditProvider().finalizePost(
        'token',
        pending({
          subreddits: [sub('first'), sub('second')],
          cursor: 1,
          results: [{ postId: 't3_a', releaseURL: 'https://reddit.com/a' }],
          armed: armed('second'),
        }) as any,
        integration
      ),
      /r\/second was not posted: .* Already published to r\/first\. Post only the remaining subreddits again\./
    );
  });

  it('counts the waiting across subreddits', async () => {
    answer(RATELIMIT('Take a break for 9 minutes before trying again.'));

    await rejectsWith(
      new RedditProvider().finalizePost(
        'token',
        pending({
          subreddits: [sub('first'), sub('second')],
          cursor: 1,
          results: [{ postId: 't3_a', releaseURL: 'https://reddit.com/a' }],
          armed: armed('second'),
          rateLimit: {
            until: Date.now() - 1,
            cursor: 0,
            waited: 10 * MINUTE,
            reason: 'earlier',
          },
        }) as any,
        integration
      ),
      /r\/second was not posted/
    );
  });

  it('still fails at once on any other refusal', async () => {
    answer({ json: { errors: [['SUBREDDIT_NOEXIST', 'that subreddit does not exist', 'sr']] } });

    await rejectsWith(
      new RedditProvider().finalizePost('token', pending() as any, integration),
      /Reddit rejected the post to r\/first: that subreddit does not exist/
    );
  });

  it('fails the blocking post() path with the reason instead of "took too long"', async () => {
    answer(RATELIMIT('Take a break for 10 minutes before trying again.', 600));
    const started = Date.now();

    await rejectsWith(
      new RedditProvider().post(
        'id',
        'token',
        [
          {
            id: 'p1',
            message: 'Hello',
            settings: { subreddit: [sub('first')] },
            media: [],
          } as any,
        ],
        integration
      ),
      /limiting how often this account can post, r\/first was not posted/
    );
    assert.ok(Date.now() - started < 5000);
  });
});
