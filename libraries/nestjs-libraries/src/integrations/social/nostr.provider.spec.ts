import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { NostrProvider } from './nostr.provider.ts';

// AuthService reads the secret on every call, so setting it here is enough.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'nostr-spec-secret';

// A throwaway key: 32 bytes of hex, never used on a relay.
const KEY = '7f'.repeat(32);

const connect = async () => {
  const provider = new NostrProvider();
  (provider as any).findRelayInformation = async () => ({ name: 'spec' });
  const result = await provider.authenticate({
    code: Buffer.from(JSON.stringify({ password: KEY })).toString('base64'),
    codeVerifier: '',
  });
  if (typeof result === 'string') {
    throw new Error(result);
  }
  return { provider, accessToken: result.accessToken };
};

describe('Nostr key storage', () => {
  it('stores the private key encrypted, not in a readable JWT', async () => {
    const { accessToken } = await connect();
    assert.equal(accessToken.includes(KEY), false);
    // A JWT carries its payload as base64 between two dots.
    assert.equal(accessToken.split('.').length, 1);
    assert.throws(() => AuthService.verifyJWT(accessToken));
  });

  it('reads back the key it stored', async () => {
    const { provider, accessToken } = await connect();
    assert.equal((provider as any).getPassword(accessToken), KEY);
  });

  it('still reads channels connected before, stored as a signed JWT', () => {
    const legacy = AuthService.signJWT({ password: KEY });
    assert.equal((new NostrProvider() as any).getPassword(legacy), KEY);
  });
});
