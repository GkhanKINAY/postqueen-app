import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./compose.notify.tsx', import.meta.url)),
  'utf8',
);

describe('composer notify control', () => {
  it('offers Notify me vs Quiet, not a fake post-yourself mode', () => {
    assert.match(source, /data-pq="composer-notify"/);
    assert.match(source, /notify_me/);
    assert.match(source, /notify_quiet/);
    assert.match(source, /notify_me_hint/);
    assert.match(source, /notify_quiet_hint/);
    assert.doesNotMatch(source, /post yourself/);
    assert.doesNotMatch(source, /Automatic/);
  });
});
