import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MeweDto } from './mewe.dto.ts';

const errorsFor = (settings: Record<string, unknown>) =>
  validate(plainToInstance(MeweDto, settings) as object, {
    skipMissingProperties: false,
  });

describe('MeWe group posts', () => {
  it('need a group', async () => {
    for (const group of [undefined, '']) {
      const [error] = await errorsFor({ postType: 'group', group });
      assert.equal(error.property, 'group');
      assert.ok(
        Object.values(error.constraints || {}).includes('Select a group to post to')
      );
    }
  });

  it('pass with one', async () => {
    assert.equal((await errorsFor({ postType: 'group', group: '42' })).length, 0);
  });

  it('leave timeline posts free of it', async () => {
    assert.equal((await errorsFor({ postType: 'timeline' })).length, 0);
  });
});
