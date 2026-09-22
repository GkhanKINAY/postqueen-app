import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const component = read('./skool.provider.tsx');
const provider = read(
  '../../../../../../../libraries/nestjs-libraries/src/integrations/social/skool.provider.ts'
);

describe('Skool character limit', () => {
  it('is the same in the editor as on the server', () => {
    const server = provider.match(/maxLength\(\) \{\s*return (\d+);/)?.[1];
    const editor = component.match(/maximumCharacters: (\d+),/)?.[1];
    assert.equal(server, '5000');
    assert.equal(editor, server);
  });
});
