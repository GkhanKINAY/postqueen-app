import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./user.context.tsx', import.meta.url)),
  'utf8',
);

describe('useRevalidateIdentity', () => {
  it('patches /user/self and the organizations switcher together', () => {
    assert.match(source, /export const useRevalidateIdentity/);
    assert.match(source, /mutate\(\s*'\/user\/self'/);
    assert.match(source, /mutate\(\s*'organizations'/);
    assert.match(source, /mutate\('user-identities'\)/);
    assert.match(source, /revalidate: true/);
  });
});
