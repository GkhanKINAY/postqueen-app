import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { AuthService, INTEGRATION_TOKEN_PREFIX } from './auth.service.ts';

const saved = {
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  PREVIOUS_ENCRYPTION_KEY: process.env.PREVIOUS_ENCRYPTION_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
};

function setEnv(name: keyof typeof saved, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('AuthService.encryptToken / decryptToken', () => {
  beforeEach(() => {
    setEnv('ENCRYPTION_KEY', 'current-key');
    setEnv('PREVIOUS_ENCRYPTION_KEY', undefined);
    setEnv('JWT_SECRET', 'jwt-secret');
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      setEnv(name as keyof typeof saved, value);
    }
  });

  it('round-trips a token, with a fresh IV each time', () => {
    const first = AuthService.encryptToken('EAAB-access-token');
    const second = AuthService.encryptToken('EAAB-access-token');
    assert.ok(first.startsWith(INTEGRATION_TOKEN_PREFIX));
    assert.notEqual(first, second);
    assert.equal(AuthService.decryptToken(first), 'EAAB-access-token');
    assert.equal(AuthService.decryptToken(second), 'EAAB-access-token');
  });

  it('reads a value stored before encryption as it is', () => {
    assert.equal(AuthService.decryptToken('plain-token'), 'plain-token');
  });

  it('leaves an empty value and an encrypted one alone', () => {
    const encrypted = AuthService.encryptToken('x');
    assert.equal(AuthService.encryptToken(''), '');
    assert.equal(AuthService.encryptToken(encrypted), encrypted);
  });

  it('decrypts under PREVIOUS_ENCRYPTION_KEY after a rotation', () => {
    const underOld = AuthService.encryptToken('rotated');
    setEnv('ENCRYPTION_KEY', 'new-key');
    setEnv('PREVIOUS_ENCRYPTION_KEY', 'current-key');
    assert.equal(AuthService.decryptToken(underOld), 'rotated');
  });

  it('reads an unknown key or a tampered value as empty instead of throwing', () => {
    const value = AuthService.encryptToken('secret');
    const tampered = value.slice(0, -2) + (value.endsWith('AA') ? 'BB' : 'AA');
    assert.equal(AuthService.decryptToken(tampered), '');
    setEnv('ENCRYPTION_KEY', 'unrelated-key');
    assert.equal(AuthService.decryptToken(value), '');
  });
});
