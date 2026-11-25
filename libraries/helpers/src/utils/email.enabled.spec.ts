import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { isEmailEnabled } from './email.enabled.ts';

describe('isEmailEnabled', () => {
  const keys = ['EMAIL_PROVIDER', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    process.env.EMAIL_FROM_ADDRESS = 'hello@example.com';
    process.env.EMAIL_FROM_NAME = 'PostQueen';
  });

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it('is on for every provider that sends', () => {
    for (const provider of ['resend', 'ses', 'nodemailer']) {
      process.env.EMAIL_PROVIDER = provider;
      assert.equal(isEmailEnabled(), true, provider);
    }
  });

  it('is off without a provider that sends, or without a sender', () => {
    delete process.env.EMAIL_PROVIDER;
    assert.equal(isEmailEnabled(), false);
    process.env.EMAIL_PROVIDER = 'smtp';
    assert.equal(isEmailEnabled(), false);
    process.env.EMAIL_PROVIDER = 'ses';
    delete process.env.EMAIL_FROM_NAME;
    assert.equal(isEmailEnabled(), false);
  });
});
