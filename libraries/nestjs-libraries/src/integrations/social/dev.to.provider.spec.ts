import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { DevToProvider } from './dev.to.provider.ts';

const realFetch = globalThis.fetch;

const answer = (body: unknown, status = 200) => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status })) as typeof fetch;
};

const connect = () =>
  new DevToProvider().authenticate({
    code: Buffer.from(JSON.stringify({ apiKey: 'key' })).toString('base64'),
    codeVerifier: '',
  });

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('DEV connect', () => {
  it('refuses a key DEV rejects instead of saving a channel without an id', async () => {
    answer({ error: 'unauthorized', status: 401 }, 401);
    assert.equal(await connect(), 'Invalid credentials');
  });

  it('returns the profile for a key DEV accepts', async () => {
    answer({
      id: 7,
      name: 'Ada',
      username: 'ada',
      profile_image: 'https://dev.test/a.png',
    });
    const auth = await connect();
    assert.ok(typeof auth !== 'string');
    assert.equal(auth.id, 7);
    assert.equal(auth.username, 'ada');
    assert.equal(auth.accessToken, 'key');
  });
});
