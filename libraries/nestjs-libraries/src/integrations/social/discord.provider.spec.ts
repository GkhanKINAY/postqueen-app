import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DiscordProvider } from './discord.provider.ts';

const bits = (value: bigint) =>
  Array.from({ length: 50 }, (_, i) => BigInt(i)).filter(
    (i) => value & (1n << i)
  );

describe('Discord install permissions', () => {
  it('ask for View Channel, Embed Links and Attach Files on top of the old set', async () => {
    const { url } = await new DiscordProvider().generateAuthUrl();
    const permissions = BigInt(new URL(url).searchParams.get('permissions')!);
    assert.deepEqual(bits(permissions), [10n, 11n, 14n, 15n, 35n, 36n, 38n]);
    // Everything the old integer asked for is still asked for.
    assert.equal(permissions & 377957124096n, 377957124096n);
  });

  it('keep the same OAuth scopes, which is what connecting checks', async () => {
    const { url } = await new DiscordProvider().generateAuthUrl();
    assert.equal(new URL(url).searchParams.get('scope'), 'bot identify guilds');
  });
});

describe('Discord channel picker', () => {
  it('lists text and announcement channels, not forums', async () => {
    const provider = new DiscordProvider();
    (provider as any).fetch = async () => ({
      json: async () => [
        { id: 1, name: 'general', type: 0 },
        { id: 2, name: 'voice', type: 2 },
        { id: 3, name: 'news', type: 5 },
        { id: 4, name: 'forum', type: 15 },
      ],
    });
    assert.deepEqual(await provider.channels('token', {}, 'guild'), [
      { id: '1', name: 'general' },
      { id: '3', name: 'news' },
    ]);
  });
});

describe('Discord follow-ups', () => {
  const run = async (lastCommentId?: string) => {
    const provider = new DiscordProvider();
    const threadsCreated: string[] = [];
    const sentTo: string[] = [];
    (provider as any).fetch = async (url: string) => {
      threadsCreated.push(url);
      return { json: async () => ({ id: 'root-message' }) };
    };
    (provider as any).sendMessageWithMedia = async (channel: string) => {
      sentTo.push(channel);
      return { id: 'reply' };
    };
    await provider.comment(
      'guild',
      'root-message',
      lastCommentId,
      'token',
      [{ id: 'c', message: 'hi', settings: { channel: 'channel-1' } }] as any,
      {} as any
    );
    return { threadsCreated, sentTo };
  };

  it('start a thread on the post with the first one', async () => {
    const { threadsCreated, sentTo } = await run(undefined);
    assert.equal(threadsCreated.length, 1);
    assert.match(threadsCreated[0], /channels\/channel-1\/messages\/root-message\/threads$/);
    assert.deepEqual(sentTo, ['root-message']);
  });

  it('keep the second and later ones in that thread, whose id is the post id', async () => {
    const { threadsCreated, sentTo } = await run('previous-reply');
    assert.deepEqual(threadsCreated, []);
    assert.deepEqual(sentTo, ['root-message']);
  });
});
