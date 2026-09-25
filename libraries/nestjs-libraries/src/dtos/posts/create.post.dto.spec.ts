import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostDto } from './create.post.dto.ts';

// One post with __type set to the channel's provider, the way mapTypeToPost
// in posts.service.ts sets it. This runs class-validator with its own
// defaults, which refuse a settings class that declares no rules at all.
// Nest's ValidationPipe, the one mapTypeToPost uses, turns that check off, so
// this is the stricter of the two.
const errorsFor = async (
  __type: string,
  settings: Record<string, unknown> = {}
) => {
  const errors = await validate(
    plainToInstance(CreatePostDto, {
      type: 'schedule',
      shortLink: false,
      date: '2026-10-01T10:00:00.000Z',
      tags: [],
      posts: [
        {
          integration: { id: 'channel' },
          value: [{ content: 'hello', image: [] }],
          settings: { ...settings, __type },
        },
      ],
    }) as object,
    { skipMissingProperties: false }
  );
  const flatten = (list: any[]): any[] =>
    list.flatMap((e) => [e, ...flatten(e.children || [])]);
  return flatten(errors)
    .filter((e) => e.constraints)
    .map((e) => Object.keys(e.constraints));
};

describe('Post settings by channel', () => {
  it('take a Kick post with no settings, as they take a Threads one', async () => {
    assert.deepEqual(await errorsFor('threads'), []);
    assert.deepEqual(await errorsFor('kick'), []);
  });

  it('take a Moltbook post with the submolt left blank', async () => {
    assert.deepEqual(await errorsFor('moltbook'), []);
    assert.deepEqual(await errorsFor('moltbook', { submolt: '' }), []);
    assert.deepEqual(await errorsFor('moltbook', { submolt: 'general' }), []);
  });

  it('still refuse a provider nobody declared', async () => {
    assert.notDeepEqual(await errorsFor('nope'), []);
  });
});
