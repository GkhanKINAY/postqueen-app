import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const showcase = readFileSync(
  fileURLToPath(new URL('./product-showcase.tsx', import.meta.url)),
  'utf8'
);
const layout = readFileSync(
  fileURLToPath(new URL('../../app/(app)/auth/layout.tsx', import.meta.url)),
  'utf8'
);
const authDir = fileURLToPath(new URL('../../../public/auth/', import.meta.url));

describe('auth product showcase', () => {
  it('keeps both stills so the calendar illustration can be restored', () => {
    assert.match(showcase, /SHOWCASE_STILL: 'insights' \| 'app' \| 'calendar'/);
    assert.match(showcase, /SHOWCASE_STILL.*= 'insights'/);
    assert.match(showcase, /\/auth\/app-preview\.png/);
    assert.match(showcase, /\/auth\/calendar\.svg/);
    assert.match(showcase, /min-w-\[155%\]/);
    assert.match(showcase, /object-left/);
    assert.match(showcase, /w-\[55%\]/);
    assert.match(showcase, /flex h-full min-h-0 w-full flex-col/);
    assert.match(showcase, /h-full min-h-0 w-\[55%\]/);
    assert.match(showcase, /overflow-hidden p-\[14px\]/);
    assert.match(showcase, /grid grid-cols-4 gap-\[6px\]/);
    assert.match(showcase, /const PREVIEW_TOP = PREVIEW_POSTS;/);
    assert.match(showcase, /line-clamp-2/);
    assert.match(showcase, /#\{index \+ 1\}/);
    assert.match(showcase, /2xl:min-h-\[118px\]/);
    assert.match(showcase, /grid min-h-0 min-w-0 shrink-0 grid-cols-2/);
    assert.match(showcase, /justify-between gap-\[12px\]/);
    assert.match(
      showcase,
      /justify-between gap-\[8px\] whitespace-nowrap/
    );
    assert.match(showcase, /PreviewThumb/);
    assert.match(showcase, /size = 40/);
    assert.match(showcase, /width=\{size\}/);
    assert.match(showcase, /object-contain/);
    assert.doesNotMatch(showcase, /performance_per_post/);
    assert.doesNotMatch(showcase, /range_7d/);
    assert.doesNotMatch(showcase, /range_30d/);
    assert.doesNotMatch(showcase, /range_90d/);
    assert.doesNotMatch(showcase, /2xl:mt-auto/);
    assert.doesNotMatch(showcase, /grid-cols-2 gap-\[10px\] xl:grid-cols-4/);
    assert.doesNotMatch(showcase, /flex-wrap justify-between/);
    assert.doesNotMatch(showcase, /overflow-x-hidden overflow-y-auto/);
    assert.doesNotMatch(
      showcase,
      /absolute -bottom-\[2px\] -end-\[2px\] size-\[14px\]/
    );
    assert.match(showcase, /Introducing Insights/);
    assert.match(showcase, /Analytics that show you your next move/);
    assert.match(showcase, /t\('new', 'NEW'\)/);
    assert.match(showcase, /t\('all_channels', 'All channels'\)/);
    assert.match(showcase, /analytics_lifetime_totals_hint/);
    assert.match(showcase, /t\('posting_days', 'Posting days'\)/);
    assert.match(showcase, /t\('engagement_mix', 'Engagement mix'\)/);
    assert.match(layout, /lg:h-dvh lg:max-h-dvh lg:overflow-hidden/);
    assert.match(layout, /lg:h-full lg:min-h-0/);
    assert.doesNotMatch(showcase, /w-\[132%\]/);
    assert.doesNotMatch(showcase, /grid-cols-1 gap-\[13px\]/);
    assert.doesNotMatch(showcase, /post\.channel/);
    assert.doesNotMatch(showcase, /channel: 'PostQueen'/);
    assert.doesNotMatch(showcase, /perspective\(/);
    assert.doesNotMatch(showcase, /One calendar for 30\+ platforms\./);
    assert.equal(existsSync(`${authDir}app-preview.png`), true);
    assert.equal(existsSync(`${authDir}calendar.svg`), true);
  });
});
