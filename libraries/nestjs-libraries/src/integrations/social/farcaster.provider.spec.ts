import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { FarcasterProvider } from './farcaster.provider.ts';

const provider = new FarcasterProvider();
const images = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.png` }));
const cast = (text: string, media = images(0)) =>
  provider.checkValidity([media], {}, [], [text]);

describe('Farcaster casts', () => {
  it('are measured in bytes, up to 1,024', async () => {
    assert.equal(provider.maxLength(), 1024);
    // 1,024 ASCII characters: allowed, where 800 was the old cap.
    assert.equal(await cast('a'.repeat(1024)), true);
    assert.match(String(await cast('a'.repeat(1025))), /at most 1,024 bytes/);
    // 600 Cyrillic letters are 1,200 bytes.
    assert.match(String(await cast('д'.repeat(600))), /at most 1,024 bytes/);
    assert.equal(await cast('д'.repeat(512)), true);
  });

  it('holds replies to the same limit', async () => {
    assert.match(
      String(await provider.checkValidity([[], []], {}, [], ['ok', '🎉'.repeat(257)])),
      /at most 1,024 bytes/
    );
  });

  it('take up to 4 images as embeds', async () => {
    assert.equal(await cast('hi', images(4)), true);
    assert.equal(
      await cast('hi', images(5)),
      'Farcaster casts can have up to 4 images'
    );
  });

  it('still refuse video', async () => {
    assert.equal(
      await cast('hi', [{ path: 'https://cdn.test/a.mp4' }]),
      'Can only accept images'
    );
  });

  it('have the editor count to the same 1,024', () => {
    const component = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../apps/frontend/src/components/new-launch/providers/warpcast/warpcast.provider.tsx',
          import.meta.url
        )
      ),
      'utf8'
    );
    assert.match(component, /maximumCharacters: 1024,/);
  });
});

/**
 * Neynar answers 429 once the app's rate limit is reached. The connect screen
 * showed the bare axios message ("Request failed with status code 429").
 */
describe('Farcaster connect', () => {
  const KEYS = ['NEYNAR_APP_FID', 'NEYNAR_APP_MNEMONIC'];
  const previous = Object.fromEntries(
    KEYS.map((key) => [key, process.env[key]])
  );
  const realCreateSigner = NeynarAPIClient.prototype.createSigner;

  afterEach(() => {
    NeynarAPIClient.prototype.createSigner = realCreateSigner;
    for (const key of KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  // createSigner checks the app is configured before it calls Neynar.
  const refuse = (status: number) => {
    process.env.NEYNAR_APP_FID = '1';
    process.env.NEYNAR_APP_MNEMONIC = 'test test test';
    NeynarAPIClient.prototype.createSigner = async () => {
      throw Object.assign(
        new Error(`Request failed with status code ${status}`),
        {
          response: { status },
        }
      );
    };
  };

  it('says so when Neynar is rate limiting', async () => {
    refuse(429);
    await assert.rejects(
      provider.createSigner(),
      /^Error: Farcaster rate limit reached, please try again later$/
    );
  });

  it('passes any other failure on as it was', async () => {
    refuse(500);
    await assert.rejects(
      provider.createSigner(),
      /Request failed with status code 500/
    );
  });
});
