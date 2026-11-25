import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { before, describe, it } from 'node:test';

// Loaded the way separate.posts.spec.ts loads it: tsconfig maps `file-type` to
// its type declarations and tsx follows that at run time.
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
  // The service builds its storage when it is made; nothing is stored here.
  process.env.UPLOAD_DIRECTORY ||= tmpdir();
  if (canLoadService) {
    ({ PostsService } = await import('./posts.service.ts'));
  }
});

const integration = { providerIdentifier: 'instagram-standalone', name: 'Bakery' };
const row = (state: string, error: string | null) => ({
  id: `${state}-${error}`,
  state,
  error,
  integration,
});

const service = (rows: any[]) =>
  new PostsService(
    {
      getPostsByGroup: async () => rows,
      getPosts: async () => rows,
      getPostsList: async () => ({
        posts: rows,
        total: rows.length,
        page: 1,
        limit: 20,
        hasMore: false,
      }),
    },
    { getSocialIntegrationName: () => 'Instagram' },
    {},
    { getMediaByIds: async () => [] },
    {},
    {},
    {},
    {},
    {},
    {},
    {}
  );

const unconfirmed =
  "Your post was sent to Instagram, but we couldn't confirm it was published. Please check your Bakery account before posting again to avoid duplicates.";

describe('A failed post as the lists read it', { skip: !canLoadService }, () => {
  it('reads an unconfirmed post as the notice its person was sent', async () => {
    for (const stored of [
      'Could not confirm the post status',
      'Could not publish after several attempts',
      'A previous publish attempt was interrupted',
    ]) {
      const [post] = await service([row('ERROR', stored)]).getPosts('org', {});
      assert.equal(post.error, unconfirmed);
      const list = await service([row('ERROR', stored)]).getPostsList('org', {});
      // the list goes out minified: `p` is its posts
      assert.equal(list.p[0].error, unconfirmed);
    }
  });

  it('leaves every other error as it was stored', async () => {
    const [post] = await service([
      row('ERROR', 'Refresh channel needed'),
    ]).getPosts('org', {});
    assert.equal(post.error, 'Refresh channel needed');
  });

  it('keeps an error only while the post is failed', async () => {
    const rows = ['PUBLISHED', 'QUEUE', 'DRAFT'].map((state) =>
      row(state, 'The network refused the post.')
    );
    for (const post of await service(rows).getPosts('org', {})) {
      assert.equal(post.error, null);
    }
    const list = await service(rows).getPostsList('org', {});
    for (const post of list.p) {
      assert.ok(!post.error);
    }
  });

  it('reads the same in the composer, comments included', async () => {
    const thread = (state: string, error: string | null) => [
      {
        id: 'p1',
        group: 'g1',
        batchId: null,
        parentPostId: null,
        integrationId: 'i1',
        state,
        error,
        image: '[]',
        settings: '{}',
        integration: { ...integration, customName: null },
      },
      {
        id: 'p2',
        group: 'g1',
        batchId: null,
        parentPostId: 'p1',
        integrationId: 'i1',
        state,
        error,
        image: '[]',
        settings: '{}',
      },
    ];

    const failed = await service(
      thread('ERROR', 'Could not confirm the post status')
    ).getPostsByGroup('org', 'g1');
    assert.equal(failed.posts[0].error, unconfirmed);
    assert.equal(
      failed.posts[1].error,
      unconfirmed.replace('Your post', 'Your comment')
    );

    const retried = await service(
      thread('PUBLISHED', 'The network refused the post.')
    ).getPostsByGroup('org', 'g1');
    assert.equal(retried.posts[0].error, null);
    assert.equal(retried.posts[1].error, null);
  });
});
