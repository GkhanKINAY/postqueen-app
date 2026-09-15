import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./compose.first.comment.tsx', import.meta.url)),
  'utf8',
);

describe('composer first comment', () => {
  it('is a Buffer-style field with delay, not a second compose box', () => {
    assert.match(source, /data-pq="composer-first-comment"/);
    assert.match(source, /first_comment/);
    assert.match(source, /your_comment/);
    assert.match(source, /DelayComponent/);
    assert.match(source, /currentIndex=\{1\}/);
    assert.doesNotMatch(source, /EditorContent/);
  });
});
