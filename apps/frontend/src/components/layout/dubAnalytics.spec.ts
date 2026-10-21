import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./dubAnalytics.tsx', import.meta.url)),
  'utf8',
);

describe('DubAnalytics', () => {
  it('loads the script only for a visit through an affiliate link', () => {
    // The two parameters Dub's script reads, and the two cookies it writes.
    assert.match(source, /query\.get\('dub_id'\)/);
    assert.match(source, /query\.get\('via'\)/);
    assert.match(source, /getCookie\('dub_id', ''\)/);
    assert.match(source, /getCookie\('dub_partner_data', ''\)/);
    assert.match(
      source,
      /if \(!dub \|\| !isReferredVisit\(query\)\) return null;\s*return \(\s*<DubAnalyticsIn \/>/,
    );
  });

  it('cannot whitescreen every page on a cookie that fails to decode', () => {
    assert.match(
      source,
      /try \{\s*return !!getCookie\('dub_id', ''\)[\s\S]*?\} catch \(e\) \{[\s\S]*?return true;/,
    );
  });
});
