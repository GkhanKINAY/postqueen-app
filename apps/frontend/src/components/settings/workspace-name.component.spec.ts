import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./workspace-name.component.tsx', import.meta.url)),
  'utf8',
);

describe('Organization name save', () => {
  it('refreshes header and rail identity without a page reload', () => {
    assert.match(source, /useRevalidateIdentity/);
    assert.match(source, /revalidateIdentity\(\{ orgName: saved \}\)/);
    assert.doesNotMatch(source, /mutate\('\/user\/self'\)/);
  });

  it('shows the name until a pencil opens Save, like Account', () => {
    assert.match(source, /t\('organization_name', 'Organization name'\)/);
    assert.match(source, /data-pq="organization-name-display"/);
    assert.match(source, /data-pq="organization-name-edit"/);
    assert.match(source, /aria-label=\{t\('edit'/);
    assert.match(source, /disabled=\{!nameDirty\}/);
    assert.doesNotMatch(source, /t\('workspace_name'/);
    assert.doesNotMatch(
      source,
      /<Button loading=\{saving\} onClick=\{save\}>\s*\{t\('save', 'Save'\)\}/,
    );
  });
});
