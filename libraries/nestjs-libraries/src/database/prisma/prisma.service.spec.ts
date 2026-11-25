import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { encryptTokenFields, PrismaService } from './prisma.service.ts';

const KEYS = ['ENCRYPTION_KEY', 'ENCRYPT_INTEGRATION_TOKENS', 'DATABASE_URL'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
beforeEach(() => {
  process.env.ENCRYPTION_KEY = 'spec-key';
  delete process.env.ENCRYPT_INTEGRATION_TOKENS;
  // Nothing listens there: a write the extension lets through fails on the
  // connection instead, with another message.
  process.env.DATABASE_URL = 'postgresql://spec:spec@127.0.0.1:1/spec';
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

// The same refusal through the client every repository shares, for each shape
// of write the extension rewrites. With encryption off the extension used to
// hand the query on untouched.
describe('channel token writes through the Prisma client', () => {
  const writes = (client: any, copied: string) => [
    () =>
      client.integration.update({
        where: { id: 'channel-1' },
        data: { token: copied },
      }),
    () =>
      client.integration.updateMany({
        where: { rootInternalId: 'login-1' },
        data: { refreshToken: copied },
      }),
    () =>
      client.integration.upsert({
        where: { id: 'channel-1' },
        create: { token: copied },
        update: {},
      }),
    () =>
      client.integration.upsert({
        where: { id: 'channel-1' },
        create: {},
        update: { refreshToken: { set: copied } },
      }),
    () => client.integration.createMany({ data: [{ token: copied }] }),
  ];

  for (const encryption of ['on', 'off']) {
    it(`refuse a value that already carries the prefix, with encryption ${encryption}`, async () => {
      const copied = AuthService.encryptToken('someone-else');
      if (encryption === 'off') {
        process.env.ENCRYPT_INTEGRATION_TOKENS = 'false';
      }
      const client = new PrismaService();

      for (const write of writes(client, copied)) {
        await assert.rejects(write(), /prefix/);
      }
    });
  }
});
