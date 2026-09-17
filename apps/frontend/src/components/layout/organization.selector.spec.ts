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

  it('is a name-only rail row, not an avatar card with a Workspace caption', () => {
    assert.match(source, /data-pq="rail-org"/);
    assert.match(source, /bg-pqNavActive/);
    assert.match(source, /navRowHover/);
    assert.doesNotMatch(source, /t\('workspace', 'Workspace'\)/);
    assert.doesNotMatch(source, /subtitle=\{t\('workspace'/);
    assert.doesNotMatch(
      source,
      /grid size-\[24px\] shrink-0 place-items-center rounded-\[7px\] bg-pqBrandSoft/,
    );
    assert.doesNotMatch(
      source,
      /shadow-\[inset_0_0_0_1px_var\(--border\)\]/,
    );
  });
});
