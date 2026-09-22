import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { YoutubeProvider } from './youtube.provider.ts';
import { YoutubeSettingsDto } from '../../dtos/posts/providers-settings/youtube.settings.dto.ts';

const provider = new YoutubeProvider();
const video = [[{ path: 'https://cdn.test/clip.mp4' }]];
const check = (description?: string) =>
  provider.checkValidity(
    video,
    {},
    [],
    description === undefined ? undefined : [description]
  );

describe('YouTube description', () => {
  it('is measured in bytes, not characters', async () => {
    assert.equal(await check('a'.repeat(5000)), true);
    assert.match(String(await check('a'.repeat(5001))), /at most 5,000 bytes/);
    // 2,000 Cyrillic letters are 2,000 characters but 4,000 bytes: fine.
    assert.equal(await check('д'.repeat(2000)), true);
    // 2,501 of them are 5,002 bytes, under 5,000 characters and still refused.
    assert.match(String(await check('д'.repeat(2501))), /at most 5,000 bytes/);
    // An emoji is 4 bytes.
    assert.match(String(await check('🎬'.repeat(1251))), /at most 5,000 bytes/);
  });

  it('may not contain < or >', async () => {
    assert.equal(
      await check('Step 1 -> step 2'),
      'YouTube descriptions cannot contain < or >'
    );
    assert.equal(await check('a < b'), 'YouTube descriptions cannot contain < or >');
    assert.equal(await check('Plain text, no angle brackets.'), true);
  });

  it('keeps the one-video rule and still works without text', async () => {
    assert.equal(await check(), true);
    assert.equal(
      await provider.checkValidity([[{ path: 'https://cdn.test/a.jpg' }]], {}, []),
      'Item must be a video'
    );
  });
});

describe('YoutubeSettingsDto title', () => {
  const errors = (title: string) =>
    validate(
      plainToInstance(YoutubeSettingsDto, { title, type: 'public' }) as object,
      { skipMissingProperties: false }
    );

  it('refuses < and >', async () => {
    const [error] = await errors('Before -> after');
    assert.equal(error.property, 'title');
    assert.ok(
      Object.values(error.constraints || {}).includes(
        'YouTube titles cannot contain < or >'
      )
    );
  });

  it('accepts any other text, accents and emoji included', async () => {
    assert.equal((await errors('Ça marche 🎬 — part 2')).length, 0);
  });
});
