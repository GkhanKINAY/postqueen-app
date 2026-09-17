import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./tags.component.tsx', import.meta.url)),
  'utf8'
);

describe('add new tag modal', () => {
  it('opens on the first preset color, with Name above Tag Color', () => {
    assert.match(source, /DEFAULT_COLOR/);
    assert.match(source, /theColor \|\| DEFAULT_COLOR/);
    assert.doesNotMatch(source, /#942828/);
    const modal = source.slice(source.indexOf('const ShowModal'));
    const nameAt = modal.indexOf("t('tag_name', 'Name')");
    const colorAt = modal.indexOf("t('label_tag_color', 'Tag Color')");
    assert.ok(nameAt >= 0 && colorAt > nameAt);
    assert.doesNotMatch(modal, /text-shadow-tags/);
    assert.match(modal, /brandFocus=\{false\}/);
  });
});
