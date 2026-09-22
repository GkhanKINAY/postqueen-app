import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
