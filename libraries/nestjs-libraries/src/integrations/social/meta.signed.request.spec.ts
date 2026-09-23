import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { parseMetaSignedRequest } from './meta.signed.request.ts';

const secret = 'spec-app-secret';
const encode = (value: unknown) =>
  Buffer.from(
    typeof value === 'string' ? value : JSON.stringify(value)
  ).toString('base64url');
// Signed the way Meta's sample does it: HMAC-SHA256 over the encoded payload.
const sign = (payload: unknown, key = secret) => {
  const encoded = encode(payload);
  const signature = createHmac('sha256', key).update(encoded).digest('base64url');
  return `${signature}.${encoded}`;
};
// The payload Meta documents for the data deletion callback.
const payload = {
  algorithm: 'HMAC-SHA256',
  expires: 1291840400,
  issued_at: 1291836800,
  user_id: '218471',
};

describe('parseMetaSignedRequest', () => {
  it('returns the user id of a request signed with the app secret', () => {
    assert.deepEqual(parseMetaSignedRequest(sign(payload), secret), {
      platformUserId: '218471',
    });
  });

  it('rejects a request signed with another secret', () => {
    assert.equal(
      parseMetaSignedRequest(sign(payload, 'another-secret'), secret),
      null
    );
  });

  it('rejects a payload changed after it was signed', () => {
    const [signature] = sign(payload).split('.');
    const forged = encode({ ...payload, user_id: '999' });
    assert.equal(parseMetaSignedRequest(`${signature}.${forged}`, secret), null);
  });

  it('rejects an algorithm other than HMAC-SHA256, even when signed', () => {
    for (const algorithm of ['HMAC-SHA1', 'none', '', undefined]) {
      assert.equal(
        parseMetaSignedRequest(sign({ ...payload, algorithm }), secret),
        null,
        String(algorithm)
      );
    }
  });

  it('rejects a signed payload without a user id', () => {
    const { user_id, ...rest } = payload;
    assert.equal(parseMetaSignedRequest(sign(rest), secret), null);
    assert.equal(
      parseMetaSignedRequest(sign({ ...payload, user_id: '' }), secret),
      null
    );
  });

  it('rejects malformed requests', () => {
    const valid = sign(payload);
    for (const value of [
      '',
      'no-dot',
      '.',
      `.${encode(payload)}`,
      `${valid.split('.')[0]}.`,
      `${valid}.extra`,
      sign('not json'),
      sign('null'),
    ]) {
      assert.equal(parseMetaSignedRequest(value, secret), null, value);
    }
    assert.equal(parseMetaSignedRequest(undefined as any, secret), null);
  });

  it('refuses to verify anything without a secret', () => {
    assert.equal(parseMetaSignedRequest(sign(payload, ''), ''), null);
    assert.equal(parseMetaSignedRequest(sign(payload, ''), undefined), null);
  });
});
