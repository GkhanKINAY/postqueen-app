import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./compose.first.comment.tsx', import.meta.url)),
  'utf8',
);

describe('composer first comment', () => {
  it('is a Buffer-style field, not a second compose box or delay clock', () => {
    assert.match(source, /data-pq="composer-first-comment"/);
    assert.match(source, /first_comment/);
    assert.match(source, /your_comment/);
    assert.doesNotMatch(source, /DelayComponent/);
    assert.doesNotMatch(source, /EditorContent/);
    assert.match(source, /bg-pqInner/);
  });
});
