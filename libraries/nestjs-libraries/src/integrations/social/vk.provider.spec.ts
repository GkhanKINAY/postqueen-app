import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { VkProvider } from './vk.provider.ts';

/**
 * VK answers HTTP 200 with { error } instead of { response } when it refuses
 * a call, and a video goes to video.save's upload_url as `video_file`, not as
 * the `photo` the wall photo server takes.
 */

const answers = (...bodies: unknown[]) => {
  const provider = new VkProvider();
  const urls: string[] = [];
  const uploads: { url: string; form: any }[] = [];
  (provider as any).fetch = async (url: string) => {
    urls.push(url);
    const body = bodies.shift();
    return { json: async () => body };
  };
  (provider as any).getSsrfSafeAxios = () => ({
    get: async () => ({ data: Readable.from(['file']) }),
    post: async (url: string, form: any) => {
      uploads.push({ url, form });
      return { data: {} };
    },
  });
  return { provider, urls, uploads };
};

// The multipart body as sent, to read the part names from.
const read = (form: any) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    form.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
    form.on('end', () => resolve(Buffer.concat(chunks).toString()));
    form.on('error', reject);
    form.resume();
  });

const post = (media: { path: string }[] = []) => [
  { id: 'p1', message: 'Hello', settings: {}, media } as any,
];

describe('VK video upload', () => {
  it('sends the file as video_file to the upload_url of video.save', async () => {
    const { provider, urls, uploads } = answers(
      { response: { upload_url: 'https://upload.vk.test/v', video_id: 7 } },
      { response: { post_id: 42 } }
    );

    const [result] = await provider.post(
      '1',
      'token',
      post([{ path: 'https://cdn.test/clip.mp4' }])
    );

    assert.match(urls[0], /method\/video\.save\?/);
    assert.equal(uploads[0].url, 'https://upload.vk.test/v');
    const body = await read(uploads[0].form);
    assert.match(body, /name="video_file"; filename="clip\.mp4"/);
    assert.doesNotMatch(body, /name="photo"/);
    assert.equal(result.postId, '42');
  });
});

describe('VK in-body errors', () => {
  it('fail the upload with VK’s reason instead of a TypeError', async () => {
    const { provider, uploads } = answers({
      error: {
        error_code: 15,
        error_msg: 'Access denied: no access to call this method',
      },
    });

    await assert.rejects(
      provider.post(
        '1',
        'token',
        post([{ path: 'https://cdn.test/clip.mp4' }])
      ),
      /Access denied: no access to call this method/
    );
    assert.equal(uploads.length, 0);
  });

  it('fail a refused wall post instead of marking it published', async () => {
    const { provider } = answers({
      error: { error_code: 214, error_msg: 'Access to adding post denied' },
    });

    await assert.rejects(
      provider.post('1', 'token', post()),
      /Access to adding post denied/
    );
  });
});
