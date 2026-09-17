import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const showcase = readFileSync(
  fileURLToPath(new URL('./product-showcase.tsx', import.meta.url)),
  'utf8'
);
const authDir = fileURLToPath(new URL('../../../public/auth/', import.meta.url));

describe('auth product showcase', () => {
  it('keeps both stills so the calendar illustration can be restored', () => {
    assert.match(showcase, /SHOWCASE_STILL: 'app' \| 'calendar'/);
    assert.match(showcase, /\/auth\/app-preview\.png/);
    assert.match(showcase, /\/auth\/calendar\.svg/);
    assert.doesNotMatch(showcase, /perspective\(/);
    assert.equal(existsSync(`${authDir}app-preview.png`), true);
    assert.equal(existsSync(`${authDir}calendar.svg`), true);
  });
});
