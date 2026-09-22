import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { XProvider } from './x.provider.ts';

const provider = new XProvider();
const media = (...exts: string[]) =>
  exts.map((ext, i) => ({ path: `https://cdn.test/${i}.${ext}` }));
const post = { post_type: 'post' };

describe('X media per post', () => {
  it('takes up to 4 pictures, or a lone GIF or video, or nothing', async () => {
    assert.equal(await provider.checkValidity([media()], post), true);
    assert.equal(
      await provider.checkValidity([media('jpg', 'png', 'webp', 'jpeg')], post),
      true
    );
    assert.equal(await provider.checkValidity([media('gif')], post), true);
    assert.equal(await provider.checkValidity([media('mp4')], post), true);
  });

  it('refuses a fifth picture', async () => {
    assert.equal(
      await provider.checkValidity([media('jpg', 'jpg', 'jpg', 'jpg', 'jpg')], post),
      'X allows up to 4 pictures per post'
    );
  });

  it('refuses a GIF or a video next to anything else', async () => {
    for (const mix of [
      media('mp4', 'jpg'),
      media('gif', 'png'),
      media('mp4', 'mp4'),
      media('gif', 'gif'),
    ]) {
      assert.equal(
        await provider.checkValidity([mix], post),
        'X allows one video or one GIF per post, without other media'
      );
    }
  });

  it('holds every thread reply to the same rule', async () => {
    assert.equal(
      await provider.checkValidity([media('jpg'), media('mp4', 'jpg')], post),
      'X allows one video or one GIF per post, without other media'
    );
    assert.equal(
      await provider.checkValidity([media('mp4'), media('jpg', 'jpg')], post),
      true
    );
  });

  it('leaves articles to their own rules', async () => {
    const article = { post_type: 'article', article_status: 'published' };
    assert.equal(
      await provider.checkValidity([media('jpg', 'jpg', 'jpg', 'jpg', 'jpg')], article),
      true
    );
    assert.equal(
      await provider.checkValidity([media('mp4')], article),
      'X articles only support images'
    );
  });
});
