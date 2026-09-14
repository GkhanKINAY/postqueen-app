import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const toaster = readFileSync(
  fileURLToPath(new URL('./toaster.tsx', import.meta.url)),
  'utf8',
);

describe('Toaster success chrome', () => {
  it('uses a solid green tick, not the info i', () => {
    assert.match(toaster, /bg-pqOk text-white/);
    assert.match(toaster, /M5 12\.5l4\.5 4\.5L19 7\.5/);
    assert.match(toaster, /data-toaster-kind=\{toasterType\}/);
  });

  it('keeps a compact max width and wrap so a URL cannot blow the toast', () => {
    assert.match(toaster, /max-w-\[min\(360px,calc\(100vw-32px\)\)\]/);
    assert.match(toaster, /\[overflow-wrap:anywhere\]/);
  });

  it('renders an optional action as a real link', () => {
    assert.match(toaster, /toasterHref/);
    assert.match(toaster, /<a[\s\S]*href=\{toasterHref\}/);
  });

  it('anchors bottom-end without a leftover centering translate', () => {
    assert.match(toaster, /bottom-\[24px\] end-\[24px\]/);
    assert.doesNotMatch(toaster, /start-\[50%\]/);
    assert.doesNotMatch(toaster, /-translate-x-\[50%\]/);
  });
});
