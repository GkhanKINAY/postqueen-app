import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./compose.when.tsx', import.meta.url)),
  'utf8',
);

describe('composer when-to-post control', () => {
  it('offers next slot, now, and a date — not a fake Prioritize bump', () => {
    assert.match(source, /data-pq="composer-when"/);
    assert.match(source, /next_available/);
    assert.match(source, /post_now/);
    assert.match(source, /set_date_and_time/);
    assert.match(source, /formatShortWeekdayTime/);
    assert.match(source, /t\('today', 'Today'\)/);
    assert.match(source, /t\('tomorrow', 'Tomorrow'\)/);
    assert.match(source, /border-s border-newTextColor\/10/);
    assert.doesNotMatch(source, /mode === 'date' && 'gap-\[4px\]'/);
    assert.doesNotMatch(source, /value: 'prioritize'/);
    assert.match(source, /h-\[44px\].*text-\[15px\] font-\[600\] text-pqText/);
    assert.doesNotMatch(
      source,
      /flex h-\[42px\] cursor-pointer[\s\S]*text-pqMuted/,
    );
  });
});
