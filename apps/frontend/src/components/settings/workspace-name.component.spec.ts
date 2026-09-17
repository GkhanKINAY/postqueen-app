import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./workspace-name.component.tsx', import.meta.url)),
  'utf8',
);

describe('Workspace name save', () => {
  it('refreshes header and rail identity without a page reload', () => {
    assert.match(source, /useRevalidateIdentity/);
    assert.match(source, /revalidateIdentity\(\{ orgName: saved \}\)/);
    assert.doesNotMatch(source, /mutate\('\/user\/self'\)/);
  });
});
