import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LinkedinProvider } from './linkedin.provider.ts';
import { LinkedinPageProvider } from './linkedin.page.provider.ts';

const images = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.jpg` }));

for (const [name, provider] of [
  ['LinkedIn', new LinkedinProvider()],
  ['LinkedIn Page', new LinkedinPageProvider()],
] as const) {
  describe(`${name} multi-image posts`, () => {
    it('take up to 20 images', async () => {
      assert.equal(await provider.checkValidity([images(20)], {}), true);
      assert.equal(
        await provider.checkValidity([images(21)], {}),
        'LinkedIn multi-image posts can have up to 20 images.'
      );
    });

    it('do not cap the PDF carousel, which is one document', async () => {
      assert.equal(
        await provider.checkValidity([images(21)], {
          post_as_images_carousel: true,
        }),
        true
      );
    });
  });
}

const source = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

describe('LinkedIn API version', () => {
  it('sends the same current version on every versioned call of both tiles', () => {
    for (const file of ['./linkedin.provider.ts', './linkedin.page.provider.ts']) {
      const versions = [
        ...source(file).matchAll(/['"]Linked[Ii]n-Version['"]\s*:\s*'(\d{6})'/g),
      ].map((match) => match[1]);
      assert.ok(versions.length > 0, file);
      // 202306 was sunset on 2024-12-16, which broke the first comment
      assert.deepEqual([...new Set(versions)], ['202610'], file);
    }
  });
});

// Answers the company lookup the way LinkedIn does.
class MentionLinkedinProvider extends LinkedinProvider {
  override async fetch() {
    return new Response(
      JSON.stringify({
        elements: [
          {
            id: 1234,
            localizedName: 'PostQueen',
            logoV2: {
              'original~': {
                elements: [{ identifiers: [{ identifier: 'https://cdn.test/logo.png' }] }],
              },
            },
          },
        ],
      })
    );
  }
}

describe('LinkedIn storage rules', () => {
  it('looks company Pages up fresh instead of keeping them in the mention cache', async () => {
    const found = await new MentionLinkedinProvider().mention('token', {
      query: 'postqueen',
    });
    assert.deepEqual(found, [
      {
        id: '1234',
        label: 'PostQueen',
        image: 'https://cdn.test/logo.png',
        doNotCache: true,
      },
    ]);
  });

  it('keeps post statistics for at most a year on both tiles', () => {
    assert.equal(new LinkedinProvider().analyticsRetentionDays, 365);
    assert.equal(new LinkedinPageProvider().analyticsRetentionDays, 365);
  });
});
