import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('./global.css', import.meta.url)),
  'utf8',
);

describe('global pointer cursor', () => {
  it('overrides Tailwind 4 button cursor:default in @layer base', () => {
    assert.match(source, /@layer base \{/);
    assert.match(
      source,
      /a\[href\],[\s\S]*button,[\s\S]*\[role='button'\][\s\S]*cursor:\s*pointer/,
    );
    assert.match(source, /:disabled[\s\S]*cursor:\s*not-allowed/);
  });
});

describe('pqfadeDown toast entry', () => {
  it('drops on Y only — no leftover centered -50% X translate', () => {
    const block = source.match(
      /@keyframes pqfadeDown \{[\s\S]*?\n\}/,
    );
    assert.ok(block, 'pqfadeDown keyframes must exist');
    assert.match(block[0], /translateY\(-16px\)/);
    assert.doesNotMatch(block[0], /translate\(\s*-50%/);
    assert.doesNotMatch(block[0], /translateX\(\s*-50%/);
  });
});
