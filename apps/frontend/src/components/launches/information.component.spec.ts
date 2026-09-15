import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./information.component.tsx', import.meta.url)),
  'utf8',
);

describe('composer character count', () => {
  it('treats an empty draft as idle, not a red warning', () => {
    assert.match(source, /pillTone === 'idle'/);
    assert.match(source, /Empty is not a drafting error/);
    assert.match(source, /pillTone === 'warn' && 'bg-pqWarn'/);
    assert.doesNotMatch(
      source,
      /isValid \? 'border border-newColColor' : 'bg-pqWarn'/,
    );
  });
});
