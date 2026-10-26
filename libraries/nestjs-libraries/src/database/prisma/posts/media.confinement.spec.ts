import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { after, before, describe, it } from 'node:test';

// Loads the service the way create.post.spec.ts does: tsconfig maps
// `file-type` to its declarations, so it is pointed at the package's own entry.
const canLoadService = typeof nodeModule.registerHooks === 'function';
if (canLoadService) {
  nodeModule.registerHooks({
    resolve: (specifier, context, next) =>
      specifier === 'file-type'
        ? {
            url: new URL(
              '../../../../../../node_modules/file-type/source/index.js',
              import.meta.url
            ).href,
            shortCircuit: true,
          }
        : next(specifier, context),
  });
}

let PostsService: any;
const uploadDirectory = process.env.UPLOAD_DIRECTORY;
before(async () => {
  process.env.UPLOAD_DIRECTORY = '/srv/uploads';
  if (canLoadService) {
    ({ PostsService } = await import('./posts.service.ts'));
  }
});
after(() => {
  process.env.UPLOAD_DIRECTORY = uploadDirectory;
});

// Only what updateMedia and updateTags touch; the rest of the service is not
// constructed.
const fake = (releaseURL = '') => {
  const self: any = {
    _mediaService: { getMediaByIds: async () => [] },
    _postRepository: {
      getPostUrls: async () => [{ id: 'abc', releaseURL }],
      updateImages: async () => undefined,
    },
  };
  self.isAllowedMediaPath = PostsService.prototype.isAllowedMediaPath;
  return self;
};

describe('media paths stay inside UPLOAD_DIRECTORY', { skip: !canLoadService }, () => {
  it('keeps uploads and remote URLs', async () => {
    const media = await PostsService.prototype.updateMedia.call(fake(), 'p1', [
      { id: '1', path: '/2026/10/a.png' },
      { id: '2', path: 'https://cdn.example/a.png' },
    ]);
    assert.deepEqual(
      media.map((m: any) => m.path),
      ['/srv/uploads/2026/10/a.png', 'https://cdn.example/a.png']
    );
  });

  it('drops a path that climbs out of the directory', async () => {
    const media = await PostsService.prototype.updateMedia.call(fake(), 'p1', [
      { id: '1', path: '/../../etc/passwd' },
      { id: '2', path: '/2026/../../../app/.env' },
    ]);
    assert.deepEqual(media, []);
  });

  it('drops a local path that only mentions http', async () => {
    const media = await PostsService.prototype.updateMedia.call(fake(), 'p1', [
      { id: '1', path: '/app/http/.env' },
      { id: '2', path: 'apps/backend/.env?http' },
    ]);
    assert.deepEqual(media, []);
  });
});

describe('post tags take the release URL as text', { skip: !canLoadService }, () => {
  const post = {
    id: 'p1',
    content: '<p>See (post:abc)</p>',
    settings: '{"title":"(post:abc)"}',
    image: '[{"id":"1","path":"/2026/a.png"}]',
  };

  it('writes the URL into the content and the settings', async () => {
    const [p] = await PostsService.prototype.updateTags.call(
      fake('https://lemmy.example/post/1'),
      'org',
      [post]
    );
    assert.equal(p.content, '<p>See https://lemmy.example/post/1</p>');
    assert.deepEqual(JSON.parse(p.settings), {
      title: 'https://lemmy.example/post/1',
    });
    assert.equal(p.image, post.image);
  });

  it('cannot rewrite the media list with a quote in the URL', async () => {
    const hostile =
      'https://x.example/","image":"[{\\"path\\":\\"/../../etc/passwd\\"}]';
    const [p] = await PostsService.prototype.updateTags.call(fake(hostile), 'org', [
      post,
    ]);
    assert.equal(p.image, post.image);
    // a release URL list is comma separated; the first entry is the one used
    assert.equal(JSON.parse(p.settings).title, 'https://x.example/"');
  });

  it('does not expand $ patterns in the URL', async () => {
    const [p] = await PostsService.prototype.updateTags.call(
      fake("https://x.example/$&$'"),
      'org',
      [post]
    );
    assert.equal(p.content, "<p>See https://x.example/$&$'</p>");
  });
});
