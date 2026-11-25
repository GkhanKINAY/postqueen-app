import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PostsRepository } from './posts.repository.ts';

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
  instance.createPost = async (
    org: string,
    body: any,
    _creationMethod: string,
    inPlace: boolean
  ) => {
    saved.push({ org, body, inPlace });
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

describe(
  'an in-place update of a repeating post',
  { skip: !canLoadService },
  () => {
    it('keeps the interval through a settings update and an attachments update', async () => {
      const weekly = post({ intervalInDays: 7 });
      await service(weekly).updatePostSettings(
        'org-1',
        'post-1',
        { title: 'New' },
        'API'
      );
      await service(weekly).updatePostAttachments(
        'org-1',
        'post-1',
        [{ id: 'a', path: OWN }],
        'MCP'
      );
      assert.deepEqual(
        saved.map((s) => [s.body.inter, s.inPlace]),
        [
          [7, true],
          [7, true],
        ]
      );

      saved = [];
      await service(post()).updatePostSettings('org-1', 'post-1', {}, 'API');
      assert.equal(saved[0].body.inter, undefined);
    });
  }
);

// What createOrUpdatePost writes over an existing row, recorded
const upserts = async (inPlace: boolean, inter?: number) => {
  const written: any[] = [];
  const repository = new PostsRepository(
    {
      model: {
        post: {
          findFirst: async () => null,
          findUnique: async () => ({ organizationId: 'org-1' }),
          upsert: async (args: any) => {
            written.push(args);
            return { id: args.where.id };
          },
          updateMany: async () => ({ count: 0 }),
        },
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    { model: { tagsPosts: { deleteMany: async () => ({ count: 0 }) } } } as any,
    {} as any
  );
  await repository.createOrUpdatePost(
    'update',
    'org-1',
    '2026-12-01T10:00:00Z',
    {
      group: 'group-1',
      integration: { id: 'channel-1' },
      value: [{ id: 'post-1', content: '<p>hello</p>', image: [] }],
      settings: { __type: 'bluesky' },
    } as any,
    [],
    'MCP' as any,
    inter,
    inPlace
  );
  return written[0].update;
};

describe('saving over an existing post', () => {
  it('leaves the interval, the approval and the order and message links of an in-place update alone', async () => {
    const update = await upserts(true, 7);
    assert.equal(update.intervalInDays, 7);
    assert.equal(update.group, 'group-1');
    assert.equal('approvedSubmitForOrder' in update, false);
    assert.equal('lastMessage' in update, false);
    assert.equal('submittedForOrder' in update, false);
    assert.equal('state' in update, false);
  });

  it('still resets them on an edit from the dashboard', async () => {
    const update = await upserts(false);
    assert.equal(update.intervalInDays, null);
    assert.equal(update.approvedSubmitForOrder, 'NO');
    assert.deepEqual(update.lastMessage, { disconnect: true });
    assert.deepEqual(update.submittedForOrder, { disconnect: true });
    assert.notEqual(update.group, 'group-1');
  });
});
