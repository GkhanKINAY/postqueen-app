import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RedditSettingsDto } from './reddit.dto.ts';

const errorsFor = async (title: string) => {
  const errors = await validate(
    plainToInstance(RedditSettingsDto, {
      subreddit: [
        {
          value: {
            subreddit: '/r/test',
            title,
            type: 'self',
            url: '',
            is_flair_required: false,
          },
        },
      ],
    }) as object,
    { skipMissingProperties: false }
  );
  const flatten = (list: any[]): any[] =>
    list.flatMap((e) => [e, ...flatten(e.children || [])]);
  return flatten(errors).filter((e) => e.constraints);
};

describe('Reddit title', () => {
  it('takes up to 300 characters', async () => {
    assert.deepEqual(await errorsFor('a'.repeat(300)), []);
  });

  it('refuses 301, as /api/submit does', async () => {
    const [error] = await errorsFor('a'.repeat(301));
    assert.equal(error.property, 'title');
    assert.ok(error.constraints.maxLength);
  });
});
