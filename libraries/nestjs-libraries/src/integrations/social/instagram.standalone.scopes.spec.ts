import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { InstagramStandaloneProvider } from './instagram.standalone.provider.ts';

/**
 * A failed scope check logs what Instagram answered, to tell an unusable
 * token from a missing permission, and never a token itself.
 */
const SHORT = 'IGQshort000000000000000000000000000000';
const LONG = 'IGQlong0000000000000000000000000000000';

const answer = (shortLived: unknown, longLived: unknown) => {
  const bodies = [shortLived, longLived];
  mock.method(globalThis, 'fetch', async () => ({
    json: async () => bodies.shift(),
  }));
};

const logged = async () => {
  const lines: string[] = [];
  mock.method(console, 'error', (...args: unknown[]) =>
    lines.push(args.map(String).join(' '))
  );
  await assert.rejects(
    new InstagramStandaloneProvider().authenticate({
      code: 'code',
      codeVerifier: '',
      refresh: '',
    })
  );
  return lines.join('\n');
};

describe('Instagram (Standalone) scope check log', () => {
  afterEach(() => mock.restoreAll());

  it('says whether each token came, not what it is', async () => {
    answer(
      { access_token: SHORT, user_id: null, permissions: [] },
      { access_token: LONG, token_type: 'bearer', expires_in: 5183944 }
    );
    const line = await logged();
    assert.match(line, /scope check failed/);
    assert.match(line, /"hasShortLivedToken":true/);
    assert.match(line, /"hasToken":true/);
    assert.match(line, /"expires_in":5183944/);
    assert.doesNotMatch(line, new RegExp(`${SHORT}|${LONG}`));
  });

  it('hides a token in any other shape of answer', async () => {
    // The token inside a `data` list: the exchange reads as failed.
    answer(
      { data: [{ access_token: SHORT, user_id: '1', permissions: '' }] },
      { access_token: LONG, token_type: 'bearer', expires_in: 5183944 }
    );
    let line = await logged();
    assert.match(line, /token exchange failed/);
    assert.match(line, /"access_token":"\[hidden\]"/);
    assert.doesNotMatch(line, new RegExp(`${SHORT}|${LONG}`));

    // A long-lived answer that echoes tokens beside its error.
    answer(
      { access_token: SHORT, user_id: null, permissions: [] },
      { error: { message: 'bad', access_token: LONG }, refresh_token: LONG }
    );
    line = await logged();
    assert.match(line, /scope check failed/);
    assert.match(line, /"hasShortLivedToken":true/);
    assert.doesNotMatch(line, new RegExp(`${SHORT}|${LONG}`));
  });
});
