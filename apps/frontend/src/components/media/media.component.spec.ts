import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./media.component.tsx', import.meta.url)),
  'utf8',
);

describe('composer media hover actions', () => {
  it('paints Buffer-sized Create Post thumbs with overlay chips on the photo', () => {
    assert.match(source, /dragging h-\[120px\] w-\[120px\]/);
    assert.match(source, /composer-media-thumb/);
    assert.match(source, /data-pq="composer-add-media"/);
    assert.match(source, /data-pq="composer-media-info"/);
    assert.match(source, /bg-black\/72/);
    assert.match(source, /change_alt_text/);
    assert.match(source, /instagram_45_hint/);
    assert.match(source, /drag_drop_or_select/);
    assert.match(source, /MediaComponentInner/);
    assert.match(source, /absolute end-\[6px\] top-\[6px\].*size-\[28px\]/);
    assert.match(source, /absolute start-\[6px\] top-\[6px\].*size-\[28px\]/);
    assert.match(source, /data-pq="composer-toolbar"/);
    assert.match(source, /flex w-full items-center gap-x-\[8px\]/);
    assert.match(source, /data-pq="composer-char-count"/);
    assert.match(source, /flex min-w-0 flex-1 flex-nowrap items-center gap-\[6px\] overflow-hidden/);
    assert.match(source, /trailing\?: React\.ReactNode/);
    assert.match(source, /const hideLabel = compact/);
    assert.match(source, /ghost \? toolbarRef\.current : toolsRef\.current/);
    assert.doesNotMatch(source, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  });

  it('keeps agent and in-form attachment chips small, with a hanging X', () => {
    assert.match(source, /dragging h-\[58px\] w-\[58px\]/);
    assert.match(source, /dragging h-\[48px\] w-\[48px\]/);
    assert.match(source, /absolute -end-\[6px\] -top-\[6px\].*size-\[16px\]/);
    assert.match(source, /!ghost &&\s+!touch &&\s+'opacity-0/);
  });

  it('drags from the whole thumb, not a four-dot grab handle', () => {
    assert.match(source, /handle=".dragging"/);
    assert.doesNotMatch(source, /reorder_media/);
    assert.match(source, /filter=\{\'\[data-ci-actions="1"\]\'\}/);
  });
});
