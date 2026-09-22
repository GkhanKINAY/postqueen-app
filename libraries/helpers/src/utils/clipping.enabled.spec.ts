import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { clippingProcessor, isClippingEnabled } from './clipping.enabled.ts';

const KEYS = [
  'CLIPPING_PROCESSOR',
  'STORAGE_PROVIDER',
  'OPENAI_API_KEY',
  'DEEPGRAM_API_KEY',
];

describe('isClippingEnabled', () => {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    process.env.STORAGE_PROVIDER = 'cloudflare';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.DEEPGRAM_API_KEY = 'dg-test';
    delete process.env.CLIPPING_PROCESSOR;
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

  it('is off without a processor, whatever else is configured', () => {
    assert.equal(clippingProcessor(), undefined);
    assert.equal(isClippingEnabled(), false);
  });

  // No processor is implemented yet, so no name switches clipping on. The
  // day one is, its name joins clippingProcessors and this test with it
  it('is off for a processor this build does not implement', () => {
    for (const name of ['runpod', 'local', 'ffmpeg']) {
      process.env.CLIPPING_PROCESSOR = name;
      assert.equal(clippingProcessor(), undefined);
      assert.equal(isClippingEnabled(), false);
    }
  });
});
