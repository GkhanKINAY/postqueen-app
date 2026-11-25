import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getSsrfSafeAxios } from './ssrf.safe.dispatcher.ts';

const KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('the SSRF-safe axios client', () => {
  // With a proxy, axios connects to the proxy and the agents' address checks
  // only ever see the proxy's address.
  it('never goes through a proxy from the environment', () => {
    assert.equal(getSsrfSafeAxios().defaults.proxy, false);
  });

  it('refuses a private address even with a proxy set', async () => {
    process.env.HTTP_PROXY = 'http://proxy.invalid:3128';
    await assert.rejects(
      getSsrfSafeAxios().get('http://127.0.0.1:9/', { timeout: 2000 }),
      /Blocked IP/
    );
  });
});
