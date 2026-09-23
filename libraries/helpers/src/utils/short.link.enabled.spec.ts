import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isShortLinkEnabled } from './short.link.enabled.ts';

const KEYS = [
  'DUB_TOKEN',
  'SHORT_IO_SECRET_KEY',
  'KUTT_API_KEY',
  'LINK_DRIP_API_KEY',
];

describe('isShortLinkEnabled', () => {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  it('is off with no shortener configured', () => {
    assert.equal(isShortLinkEnabled(), false);
  });

  it('is on with any one shortener configured', () => {
    for (const key of KEYS) {
      process.env[key] = 'test';
      assert.equal(isShortLinkEnabled(), true, key);
      delete process.env[key];
    }
  });

  // The backend picks its provider from the same variables. If it learns a new
  // one and this does not, the settings and the statistics hide a shortener
  // that works.
  it('reads every variable the backend picks a provider from', () => {
    const service = readFileSync(
      fileURLToPath(
        new URL(
          '../../../nestjs-libraries/src/short-linking/short.link.service.ts',
          import.meta.url
        )
      ),
      'utf8'
    );
    const getProvider = service.slice(
      service.indexOf('const getProvider'),
      service.indexOf('@Injectable()')
    );
    const read = [...getProvider.matchAll(/process\.env\.([A-Z_]+)/g)].map(
      (m) => m[1]
    );
    assert.ok(read.length > 0, 'getProvider reads the environment');
    assert.deepEqual([...read].sort(), [...KEYS].sort());
  });
});
