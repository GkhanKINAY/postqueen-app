import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./ai.image.tsx', import.meta.url)),
  'utf8',
);

describe('generate AI image modal', () => {
  it('is a 640px card, not the default 920px fit-to-chips width', () => {
    assert.match(source, /size: 640/);
    assert.match(source, /maxSize: 640/);
  });

  it('puts a sparkle on Generate', () => {
    assert.match(source, /<GenerateSparkle size=\{16\} \/>/);
    assert.match(source, /t\('generate', 'Generate'\)/);
  });
});
