import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LemmyProvider } from './lemmy.provider.ts';
import { LemmySettingsDto } from '../../dtos/posts/providers-settings/lemmy.dto.ts';

describe('Lemmy cover image', () => {
  const provider = new LemmyProvider();
  const cover = (ext: string) =>
    provider.checkValidity([[{ path: `https://cdn.test/cover.${ext}` }]]);

  it('accepts .jpeg and .webp, which the jpef typo refused', async () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
      assert.equal(await cover(ext), true, ext);
    }
  });

  it('still refuses a video as the cover', async () => {
    assert.equal(await cover('mp4'), 'You can set only one picture for a cover');
  });
});

describe('Lemmy title', () => {
  const errorsFor = async (title: string) => {
    const errors = await validate(
      plainToInstance(LemmySettingsDto, {
        subreddit: [{ value: { subreddit: 'test', id: '1', title } }],
      }) as object,
      { skipMissingProperties: false }
    );
    const flatten = (list: any[]): any[] =>
      list.flatMap((e) => [e, ...flatten(e.children || [])]);
    return flatten(errors)
      .filter((e) => e.constraints)
      .map((e) => Object.keys(e.constraints));
  };

  it('takes 3 to 200 characters', async () => {
    assert.deepEqual(await errorsFor('abc'), []);
    assert.deepEqual(await errorsFor('a'.repeat(200)), []);
  });

  it('refuses 2 and 201, as Lemmy does', async () => {
    assert.deepEqual(await errorsFor('ab'), [['minLength']]);
    assert.deepEqual(await errorsFor('a'.repeat(201)), [['maxLength']]);
  });
});
