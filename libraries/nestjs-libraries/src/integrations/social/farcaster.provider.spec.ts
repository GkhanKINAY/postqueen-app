import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
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
