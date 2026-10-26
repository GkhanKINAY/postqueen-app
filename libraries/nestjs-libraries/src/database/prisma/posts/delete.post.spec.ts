import 'reflect-metadata';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { before, describe, it } from 'node:test';

// Same loader hook as create.post.spec.ts: tsx follows the tsconfig mapping of
// `file-type` to its declarations, so point it at the package's entry.
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

// Only what deletePost touches: the repository's soft delete, and the two
// steps that follow it for a post that was found.
const service = (found: { id: string } | null) => {
  const calls: string[] = [];
  const instance = Object.create(PostsService.prototype);
  instance._postRepository = {
    deletePost: async (orgId: string, group: string) => {
      calls.push(`delete ${orgId} ${group}`);
      return found;
    },
  };
  instance.terminatePostWorkflows = async (id: string) => {
    calls.push(`terminate ${id}`);
  };
  instance.syncAfterSave = async (orgId: string, id: string) => {
    calls.push(`sync ${orgId} ${id}`);
  };
  return { instance, calls };
};

describe('PostsService.deletePost', { skip: !canLoadService }, () => {
  // It answered { error: true } on success too, so the public API's two
  // delete routes reported an error for every post they deleted
  it('answers with the id of the deleted post', async () => {
    const { instance, calls } = service({ id: 'post-1' });
    assert.deepEqual(await instance.deletePost('org-1', 'group-1'), {
      id: 'post-1',
    });
    assert.deepEqual(calls, [
      'delete org-1 group-1',
      'terminate post-1',
      'sync org-1 post-1',
    ]);
  });

  it('answers with an error for a group with no post of the organization', async () => {
    const { instance, calls } = service(null);
    assert.deepEqual(await instance.deletePost('org-1', 'other'), {
      error: true,
    });
    assert.deepEqual(calls, ['delete org-1 other']);
  });
});
