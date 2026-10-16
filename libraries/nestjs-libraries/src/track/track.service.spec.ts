import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { TrackService } from './track.service.ts';
import { TrackEnum } from '../user/track.enum.ts';

const realFetch = globalThis.fetch;
const env = { ...process.env };
let sent: { url: string; body: any }[];

beforeEach(() => {
  sent = [];
  process.env.FACEBOOK_PIXEL_ACCESS_TOKEN = 'token';
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL = '123';
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

const user = { id: 'u1', email: ' A@B.co ', ip: '203.0.113.1', agent: 'UA' } as any;

describe('the Meta Conversions API', () => {
  it('sends nothing until both the pixel and its token are set', async () => {
    delete process.env.FACEBOOK_PIXEL_ACCESS_TOKEN;
    await new TrackService().track('e1', '', '', TrackEnum.Purchase, {}, '', user);
    assert.equal(sent.length, 0);
  });

  it('sends one event with hashed email and the click ids', async () => {
    await new TrackService().track(
      'e1',
      '',
      '',
      TrackEnum.Purchase,
      { value: 49, currency: 'usd' },
      'abc',
      user,
      'fb.1.2.def'
    );

    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /^https:\/\/graph\.facebook\.com\/v[\d.]+\/123\/events$/);
    const [event] = sent[0].body.data;
    assert.equal(event.event_name, 'Purchase');
    assert.equal(event.event_id, 'e1');
    assert.equal(event.user_data.client_ip_address, '203.0.113.1');
    assert.equal(event.user_data.client_user_agent, 'UA');
    // trimmed and lowercased before hashing, as Meta asks
    assert.match(event.user_data.em[0], /^[0-9a-f]{64}$/);
    assert.match(event.user_data.fbc, /^fb\.1\.\d+\.abc$/);
    assert.equal(event.user_data.fbp, 'fb.1.2.def');
    assert.deepEqual(event.custom_data, { value: 49, currency: 'USD' });
  });

  it('never throws when Meta fails or refuses', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    await assert.doesNotReject(
      new TrackService().track('e1', '1.1.1.1', 'UA', TrackEnum.Purchase, {})
    );
    globalThis.fetch = (async () => new Response('bad', { status: 400 })) as typeof fetch;
    await assert.doesNotReject(
      new TrackService().track('e1', '1.1.1.1', 'UA', TrackEnum.Purchase, {})
    );
  });
});
