import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./compose.first.comment.tsx', import.meta.url)),
  'utf8',
);
const editor = readFileSync(
  fileURLToPath(new URL('./editor.tsx', import.meta.url)),
  'utf8',
);

describe('composer first comment', () => {
  it('is a field, not a second compose box', () => {
    assert.match(source, /data-pq="composer-first-comment"/);
    assert.match(source, /first_comment/);
    assert.match(source, /your_comment/);
    assert.doesNotMatch(source, /EditorContent/);
    assert.match(source, /bg-pqInner/);
  });

  it('reveals media, signature and delay when focused or already filled', () => {
    assert.match(source, /const expanded = active \|\| hasPayload/);
    assert.match(source, /data-pq="composer-first-comment-tools"/);
    assert.match(source, /<DelayComponent/);
    assert.match(source, /<SignatureBox/);
    assert.match(source, /<MultiMediaComponent/);
    assert.match(source, /attachmentsOnly/);
    assert.match(editor, /ensureFirstComment/);
    assert.match(editor, /!comment\.delay/);
    assert.match(editor, /firstCommentFilled && items\.length <= 2/);
    assert.match(editor, /!\(firstCommentMode && items\.length <= 2\)/);
  });
});
