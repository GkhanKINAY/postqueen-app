import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

// As in create.post.spec.ts: tsx follows tsconfig's mapping of `file-type` to
// its declarations, so the upload code the service imports is pointed at the
// package's own entry. registerHooks arrived in Node 22.15; on an older 22
// the spec is skipped rather than failed.
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
before(async () => {
  if (canLoadService) {
    ({ PostsService } = await import('./posts.service.ts'));
  }
});

const OWN = 'https://uploads.example.com/org-1/new.png';
const CONVERTED = 'https://uploads.example.com/org-1/video.mp4';
const UPLOADED_AS = 'https://uploads.example.com/org-1/video.mov';
const THEIRS = 'https://uploads.example.com/org-2/theirs.png';
const ON_POST = 'https://uploads.example.com/org-1/already.png';

let looked: string[][];
let saved: any[];

// The service with the post, the media library and createPost faked: what
// the update would write is recorded instead.
const service = (post: Record<string, any>) => {
  const instance = new PostsService(
    {},
    {},
    {},
    {
      findOwnedMediaByPaths: async (org: string, paths: string[]) => {
        looked.push(paths);
        return [
          { id: 'media-new', path: OWN, uploadedPath: null, thumbnail: null },
          {
            id: 'media-video',
            path: CONVERTED,
            uploadedPath: UPLOADED_AS,
            thumbnail: null,
          },
        ].filter(
          (row) =>
            org === 'org-1' &&
            (paths.includes(row.path) ||
              (row.uploadedPath && paths.includes(row.uploadedPath)))
        );
      },
    },
    {},
    {},
    {},
    {},
    {},
    {},
    {}
  );
  instance.getPostsRecursively = async (
    id: string,
    _includeIntegration: boolean,
    org: string
  ) =>
    id === post.id && org === 'org-1'
      ? [
          post,
          {
            id: 'comment-1',
            parentPostId: post.id,
            content: '<p>comment</p>',
            image: JSON.stringify([{ id: 'c', path: ON_POST }]),
          },
        ]
      : [];
  instance.validatePosts = async () => [
    { valid: true, errors: true, emptyContent: false, tooLong: false },
  ];
  instance.createPost = async (org: string, body: any) => {
    saved.push({ org, body });
    return [{ postId: body.posts[0].value[0].id }];
  };
  return instance;
};

const post = (extra: Record<string, unknown> = {}) => ({
  id: 'post-1',
  parentPostId: null,
  state: 'QUEUE',
  publishDate: new Date(Date.now() + 86_400_000),
  group: 'group-1',
  content: '<p>hello</p>',
  settings: JSON.stringify({ __type: 'bluesky' }),
  image: JSON.stringify([{ id: 'media-old', path: ON_POST }]),
  integration: { id: 'channel-1', providerIdentifier: 'bluesky' },
  tags: [],
  ...extra,
});

const refused = (pattern: RegExp) => (err: unknown) =>
  err instanceof BadRequestException && pattern.test(err.message);

// The service builds its storage when constructed: keep it the local one.
const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  looked = [];
  saved = [];
});

afterEach(() => {
  for (const key of KEYS) {
    if (previous[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous[key];
    }
  }
});

describe(
  'replacing the attachments of an unpublished post',
  { skip: !canLoadService },
  () => {
    it("replaces the main post's media in place, and leaves the rest as it is", async () => {
      const output = await service(post()).updatePostAttachments(
        'org-1',
        'post-1',
        [
          { id: 'made-up', path: ON_POST },
          { id: 'made-up-2', path: OWN, alt: 'A new picture' },
          { id: 'made-up-3', path: UPLOADED_AS },
        ],
        'MCP'
      );

      assert.equal(output.postId, 'post-1');
      // only what the post does not carry yet is looked up
      assert.deepEqual(looked, [[OWN, UPLOADED_AS]]);
      assert.equal(saved.length, 1);
      const { org, body } = saved[0];
      assert.equal(org, 'org-1');
      assert.equal(body.type, 'update');
      assert.equal(body.posts[0].group, 'group-1');
      assert.deepEqual(
        body.posts[0].value.map((v: any) => [v.id, v.content, v.image]),
        [
          [
            'post-1',
            '<p>hello</p>',
            [
              { id: 'made-up', path: ON_POST },
              { id: 'made-up-2', path: OWN, alt: 'A new picture' },
              { id: 'made-up-3', path: UPLOADED_AS },
            ],
          ],
          ['comment-1', '<p>comment</p>', [{ id: 'c', path: ON_POST }]],
        ]
      );
      assert.deepEqual(body.posts[0].settings, { __type: 'bluesky' });
    });

    it('removes every attachment for an empty list', async () => {
      await service(post()).updatePostAttachments('org-1', 'post-1', [], 'API');
      assert.deepEqual(saved[0].body.posts[0].value[0].image, []);
      assert.deepEqual(looked, []);
    });

    it("refuses media outside this organization's library, before writing", async () => {
      await assert.rejects(
        service(post()).updatePostAttachments(
          'org-1',
          'post-1',
          [
            { id: 'a', path: OWN },
            { id: 'b', path: THEIRS },
          ],
          'API'
        ),
        refused(/Media not found: .*theirs\.png/)
      );
      assert.deepEqual(saved, []);
    });

    it('refuses a published post, a past one, a comment and another organization', async () => {
      for (const [org, target, pattern] of [
        ['org-1', post({ state: 'PUBLISHED' }), /not published yet/],
        ['org-1', post({ state: 'ERROR' }), /not published yet/],
        [
          'org-1',
          post({ publishDate: new Date(Date.now() - 60_000) }),
          /already passed/,
        ],
        ['org-1', post({ parentPostId: 'post-0' }), /comment/],
      ] as const) {
        await assert.rejects(
          service(target).updatePostAttachments(
            org,
            'post-1',
            [{ id: 'a', path: OWN }],
            'API'
          ),
          refused(pattern)
        );
      }
      await assert.rejects(
        service(post()).updatePostAttachments(
          'org-2',
          'post-1',
          [{ id: 'a', path: OWN }],
          'API'
        ),
        /Post not found/
      );
      assert.deepEqual(saved, []);
      assert.deepEqual(looked, []);
    });

    it('still updates the settings alone through the same path', async () => {
      await service(post()).updatePostSettings(
        'org-1',
        'post-1',
        { title: 'New' },
        'API'
      );
      assert.deepEqual(saved[0].body.posts[0].settings, {
        __type: 'bluesky',
        title: 'New',
      });
      assert.deepEqual(saved[0].body.posts[0].value[0].image, [
        { id: 'media-old', path: ON_POST },
      ]);
      assert.deepEqual(looked, []);
    });
  }
);
