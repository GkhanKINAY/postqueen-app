import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ThreadsProvider } from './threads.provider.ts';

const provider = new ThreadsProvider();
const media = (count: number, ext = 'jpg') =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.${ext}` }));
const text = (...texts: string[]) =>
  provider.checkValidity(texts.map(() => []), {}, [], texts);

describe('Threads media', () => {
  it('takes carousels of up to 20 items, per post and per reply', async () => {
    assert.equal(await provider.checkValidity([media(20)], {}, []), true);
    assert.equal(
      await provider.checkValidity([media(1), media(21)], {}, []),
      'Threads carousels can have up to 20 items'
    );
  });

  it('takes JPEG and PNG images, and videos', async () => {
    assert.equal(
      await provider.checkValidity(
        [[...media(1, 'jpg'), ...media(1, 'jpeg'), ...media(1, 'png'), ...media(1, 'mp4')]],
        {},
        []
      ),
      true
    );
    for (const ext of ['gif', 'webp', 'avif', 'bmp', 'tiff']) {
      assert.equal(
        await provider.checkValidity([media(1, ext)], {}, []),
        'Threads accepts JPEG or PNG images only',
        ext
      );
    }
  });
});

describe('Threads text', () => {
  it('allows 5 distinct links, not 6', async () => {
    const links = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://site${i}.test/page`).join(' ');
    assert.equal(await text(links(5)), true);
    // The same link twice is one link.
    assert.equal(await text(`${links(5)} https://site0.test/page`), true);
    assert.equal(await text(links(6)), 'Threads allows up to 5 links per post');
    assert.equal(
      await text('first post', `${links(5)} www.sixth.test`),
      'Threads allows up to 5 links per post'
    );
  });

  it('leaves the length, in bytes, to the generic too-long check', async () => {
    assert.equal(await text('a'.repeat(600)), true);
    assert.equal(await text('😀'.repeat(200)), true);
  });
});
