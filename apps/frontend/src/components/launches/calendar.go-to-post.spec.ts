import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const calendar = readFileSync(
  fileURLToPath(new URL('./calendar.tsx', import.meta.url)),
  'utf8',
);
const panel = readFileSync(
  fileURLToPath(new URL('./posts.panel.tsx', import.meta.url)),
  'utf8',
);
const analytics = readFileSync(
  fileURLToPath(
    new URL('../platform-analytics/analytics-post-menu.tsx', import.meta.url),
  ),
  'utf8',
);

describe('Go to post on published calendar cards', () => {
  it('opens releaseURL the same way Analytics does', () => {
    assert.match(calendar, /t\('go_to_post', 'Go to post'\)/);
    assert.match(
      calendar,
      /window\.open\(releaseURL, '_blank', 'noopener,noreferrer'\)/,
    );
    assert.match(analytics, /window\.open\(post\.releaseURL, '_blank'/);
    assert.match(calendar, /data-pq="go-to-post"/);
    assert.match(calendar, /if \(!releaseURL\) return null/);
  });

  it('is on day, week, list cards and the posts panel, not only Preview', () => {
    assert.equal((calendar.match(/<GoToLivePostButton/g) || []).length, 3);
    assert.match(panel, /<GoToLivePostButton/);
    assert.match(calendar, /<Preview /);
  });
});
