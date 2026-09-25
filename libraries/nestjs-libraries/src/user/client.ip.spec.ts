import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { TRUSTED_PROXIES } from './client.ip.ts';

// `req.ip` exactly as the backend resolves it: a real Express app with the
// same `trust proxy` value main.ts sets, and a request that arrives from
// `socket` carrying `forwardedFor`.
const clientIp = (
  socket: string,
  forwardedFor?: string,
  trust: string | false = TRUSTED_PROXIES
) => {
  const app = express();
  app.set('trust proxy', trust);
  const connection = { remoteAddress: socket };
  const req = Object.create(app.request, {
    headers: {
      value: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    },
    socket: { value: connection },
    connection: { value: connection },
  });
  return req.ip as string;
};

// Production: the host's nginx appends the client, the container's nginx
// appends the Docker gateway and connects from loopback.
const PROD = (client: string, spoofed?: string) =>
  [spoofed, client, '172.19.0.1'].filter(Boolean).join(', ');

describe('ClientIp through trust proxy', () => {
  it('finds the client behind both of our proxies', () => {
    assert.equal(clientIp('127.0.0.1', PROD('8.8.8.8')), '8.8.8.8');
  });

  it('ignores whatever the client wrote in the header', () => {
    assert.equal(clientIp('127.0.0.1', PROD('8.8.8.8', '6.6.6.6')), '8.8.8.8');
    assert.equal(
      clientIp('127.0.0.1', PROD('8.8.8.8', '6.6.6.6, 10.0.0.1')),
      '8.8.8.8'
    );
  });

  it('reads an IPv4-mapped or IPv6 loopback socket the same way', () => {
    assert.equal(clientIp('::ffff:127.0.0.1', PROD('8.8.8.8')), '8.8.8.8');
    assert.equal(clientIp('::1', PROD('8.8.8.8')), '8.8.8.8');
  });

  it('keeps an IPv6 client', () => {
    assert.equal(clientIp('127.0.0.1', PROD('2001:db8::7')), '2001:db8::7');
  });

  it('works behind a single proxy too', () => {
    assert.equal(
      clientIp('127.0.0.1', '6.6.6.6, 203.0.113.9'),
      '203.0.113.9'
    );
  });

  it('skips an entry that is not an address', () => {
    assert.equal(
      clientIp('127.0.0.1', PROD('203.0.113.9', 'garbage')),
      '203.0.113.9'
    );
  });

  it('ignores the header from a peer that is not ours', () => {
    assert.equal(clientIp('198.51.100.4', '6.6.6.6'), '198.51.100.4');
  });

  it('falls back to the socket without a header', () => {
    assert.equal(clientIp('127.0.0.1'), '127.0.0.1');
  });

  it('is the setting that does it: without it every request is loopback', () => {
    assert.equal(clientIp('127.0.0.1', PROD('8.8.8.8'), false), '127.0.0.1');
  });
});
