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

// Reading a post's numbers can refresh its channel's token, and that write
// brought a removed channel back, or emailed its person to reconnect it.
const service = (post: any, calls: string[]) =>
  new PostsService(
    { getPostById: async () => post },
    {
      getSocialIntegration: () => {
        calls.push('provider');
        return { postAnalytics: async () => [], missing: async () => [] };
      },
    },
    {},
    {},
    {},
    {},
    {},
    {
      isExpired: () => true,
      refresh: async () => {
        calls.push('refresh');
        return false;
      },
    },
    {},
    {},
    {}
  );

const post = (extra: Record<string, unknown> = {}) => ({
  id: 'post-1',
  releaseId: 'VIDEO1',
  deletedAt: null,
  integration: { id: 'ch-1', providerIdentifier: 'youtube', deletedAt: null },
  ...extra,
});

describe('Post analytics on removed channels', { skip: !canLoadService }, () => {
  it('reads a live post as before', async () => {
    const calls: string[] = [];
    await service(post(), calls).checkPostAnalytics('org-1', 'post-1', 7);
    assert.deepEqual(calls, ['provider', 'refresh']);
  });

  it('never touches the channel of a deleted post or a removed channel', async () => {
    for (const gone of [
      post({ deletedAt: new Date() }),
      post({
        integration: {
          id: 'ch-1',
          providerIdentifier: 'youtube',
          deletedAt: new Date(),
        },
      }),
    ]) {
      const calls: string[] = [];
      assert.deepEqual(
        await service(gone, calls).checkPostAnalytics('org-1', 'post-1', 7),
        []
      );
      assert.deepEqual(
        await service({ ...gone, releaseId: 'missing' }, calls).getMissingContent(
          'org-1',
          'post-1'
        ),
        []
      );
      assert.deepEqual(calls, []);
    }
  });
});
