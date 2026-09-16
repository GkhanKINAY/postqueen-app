import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./compose.when.tsx', import.meta.url)),
  'utf8',
);

describe('composer when-to-post control', () => {
  it('is the date picker — not a Next available / Post now menu', () => {
    assert.match(source, /data-pq="composer-when"/);
    assert.match(source, /<DatePicker/);
    assert.match(source, /text-\[15px\] font-\[600\] text-pqText/);
    assert.doesNotMatch(source, /next_available/);
    assert.doesNotMatch(source, /post_now/);
    assert.doesNotMatch(source, /set_date_and_time/);
    assert.doesNotMatch(source, /ComposeWhenMode/);
    assert.doesNotMatch(source, /pickNextSlot/);
    assert.doesNotMatch(source, /\/posts\/find-slot/);
  });
});
