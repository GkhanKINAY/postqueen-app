import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const layout = readFileSync(
  fileURLToPath(new URL('./layout.component.tsx', import.meta.url)),
  'utf8'
);
const rail = readFileSync(
  fileURLToPath(new URL('./rail.tsx', import.meta.url)),
  'utf8'
);

describe('app chrome', () => {
  it('keeps Founding member on the rail, not in the header', () => {
    assert.doesNotMatch(layout, /data-hdr-thanks/);
    assert.doesNotMatch(layout, /showFoundingChip/);
    assert.doesNotMatch(layout, /t\('founding_member'/);
    assert.match(rail, /isFoundingRail/);
    assert.match(rail, /t\('founding_member', 'Founding member'\)/);
  });
});
