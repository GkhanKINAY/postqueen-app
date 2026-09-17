import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const component = read('./medium.provider.tsx');
const dto = read(
  '../../../../../../../libraries/nestjs-libraries/src/dtos/posts/providers-settings/medium.settings.dto.ts'
);
const provider = read(
  '../../../../../../../libraries/nestjs-libraries/src/integrations/social/medium.provider.ts'
);

describe('Medium settings only offer what the API takes', () => {
  // Medium's publishing API body is title, contentFormat, content, tags,
  // canonicalUrl and publishStatus. A control for anything else is a promise
  // the request cannot keep — `subtitle` was exactly that, and it was required.
  const SENT = [
    'title',
    'contentFormat',
    'content',
    'canonicalUrl',
    'tags',
    'publishStatus',
  ];

  it('sends nothing the provider does not build', () => {
    const body = provider.slice(
      provider.indexOf('body: JSON.stringify({'),
      provider.indexOf('headers: {', provider.indexOf('body: JSON.stringify({'))
    );
    for (const key of SENT) {
      assert.match(body, new RegExp(`${key}:`));
    }
    assert.doesNotMatch(body, /subtitle/);
  });

  it('has no subtitle control and no subtitle field', () => {
    assert.doesNotMatch(component, /register\('subtitle'\)/);
    assert.doesNotMatch(component, /label="Subtitle"/);
    assert.doesNotMatch(dto, /^\s*subtitle:/m);
  });

  it('keeps every remaining control bound to something the provider reads', () => {
    for (const field of ['title', 'canonical', 'publication', 'tags']) {
      assert.match(
        component,
        new RegExp(`register\\('${field}'\\)`),
        `${field} is still offered`
      );
      assert.match(
        provider,
        new RegExp(`settings[?]?\\.?\\??${field}`),
        `${field} is read by the provider`
      );
    }
  });
});
