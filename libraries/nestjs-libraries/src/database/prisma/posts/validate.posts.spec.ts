import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripHtmlValidation } from '../../../../../helpers/src/utils/strip.html.validation.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const service = read('./posts.service.ts');
const validate = service.slice(service.indexOf('async validatePosts('));
const activity = read(
  '../../../../../../apps/orchestrator/src/activities/post.activity.ts'
);
const contract = read(
  '../../../integrations/social/social.integrations.interface.ts'
);

describe('validatePosts hands each entry its text', () => {
  it('strips every entry once for the empty and too-long checks, as before', () => {
    // Every check runs on the thread as it will be saved, finisher included.
    assert.match(validate, /const value = this\.withThreadFinisher\(post\)\.value;/);
    assert.match(
      validate,
      /const texts = value\.map\(\(p\) =>\s*stripHtmlValidation\('normal', p\.content \|\| '', true\)/
    );
    assert.match(validate, /const strip = texts\[index\];/);
    assert.match(validate, /const tooLong = texts\.some\(\(strip\) =>/);
  });

  it('gives the provider the message the publish activity will send', () => {
    const call = (source: string) =>
      source
        .match(/stripHtmlValidation\(\s*([\s\S]*?)\s*\)/g)
        ?.map((c) => c.replace(/\s+/g, ' '));
    const messages = validate.slice(validate.indexOf('const messages'));
    const [inValidation] = call(messages) || [];
    const inActivity = (call(activity) || []).find((c) => c.includes('editor'));
    // Same arguments, only the variable names differ.
    assert.equal(
      inValidation
        ?.replace(/provider\./g, 'X.')
        .replace(/p\.content \|\| ''/g, 'p.content'),
      inActivity?.replace(/getIntegration\./g, 'X.')
    );
    assert.match(
      validate,
      /provider\.checkValidity\(\s*media,\s*settings,\s*additionalSettings,\s*messages\s*\)/
    );
  });

  it('keeps plain API text as it came, where the length string escapes it', () => {
    // No markup, as the public API and MCP send it.
    assert.equal(
      stripHtmlValidation('normal', 'a > b', true, false, true),
      'a > b'
    );
    assert.equal(stripHtmlValidation('normal', 'a > b', true), 'a &gt; b');
  });

  it('keeps the parameter optional so media-only providers are untouched', () => {
    assert.match(contract, /additionalSettings: any\[\],\s*texts\?: string\[\],/);
  });
});
