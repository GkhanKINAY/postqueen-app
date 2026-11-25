import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { encryptTokenFields } from './prisma.service.ts';

const KEYS = ['ENCRYPTION_KEY', 'ENCRYPT_INTEGRATION_TOKENS'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
beforeEach(() => {
  process.env.ENCRYPTION_KEY = 'spec-key';
  delete process.env.ENCRYPT_INTEGRATION_TOKENS;
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

// What every write of a channel's tokens goes through.
describe('channel tokens on write', () => {
  it('are stored encrypted, and read back as written', () => {
    const out = encryptTokenFields({
      token: 'access',
      refreshToken: { set: 'refresh' },
      name: 'Channel',
    });

    assert.ok(AuthService.isEncryptedToken(out.token));
    assert.equal(AuthService.decryptToken(out.token), 'access');
    assert.equal(AuthService.decryptToken(out.refreshToken.set), 'refresh');
    assert.equal(out.name, 'Channel');
  });

  it('stay plain with encryption switched off', () => {
    process.env.ENCRYPT_INTEGRATION_TOKENS = 'false';
    assert.deepEqual(encryptTokenFields({ token: 'access' }), {
      token: 'access',
    });
  });

  // Every read decrypts a value with the prefix, so one handed in as a token
  // would come back as the token it was encrypted from.
  for (const encryption of ['on', 'off']) {
    it(`refuse a value that already carries the prefix, with encryption ${encryption}`, () => {
      const copied = AuthService.encryptToken('someone-else');
      if (encryption === 'off') {
        process.env.ENCRYPT_INTEGRATION_TOKENS = 'false';
      }

      assert.throws(() => encryptTokenFields({ token: copied }), /prefix/);
      assert.throws(
        () => encryptTokenFields({ refreshToken: { set: copied } }),
        /prefix/
      );
    });
  }
});
