import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DevToSettingsDto } from './dev.to.settings.dto.ts';

const errorsFor = (title: string) =>
  validate(plainToInstance(DevToSettingsDto, { title, tags: [] }) as object, {
    skipMissingProperties: false,
  });

describe('DEV article title', () => {
  it('takes up to 128 characters', async () => {
    assert.equal((await errorsFor('a'.repeat(128))).length, 0);
  });

  it('refuses 129, as Forem does', async () => {
    const [error] = await errorsFor('a'.repeat(129));
    assert.equal(error.property, 'title');
    assert.ok(error.constraints?.maxLength);
  });
});
