import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const service = read('./posts.service.ts');
const validate = service.slice(service.indexOf('async validatePosts('));
const contract = read(
  '../../../integrations/social/social.integrations.interface.ts'
);

describe('validatePosts hands each entry its text', () => {
  it('strips every entry once, the way the length check always did', () => {
    assert.match(
      validate,
      /const texts = \(post\.value \|\| \[\]\)\.map\(\(p\) =>\s*stripHtmlValidation\('normal', p\.content \|\| '', true\)/
    );
  });

  it('passes those texts to the provider after its media and settings', () => {
    assert.match(
      validate,
      /provider\.checkValidity\(\s*media,\s*settings,\s*additionalSettings,\s*texts\s*\)/
    );
  });

  it('measures empty and too-long posts on the same strings', () => {
    assert.match(validate, /const strip = texts\[index\];/);
    assert.match(validate, /const tooLong = texts\.some\(\(strip\) =>/);
    assert.doesNotMatch(
      validate.slice(0, validate.indexOf('return {')),
      /stripHtmlValidation\('normal', a\.content/
    );
  });

  it('keeps the parameter optional so media-only providers are untouched', () => {
    assert.match(contract, /additionalSettings: any\[\],\s*texts\?: string\[\],/);
  });
});
