import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

// tsconfig maps `file-type` to its type declarations for tsc, and tsx follows
// that mapping at run time, so the upload code the service imports would load
// a .d.ts. Point it at the package's own entry instead. registerHooks arrived
// in Node 22.15; on an older 22 the spec is skipped rather than failed.
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

// Static imports are hoisted above the hook, so the service is imported once
// the hook is in place.
let PostsService: any;
before(async () => {
  if (canLoadService) {
    ({ PostsService } = await import('./posts.service.ts'));
  }
});

// The service with every collaborator faked: what it writes and which
// publishing workflows it starts are recorded instead.
let writes: { integration: string; value: any[] }[];
let started: { workflowId: string; args: any[] }[];
let published: string[];
let foreignMedia: string[];
let foreignPosts: string[];
let shortenerDown: boolean;

const service = () =>
  new PostsService(
    {
      getPostById: async (id: string) =>
        published.includes(id)
          ? {
              id,
              state: 'PUBLISHED',
              publishDate: new Date('2026-09-01T10:00:00Z'),
              integration: { providerIdentifier: 'bluesky' },
            }
          : null,
      countPostsOfOtherOrganizations: async (org: string, ids: string[]) =>
        ids.filter((id) => foreignPosts.includes(id)).length,
      createOrUpdatePost: async (
        type: string,
        org: string,
        date: string,
        post: any
      ) => {
        // The repository's own refusal, which comes only once it writes.
        if (post.value.some((value: any) => foreignPosts.includes(value.id))) {
          throw new Error('Post not found');
        }
        writes.push({ integration: post.integration.id, value: post.value });
        return {
          posts: post.value.map((value: any, index: number) => ({
            id: value.id || `${post.integration.id}-${index}`,
            state: type === 'draft' ? 'DRAFT' : 'QUEUE',
            content: value.content,
          })),
        };
      },
      getAnchoredCommentsForPost: async () => [],
    },
    { getSocialIntegration: () => ({}) },
    {},
    {
      findOwnedMediaIds: async (org: string, ids: string[]) =>
        ids.filter((id) => !foreignMedia.includes(id)).map((id) => ({ id })),
      findOwnedMediaByPaths: async () => [],
      getMediaByIds: async (ids: string[]) =>
        ids.filter((id) => foreignMedia.includes(id)).map((id) => ({ id })),
    },
    {
      convertTextToShortLinks: async (org: string, messages: string[]) => {
        if (shortenerDown && messages.some((m) => m.includes('second'))) {
          throw new Error('shortener unreachable');
        }
        return messages;
      },
    },
    {},
    {
      client: {
        getRawClient: () => ({
          workflow: {
            list: async function* () {},
            start: async (name: string, options: any) =>
              started.push({
                workflowId: options.workflowId,
                args: options.args,
              }),
          },
        }),
        getWorkflowHandle: async () => null,
      },
    },
    {},
    {},
    {}
  );

const channel = (id: string, value: any[]) => ({
  integration: { id },
  group: `group-${id}`,
  settings: { __type: 'bluesky' },
  value,
});
const request = (extra: Record<string, unknown> = {}) => ({
  type: 'schedule',
  shortLink: false,
  date: '2026-10-01T10:00:00',
  tags: [],
  posts: [
    channel('first', [{ content: '<p>first</p>', image: [] }]),
    channel('second', [{ content: '<p>second</p>', image: [] }]),
  ],
  ...extra,
});
// startWorkflow is not awaited by createPost: let it run before looking.
const settle = () => new Promise((resolve) => setImmediate(resolve));

// The service builds its storage when constructed: keep it the local one.
const KEYS = ['STORAGE_PROVIDER', 'UPLOAD_DIRECTORY'];
const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIRECTORY = tmpdir();
  writes = [];
  started = [];
  published = [];
  foreignMedia = [];
  foreignPosts = [];
  shortenerDown = false;
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
  'createPost saves every channel or none',
  {
    skip: !canLoadService,
  },
  () => {
    it('writes and schedules both channels of a valid request, in order', async () => {
      const output = await service().createPost('org-1', request(), 'API');
      await settle();

      assert.deepEqual(output, [
        { postId: 'first-0', integration: 'first' },
        { postId: 'second-0', integration: 'second' },
      ]);
      assert.deepEqual(
        writes.map((w) => w.integration),
        ['first', 'second']
      );
      assert.deepEqual(
        started.map((s) => s.workflowId),
        ['post_first-0', 'post_second-0']
      );
      assert.equal(started[0].args[0].taskQueue, 'bluesky');
      assert.equal(started[0].args[0].organizationId, 'org-1');
    });

    it("writes nothing when the second channel uses another organization's media", async () => {
      foreignMedia = ['their-media'];
      const body = request();
      body.posts[1].value[0].image = [{ id: 'their-media' }];

      await assert.rejects(
        service().createPost('org-1', body, 'API'),
        (err: unknown) =>
          err instanceof BadRequestException &&
          err.message === 'Media not found'
      );
      await settle();

      assert.deepEqual(writes, []);
      assert.deepEqual(started, []);
    });

    it('writes nothing when the second channel targets a published post', async () => {
      published = ['already-out'];
      const body = request();
      body.posts[1].value[0] = {
        id: 'already-out',
        content: '<p>second</p>',
        image: [],
      };

      await assert.rejects(
        service().createPost('org-1', body, 'API'),
        (err: unknown) =>
          err instanceof BadRequestException &&
          /already published/.test(err.message)
      );
      await settle();

      assert.deepEqual(writes, []);
      assert.deepEqual(started, []);
    });

    it('still accepts the same request with republish, and writes both', async () => {
      published = ['already-out'];
      const body = request({ republish: true });
      body.posts[1].value[0] = {
        id: 'already-out',
        content: '<p>second</p>',
        image: [],
      };

      await service().createPost('org-1', body, 'API');
      await settle();

      assert.deepEqual(
        writes.map((w) => w.integration),
        ['first', 'second']
      );
      assert.deepEqual(
        started.map((s) => s.workflowId),
        ['post_first-0', 'post_already-out']
      );
    });

    it("writes nothing when the second channel names another organization's post", async () => {
      foreignPosts = ['their-post'];
      const body = request({ type: 'draft' });
      body.posts[1].value[0] = {
        id: 'their-post',
        content: '<p>second</p>',
        image: [],
      };

      await assert.rejects(
        service().createPost('org-1', body, 'API'),
        /Post not found/
      );
      await settle();

      assert.deepEqual(writes, []);
      assert.deepEqual(started, []);
    });

    it("writes nothing when shortening the second channel's links fails", async () => {
      shortenerDown = true;

      await assert.rejects(
        service().createPost('org-1', request({ shortLink: true }), 'API'),
        /shortener unreachable/
      );
      await settle();

      assert.deepEqual(writes, []);
      assert.deepEqual(started, []);
    });

    it('leaves a single channel as it was: one write, one workflow', async () => {
      const body = request();
      body.posts = [body.posts[0]];

      const output = await service().createPost('org-1', body, 'API');
      await settle();

      assert.deepEqual(output, [{ postId: 'first-0', integration: 'first' }]);
      assert.deepEqual(
        writes.map((w) => w.integration),
        ['first']
      );
      assert.deepEqual(
        started.map((s) => s.workflowId),
        ['post_first-0']
      );
    });
  }
);
