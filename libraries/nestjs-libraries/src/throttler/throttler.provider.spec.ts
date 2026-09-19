import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ThrottlerRealIpGuard } from './throttler.provider.ts';

// getTracker is the whole security property of this guard: a client must not
// be able to pick its own bucket by sending its own X-Forwarded-For.
const tracker = (req: Record<string, any>) =>
  (
    new ThrottlerRealIpGuard({} as any, {} as any, {} as any) as any
  ).getTracker(req) as Promise<string>;

describe('ThrottlerRealIpGuard', () => {
  it('keys on the address our proxy appended, not the one the client sent', async () => {
    assert.equal(
      await tracker({
        headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' },
        ip: '127.0.0.1',
      }),
      '203.0.113.9'
    );
  });

  it('gives a spoofed header the same bucket as no header from that peer', async () => {
    const spoofed = await tracker({
      headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.9' },
      ip: '127.0.0.1',
    });
    const honest = await tracker({
      headers: { 'x-forwarded-for': '203.0.113.9' },
      ip: '127.0.0.1',
    });
    assert.equal(spoofed, honest);
  });

  it('falls back to the socket address without a forwarded header', async () => {
    assert.equal(await tracker({ headers: {}, ip: '198.51.100.4' }), '198.51.100.4');
  });
});
