import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { userMessageParts } from './user.message.parts.ts';

describe('userMessageParts', () => {
  it('keeps what a member typed as text, markup included', () => {
    assert.deepEqual(userMessageParts('<img src=x onerror="alert(1)"> & <b>hi</b>'), [
      { type: 'text', text: '<img src=x onerror="alert(1)"> & <b>hi</b>' },
    ]);
  });

  it('turns the composer media block into the picture and the video', () => {
    assert.deepEqual(
      userMessageParts(
        'Look\n[--Media--]\nImage: https://cdn.example/a.png [id:m1]\nVideo: https://cdn.example/b.mp4 [id:m2]\n[--Media--]'
      ),
      [
        { type: 'text', text: 'Look' },
        {
          type: 'media',
          parts: [
            { type: 'image', src: 'https://cdn.example/a.png' },
            { type: 'video', src: 'https://cdn.example/b.mp4' },
          ],
        },
      ]
    );
  });

  it('only takes http(s) URLs with no quotes, brackets or spaces', () => {
    for (const line of [
      'Image: javascript:alert(1)',
      'Image: https://cdn.example/a.png"onerror="alert(1)',
      'Image: https://cdn.example/a[b].png',
      'Video: https://cdn.example/not-a-video.png',
    ]) {
      const parts = userMessageParts(line);
      assert.ok(
        parts.every((part) => part.type === 'text'),
        `${line} became ${JSON.stringify(parts)}`
      );
    }
  });

  it('drops the integrations block', () => {
    assert.deepEqual(userMessageParts('Hi [--integrations--]x, y[--integrations--] there'), [
      { type: 'text', text: 'Hi  there' },
    ]);
  });
});
