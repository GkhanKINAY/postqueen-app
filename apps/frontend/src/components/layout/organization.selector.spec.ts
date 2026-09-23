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

describe('Leave workspace', () => {
  it('is offered only with another workspace to move to', () => {
    assert.match(source, /data\.length > 1 && \(/);
    assert.match(source, /t\('leave_workspace', 'Leave workspace'\)/);
  });

  it('uses the Teams leave endpoint, confirms first, and moves the session on', () => {
    const leave = source.slice(
      source.indexOf('const leave = useCallback'),
      source.indexOf('useEffect(')
    );
    assert.match(leave, /deleteDialog\(/);
    assert.match(leave, /fetch\('\/settings\/team\/leave', \{ method: 'POST' \}\)/);
    assert.ok(
      leave.indexOf('deleteDialog(') < leave.indexOf("'/settings/team/leave'"),
      'the confirmation comes before the request'
    );
    // customFetch resolves on 4xx/5xx: the server's reason (the last Super
    // Admin, the only workspace) is shown instead of switching away.
    assert.match(leave, /if \(!res\.ok\)/);
    assert.match(leave, /await changeOrg\(next\)\(\)/);
  });
});
