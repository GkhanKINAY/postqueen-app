import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SlackProvider } from './slack.provider.ts';
import { DiscordProvider } from './discord.provider.ts';
import { WhopProvider } from './whop.provider.ts';
import { MeweProvider } from './mewe.provider.ts';
import { TwitchProvider } from './twitch.provider.ts';
import { MoltbookProvider } from './moltbook.provider.ts';
import { FarcasterProvider } from './farcaster.provider.ts';
import { BadBody, Disconnect, RefreshToken } from '../social.abstract.ts';

// The post workflow publishes again, up to five times, after any error that
// is not a BadBody, RefreshToken or Disconnect. These are the refusals that
// used to leave a provider untyped. Telegram's are in telegram.provider.spec.ts:
// that provider cannot be loaded under tsx.

const post = (overrides: Record<string, any> = {}) =>
  [
    {
      id: 'p1',
      message: 'Hello',
      settings: { channel: 'C1', experience: 'exp_1', ...overrides },
      media: [],
    },
  ] as any;

const integration = { name: 'PostQueen', picture: '', profile: 'queen' } as any;

describe('Slack refusals', () => {
  const provider = new SlackProvider();
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const slack = (error: string, errors?: string[]) =>
    JSON.stringify({ ok: false, error, ...(errors ? { errors } : {}) });

  it('maps the codes people can act on', () => {
    assert.match(
      provider.handleErrors(slack('not_in_channel'))!.value,
      /\/invite/,
    );
    assert.match(
      provider.handleErrors(slack('channel_not_found'))!.value,
      /\/invite/,
    );
    assert.match(
      provider.handleErrors(slack('is_archived'))!.value,
      /archived/,
    );
    assert.match(
      provider.handleErrors(slack('restricted_action_read_only_channel'))!
        .value,
      /workspace setting/,
    );
    assert.match(
      provider.handleErrors(
        slack('invalid_blocks', [
          'downloading image failed [json-pointer:/blocks/1/image_url]',
        ]),
      )!.value,
      /could not download a picture/,
    );
    assert.equal(
      provider.handleErrors(slack('missing_scope'))?.type,
      'refresh-token',
    );
    assert.equal(
      provider.handleErrors(slack('not_authed'))?.type,
      'refresh-token',
    );
    assert.equal(
      provider.handleErrors(slack('rate_limited'))?.type,
      'bad-body',
    );
  });

  const answer = (error: string) => {
    globalThis.fetch = (async () => ({
      json: async () => ({ ok: false, error }),
    })) as any;
  };

  it('throws BadBody when Slack rate limits, instead of a plain Error', async () => {
    answer('ratelimited');
    await assert.rejects(
      provider.post('team', 'token', post(), integration),
      BadBody,
    );
  });

  it('throws RefreshToken for a revoked token', async () => {
    answer('token_revoked');
    await assert.rejects(
      provider.post('team', 'token', post(), integration),
      RefreshToken,
    );
  });
});

describe('Discord refusals', () => {
  const provider = new DiscordProvider();

  it('reads the JSON code, not digits anywhere in the body', () => {
    assert.match(
      provider.handleErrors(
        JSON.stringify({
          code: 10003,
          message: 'Unknown Channel',
          id: '115001300',
        }),
      )!.value,
      /no longer exists/,
    );
    assert.match(
      provider.handleErrors(JSON.stringify({ code: 50013 }))!.value,
      /missing a permission/,
    );
    assert.match(
      provider.handleErrors(JSON.stringify({ code: 50001 }))!.value,
      /cannot see this channel/,
    );
    assert.equal(provider.handleErrors('50013 not json'), undefined);
  });

  it('passes the field error of an Invalid Form Body', () => {
    assert.equal(
      provider.handleErrors(
        JSON.stringify({
          code: 50035,
          message: 'Invalid Form Body',
          errors: {
            content: {
              _errors: [
                {
                  code: 'BASE_TYPE_MAX_LENGTH',
                  message: 'Must be 2000 or fewer in length.',
                },
              ],
            },
          },
        }),
      )!.value,
      'Discord refused the post: Must be 2000 or fewer in length.',
    );
  });

  it('throws BadBody when the upload is refused', async () => {
    class RefusedDiscordProvider extends DiscordProvider {
      protected override getSsrfSafeAxios() {
        return {
          post: async () => {
            throw {
              response: {
                status: 403,
                data: { code: 50013, message: 'Missing Permissions' },
              },
            };
          },
        } as any;
      }
    }

    await assert.rejects(
      new RefusedDiscordProvider().post('guild', 'token', post()),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.match(err.message, /missing a permission/);
        return true;
      },
    );
  });
});

describe('Whop refusals', () => {
  const provider = new WhopProvider();
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('disconnects on insufficient_scope, and reads not_found from the status', () => {
    assert.equal(
      provider.handleErrors(
        JSON.stringify({ error: 'insufficient_scope' }),
        403,
      )?.type,
      'disconnect',
    );
    assert.match(
      provider.handleErrors(
        JSON.stringify({ error: { type: 'not_found' } }),
        404,
      )!.value,
      /could not find this forum/,
    );
    assert.equal(
      provider.handleErrors(JSON.stringify({ id: 'not_found_here' }), 400),
      undefined,
    );
    assert.equal(
      provider.handleErrors(
        JSON.stringify({
          error: { type: 'invalid_request', message: 'title is too long' },
        }),
        400,
      )!.value,
      'title is too long',
    );
    assert.equal(
      provider.handleErrors(
        JSON.stringify({ error: { type: 'invalid_request' } }),
        400,
      )!.value,
      'Whop refused the post because a field is not valid.',
    );
  });

  it('throws Disconnect when the token lacks the forum scope', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'insufficient_scope' }), {
        status: 403,
      })) as any;

    await assert.rejects(
      provider.post('id', 'token', post(), integration),
      Disconnect,
    );
  });
});

describe('MeWe refusals', () => {
  const provider = new MeweProvider();
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('reads the rate limit from the status, not "420" in the body', () => {
    assert.equal(provider.handleErrors('{"id":"14200"}', 400), undefined);
    assert.equal(provider.handleErrors('', 420)?.type, 'retry');
    assert.equal(provider.handleErrors('', 401)?.type, 'refresh-token');
  });

  it('asks for a new token on a 401 only, not on the word Unauthorized', () => {
    assert.equal(
      provider.handleErrors('{"message":"Unauthorized to post here"}', 400),
      undefined,
    );
  });

  it('refuses a video at scheduling instead of dropping it', async () => {
    assert.equal(
      await provider.checkValidity([[{ path: 'https://cdn.test/clip.mp4' }]]),
      'MeWe posts can include pictures but not videos.',
    );
    assert.equal(
      await provider.checkValidity([[{ path: 'https://cdn.test/photo.jpg' }]]),
      true,
    );
  });

  const answer = (status: number, body: string) => {
    globalThis.fetch = (async () => new Response(body, { status })) as any;
  };

  it('throws RefreshToken when MeWe signs the account out', async () => {
    answer(401, 'Unauthorized');
    await assert.rejects(
      provider.post('id', 'token', post({ postType: 'timeline' }), integration),
      RefreshToken,
    );
  });

  it('throws BadBody for a refused post', async () => {
    answer(403, 'Forbidden');
    await assert.rejects(
      provider.post('id', 'token', post({ postType: 'timeline' }), integration),
      BadBody,
    );
  });
});

describe('Twitch refusals', () => {
  class StubbedTwitchProvider extends TwitchProvider {
    bodies: any[] = [];
    constructor(private readonly reply: unknown) {
      super();
    }

    override async fetch(url: string, options: RequestInit = {}) {
      this.bodies.push(JSON.parse(String(options.body)));
      return { json: async () => this.reply } as Response;
    }
  }

  it('throws BadBody when Twitch answers is_sent false', async () => {
    const provider = new StubbedTwitchProvider({
      data: [
        {
          message_id: '',
          is_sent: false,
          drop_reason: {
            code: 'msg_duplicate',
            message: 'Your message is identical to the one you sent recently.',
          },
        },
      ],
    });

    await assert.rejects(
      provider.post('1', 'token', post(), integration),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.equal(
          err.message,
          'Twitch did not send the message: Your message is identical to the one you sent recently.',
        );
        return true;
      },
    );
  });

  it('does not reply to the placeholder id an announcement leaves', async () => {
    const provider = new StubbedTwitchProvider({
      data: [
        { message_id: '5b5c1e4a-7a0e-4d8c-9a2e-0f8f2d6c1a11', is_sent: true },
      ],
    });

    await provider.comment(
      '1',
      'aB3dE5gH7j',
      undefined,
      'token',
      post(),
      integration,
    );
    assert.equal(provider.bodies[0].reply_parent_message_id, undefined);
  });

  it('disconnects a token missing a scope', () => {
    assert.equal(
      new TwitchProvider().handleErrors(
        JSON.stringify({
          error: 'Unauthorized',
          status: 401,
          message: 'Missing scope: moderator:manage:announcements',
        }),
        401,
      )?.type,
      'disconnect',
    );
  });
});

describe('Moltbook limits', () => {
  const provider = new MoltbookProvider();

  it('takes a 40,000 character body', () => {
    assert.equal(provider.maxLength(), 40000);
  });

  it('names the cooldown', () => {
    assert.equal(
      provider.handleErrors(
        JSON.stringify({
          success: false,
          error: 'Slow down',
          retry_after_minutes: 12,
        }),
        429,
      )!.value,
      'Moltbook limits how often this agent can post. Schedule this one at least 12 minutes later.',
    );
  });
});

// A refusal these providers do not map is left to the shared layer, which
// passes on the platform's reason or explains the status.
describe('Unmapped chat refusals', () => {
  it('leaves any other 4xx to the shared layer', () => {
    const body = JSON.stringify({ error: 'Title is required', hint: 'Add one' });
    assert.equal(new MoltbookProvider().handleErrors(body, 400), undefined);
    assert.equal(new TwitchProvider().handleErrors(body, 400), undefined);
    assert.equal(new FarcasterProvider().handleErrors(body, 400), undefined);
  });

  it("names PostQueen's API key when Neynar answers 401", () => {
    assert.deepEqual(new FarcasterProvider().handleErrors('{}', 401), {
      type: 'bad-body',
      value: "Farcaster refused PostQueen's API access. Please contact support.",
    });
  });
});
