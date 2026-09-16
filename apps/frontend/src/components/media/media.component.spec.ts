import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./media.component.tsx', import.meta.url)),
  'utf8',
);

describe('composer media hover actions', () => {
  it('paints Create Post thumbs with overlay chips on the photo', () => {
    assert.match(source, /dragging h-\[120px\] w-\[120px\]/);
    assert.match(source, /composer-media-thumb/);
    assert.match(source, /data-pq="composer-add-media"/);
    assert.match(source, /data-pq="composer-media-enlarge"/);
    assert.match(source, /enlarge_image/);
    assert.match(source, /<MediaLightbox/);
    assert.match(source, /change_alt_text/);
    assert.match(source, /MediaComponentInner/);
    assert.match(source, /absolute end-\[6px\] top-\[6px\].*size-\[28px\]/);
    assert.match(source, /absolute start-\[6px\] top-\[6px\].*size-\[28px\]/);
    assert.match(source, /const studioThumbs = !ghost && \(!attachmentsOnly \|\| largeThumbs\)/);
    assert.doesNotMatch(source, /composer-media-info/);
    assert.doesNotMatch(source, />\s*ALT\s*</);
    assert.doesNotMatch(source, /instagram_45_hint/);
    assert.doesNotMatch(source, /#2563EB/);
    assert.match(
      source,
      /!touch &&\s+'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'/,
    );
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

  it('commits reorder by id so each item keeps path', () => {
    assert.match(source, /commitMediaOrder/);
    assert.match(source, /mediaOrderUnchanged/);
    assert.match(source, /key=\{media\.id\}/);
    assert.doesNotMatch(source, /key=\{`\$\{media\.id\}-\$\{index\}`\}/);
    assert.doesNotMatch(
      source,
      /onChange\(\{ target: \{ name, value: next \} \}\)/,
    );
  });

  it('keeps AI Image on the same toolbar row as AI Video', () => {
    assert.match(source, /<AiImage/);
    assert.match(source, /<AiVideo/);
    assert.match(source, /!!user\?\.tier\?\.ai/);
    assert.doesNotMatch(source, /showAiImage/);
  });

  it('draws the settings cover picker like Create Post thumbs, not Select/Clear', () => {
    const single = source.slice(source.indexOf('export const MediaComponent'));
    assert.match(single, /data-pq="settings-media-thumb"/);
    assert.match(single, /data-pq="composer-media-enlarge"/);
    assert.match(single, /data-pq="composer-add-media"/);
    assert.match(single, /h-\[120px\] w-\[120px\]/);
    assert.match(single, /<MediaLightbox/);
    assert.match(single, /change_alt_text/);
    assert.match(single, /insert_media/);
    assert.doesNotMatch(single, /t\('select'/);
    assert.doesNotMatch(single, /t\('clear'/);
    assert.doesNotMatch(single, /border-tableBorder/);
    assert.doesNotMatch(single, /bg-customColor45/);
    assert.doesNotMatch(single, /window\.open/);
    assert.match(
      single,
      /opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100/,
    );
  });
});
