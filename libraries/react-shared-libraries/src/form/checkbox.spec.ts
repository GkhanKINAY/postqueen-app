import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./checkbox.tsx', import.meta.url)),
  'utf8'
);

describe('checkbox', () => {
  it('takes a disabled prop instead of silently ignoring it', () => {
    assert.match(source, /disabled\?: boolean;/);
    assert.match(source, /const \{[^}]*\bdisabled\b[^}]*\} =\s*props;/);
  });

  it('does not toggle while disabled, from the box or the label', () => {
    const start = source.indexOf('const changeStatus = useCallback(');
    const body = source.slice(start, source.indexOf('}, [', start));
    assert.match(body, /if \(disabled\) \{\s*return;\s*\}/);
    // both clickable parts go through the same guarded handler
    assert.equal(source.match(/onClick=\{changeStatus\}/g)?.length, 2);
  });

  it('looks disabled and says so to assistive tech', () => {
    assert.match(source, /aria-disabled=\{disabled \|\| undefined\}/);
    assert.equal(
      source.match(/disabled \? 'cursor-not-allowed opacity-50' : 'cursor-pointer'/g)
        ?.length,
      2
    );
  });
});
