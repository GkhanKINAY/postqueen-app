import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TikTokDto } from './tiktok.dto.ts';

const base = {
  privacy_level: 'SELF_ONLY',
  duet: false,
  stitch: false,
  comment: false,
  autoAddMusic: 'no',
  brand_content_toggle: false,
  brand_organic_toggle: false,
  content_posting_method: 'DIRECT_POST',
};

const errorsFor = (settings: Record<string, unknown>) =>
  validate(plainToInstance(TikTokDto, { ...base, ...settings }) as object, {
    skipMissingProperties: false,
  });

const messages = async (settings: Record<string, unknown>) =>
  (await errorsFor(settings)).flatMap((e) => Object.values(e.constraints || {}));

describe('TikTok commercial content disclosure', () => {
  it('refuses a disclosure with neither brand option chosen', async () => {
    const [error] = await errorsFor({ disclose: true });
    assert.equal(error.property, 'disclose');
    assert.ok(
      Object.values(error.constraints || {}).includes(
        'Choose Your brand, Branded content or both, or turn off Disclose Video Content'
      )
    );
  });

  it('passes with one or both brand options', async () => {
    for (const brands of [
      { brand_organic_toggle: true },
      { brand_content_toggle: true, privacy_level: 'FOLLOWER_OF_CREATOR' },
      { brand_organic_toggle: true, brand_content_toggle: true },
    ]) {
      assert.deepEqual(await messages({ disclose: true, ...brands }), []);
    }
  });

  it('leaves posts without a disclose field, or with it off, alone', async () => {
    assert.deepEqual(await messages({}), []);
    assert.deepEqual(await messages({ disclose: false }), []);
  });

  it('does not judge Upload mode, where TikTok ignores the disclosure', async () => {
    assert.deepEqual(
      await messages({ disclose: true, content_posting_method: 'UPLOAD' }),
      []
    );
  });
});

describe('TikTok privacy level', () => {
  it('says what to do when none was chosen', async () => {
    for (const privacy_level of [undefined, '']) {
      assert.ok(
        (await messages({ privacy_level })).includes('Choose who can see this video')
      );
    }
  });
});
