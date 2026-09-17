import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./color.picker.tsx', import.meta.url)),
  'utf8'
);

describe('color picker', () => {
  it('starts with brand purple and keeps the first swatch inside the row', () => {
    assert.match(source, /export const COLOR_PRESETS/);
    assert.match(source, /export const DEFAULT_COLOR = COLOR_PRESETS\[0\]/);
    assert.match(source, /COLOR_PRESETS = \[\s*'#7C3AED'/);
    assert.match(source, /data-pq="color-presets"/);
    assert.match(source, /data-pq="color-presets"[\s\S]{0,80}p-\[4px\]/);
    assert.match(source, /data-pq="color-hex"/);
    assert.match(source, /w-\[148px\]/);
    assert.match(source, /w-\[220px\]/);
    assert.doesNotMatch(
      source,
      /\[&_\.react-colorful\]:w-full/
    );
  });
});
