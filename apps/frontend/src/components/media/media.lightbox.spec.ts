import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./media.lightbox.tsx', import.meta.url)),
  'utf8',
);

describe('Media lightbox frame', () => {
  it('does not force a 16:10 landscape box', () => {
    assert.doesNotMatch(source, /aspect-\[16\/10\]/);
    assert.match(source, /object-contain/);
  });
});

describe('Media lightbox navigation', () => {
  it('steps to the neighbouring files with buttons and the arrow keys', () => {
    assert.match(source, /onPrev\?: \(\) => void;/);
    assert.match(source, /onNext\?: \(\) => void;/);
    assert.match(source, /data-pq="media-lightbox-prev"/);
    assert.match(source, /data-pq="media-lightbox-next"/);
    // RTL swaps which arrow walks forward, and a focused video keeps its own
    // arrow-key seeking.
    assert.match(source, /e\.key === \(rtl \? 'ArrowLeft' : 'ArrowRight'\) \? onNext : onPrev/);
    // Alt/Cmd + arrow stays the browser's Back.
    assert.match(source, /if \(e\.altKey \|\| e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey\) return;/);
    assert.match(source, /closest\('video, input, textarea/);
  });
});
