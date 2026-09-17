import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./organization.selector.tsx', import.meta.url)),
  'utf8',
);

describe('Organization switcher', () => {
  it('prefers the live workspace name from /user/self for the current org', () => {
    assert.match(source, /const currentOrgName =/);
    assert.match(source, /user\.orgName/);
    assert.match(source, /currentOrgName\(current, user\)/);
    assert.match(source, /currentOrgName\(org, user\)/);
  });

  it('reads as a workspace control, not a muted nav label', () => {
    assert.match(source, /data-pq="rail-org"/);
    assert.match(source, /t\('workspace', 'Workspace'\)/);
    assert.match(source, /bg-pqBrandSoft/);
    assert.doesNotMatch(
      source,
      /truncate text-\[13px\] font-\[500\] text-pqMuted/
    );
  });
});
