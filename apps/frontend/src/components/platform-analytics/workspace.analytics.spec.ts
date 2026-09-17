import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./workspace.analytics.tsx', import.meta.url)),
  'utf8',
);

describe('Posting days', () => {
  it('shows the post count on each bar and a hover tooltip', () => {
    assert.match(source, /data-pq="posting-days"/);
    assert.match(source, /data-pq="posting-days-count"/);
    assert.match(source, /count > 0 \? formatCount\(count\)/);
    assert.match(source, /data-pq="chart-tooltip"/);
    assert.match(source, /data-pq="chart-tooltip-caret"/);
    assert.match(source, /data-pq="posting-days-mark"/);
    assert.match(source, /t\('post', 'Post'\)/);
    assert.match(source, /t\('posts', 'Posts'\)/);
    assert.match(source, /onMouseEnter/);
    assert.match(source, /aria-label/);
    assert.doesNotMatch(source, /createPortal/);
    assert.doesNotMatch(source, /chartTooltipBox/);
  });
});
