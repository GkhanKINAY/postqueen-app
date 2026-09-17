import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./input.tsx', import.meta.url)),
  'utf8'
);

describe('password input', () => {
  it('reveals and hides type=password without submitting the form', () => {
    assert.match(source, /data-pq="password-reveal"/);
    assert.match(source, /type="button"/);
    assert.match(source, /type=\{passwordField && showPassword \? 'text' : type\}/);
    assert.match(source, /t\('show_password', 'Show password'\)/);
    assert.match(source, /t\('hide_password', 'Hide password'\)/);
    assert.match(source, /text-\[14px\] font-\[500\] text-pqMuted/);
  });

  it('draws focus on the outer well only, not the native control', () => {
    assert.match(source, /data-pq="form-input-well"/);
    assert.match(source, /focus-within:shadow-\[inset_0_0_0_1px_var\(--brand\)\]/);
    assert.match(source, /focus-visible:outline-none focus-visible:ring-0/);
    assert.match(source, /appearance-none/);
    assert.match(source, /rounded-none border-0/);
  });
});
