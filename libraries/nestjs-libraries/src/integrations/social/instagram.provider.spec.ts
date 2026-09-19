import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InstagramProvider } from './instagram.provider.ts';
import { InstagramStandaloneProvider } from './instagram.standalone.provider.ts';
import { InstagramDto } from '../../dtos/posts/providers-settings/instagram.dto.ts';

const images = (count: number, ext = 'jpg') =>
  Array.from({ length: count }, (_, i) => ({ path: `https://cdn.test/${i}.${ext}` }));

const tiles = [
  ['Facebook login', new InstagramProvider()],
  ['standalone', new InstagramStandaloneProvider()],
] as const;

describe('Instagram limits, on both tiles', () => {
  for (const [name, provider] of tiles) {
    it(`${name}: converts images to JPEG before publishing`, () => {
      assert.equal(provider.convertToJPEG, true);
    });

    it(`${name}: refuses more than 10 carousel items`, async () => {
      assert.equal(
        await provider.checkValidity([images(10)], { post_type: 'post' }, []),
        true
      );
      assert.equal(
        await provider.checkValidity([images(11)], { post_type: 'post' }, []),
        'Instagram carousel only supports up to 10 media attachments'
      );
    });

    it(`${name}: publishes a story item by item, so neither cap applies`, async () => {
      const hashtags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
      assert.equal(
        await provider.checkValidity([images(11)], { post_type: 'story' }, [], [hashtags]),
        true
      );
      assert.match(
        String(
          await provider.checkValidity([images(1, 'bmp')], { post_type: 'story' }, [])
        ),
        /BMP files cannot be converted/
      );
    });

    it(`${name}: refuses a BMP, which the conversion cannot read`, async () => {
      assert.match(
        String(
          await provider.checkValidity([images(1, 'bmp')], { post_type: 'post' }, [])
        ),
        /BMP files cannot be converted/
      );
      assert.equal(
        await provider.checkValidity([images(2, 'webp')], { post_type: 'post' }, []),
        true
      );
    });

    it(`${name}: allows 30 hashtags and 20 mentions, not one more`, async () => {
      const tags = (n: number) =>
        Array.from({ length: n }, (_, i) => `#tag${i}`).join(' ');
      const mentions = (n: number) =>
        Array.from({ length: n }, (_, i) => `@user.${i}`).join(' ');
      const check = (caption: string) =>
        provider.checkValidity([images(1)], { post_type: 'post' }, [], [caption]);

      assert.equal(await check(`${tags(30)} ${mentions(20)}`), true);
      assert.equal(
        await check(tags(31)),
        'Instagram allows up to 30 hashtags in a caption'
      );
      assert.equal(
        await check(mentions(21)),
        'Instagram allows up to 20 @mentions in a caption'
      );
    });

    it(`${name}: does not count e-mails, URL fragments inside words or entities`, async () => {
      const caption = Array.from(
        { length: 25 },
        (_, i) => `me${i}@example.com a&#${i}b`
      ).join(' ');
      assert.equal(
        await provider.checkValidity([images(1)], { post_type: 'post' }, [], [caption]),
        true
      );
    });

    it(`${name}: still works when no text is passed`, async () => {
      assert.equal(
        await provider.checkValidity([images(1)], { post_type: 'post' }, []),
        true
      );
    });
  }
});

describe('InstagramDto collaborators', () => {
  const errors = (collaborators: string[]) =>
    validate(
      plainToInstance(InstagramDto, {
        post_type: 'post',
        collaborators: collaborators.map((label) => ({ label })),
      }) as object,
      { skipMissingProperties: false }
    );

  it('accepts up to 3', async () => {
    assert.equal((await errors(['a', 'b', 'c'])).length, 0);
  });

  it('refuses a fourth, for API and MCP callers too', async () => {
    const [error] = await errors(['a', 'b', 'c', 'd']);
    assert.equal(error.property, 'collaborators');
    assert.deepEqual(Object.values(error.constraints || {}), [
      'Instagram allows up to 3 collaborators',
    ]);
  });
});
