import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./date.picker.tsx', import.meta.url)),
  'utf8',
);

describe('Post date picker time field', () => {
  it('follows the Date Metrics clock, not the browser', () => {
    // A native time input shows the browser's clock and cannot be told otherwise.
    assert.doesNotMatch(source, /<TimeInput/);
    assert.match(source, /format=\{use12Hour \? '12h' : '24h'\}/);
    // Hebrew and Arabic still read hours before minutes.
    assert.match(source, /<TimePicker\s+dir="ltr"/);
  });
});
