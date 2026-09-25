import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ThrottlerRealIpGuard } from './throttler.provider.ts';

// The guard keys on `req.ip`; which address that is, and why a client cannot
// pick it, is Express `trust proxy`, covered in user/client.ip.spec.ts.
const tracker = (req: Record<string, any>) =>
  (
    new ThrottlerRealIpGuard({} as any, {} as any, {} as any) as any
  ).getTracker(req) as Promise<string>;

describe('ThrottlerRealIpGuard', () => {
  it('keys on the resolved client address', async () => {
    assert.equal(
      await tracker({
        headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 172.19.0.1' },
        ip: '203.0.113.9',
      }),
      '203.0.113.9'
    );
  });

  it('does not read X-Forwarded-For itself', async () => {
    // Neither the first entry (the client's) nor the last (our Docker
    // gateway) may become the bucket.
    assert.equal(
      await tracker({
        headers: { 'x-forwarded-for': '6.6.6.6, 172.19.0.1' },
        ip: '198.51.100.4',
      }),
      '198.51.100.4'
    );
  });
});
