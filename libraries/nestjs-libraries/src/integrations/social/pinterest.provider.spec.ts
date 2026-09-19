import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PinterestProvider } from './pinterest.provider.ts';

describe('Pinterest description', () => {
  it('takes the 800 characters Create Pin allows, on the server', () => {
    assert.equal(new PinterestProvider().maxLength(), 800);
  });

  it('and in the editor', () => {
    const component = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../apps/frontend/src/components/new-launch/providers/pinterest/pinterest.provider.tsx',
          import.meta.url
        )
      ),
      'utf8'
    );
    assert.match(component, /maximumCharacters: 800,/);
  });
});
