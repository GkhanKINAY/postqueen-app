import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeletePostTool } from './delete.post.tool.ts';

// The organization comes from the request context, the way the MCP server
// and the app's Copilot set it
const context = () => {
  const values = new Map<string, string>([
    ['organization', JSON.stringify({ id: 'org-1' })],
  ]);
  return {
    requestContext: {
      get: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
    },
  };
};

const tool = (
  posts: { id: string; group: string; parentPostId: string | null }[]
) => {
  const deleted: string[] = [];
  const looked: unknown[][] = [];
  const instance = new DeletePostTool({
    getPostsRecursively: async (...args: unknown[]) => {
      looked.push(args);
      return posts;
    },
    deletePost: async (orgId: string, group: string) => {
      deleted.push(`${orgId} ${group}`);
      return { id: posts[0]?.id };
    },
  } as any);
  return { run: instance.run() as any, deleted, looked };
};

describe('deletePostTool', () => {
  it('deletes the group of the post it was given, in the caller organization', async () => {
    const { run, deleted, looked } = tool([
      { id: 'post-1', group: 'group-1', parentPostId: null },
    ]);
    assert.deepEqual(await run.execute({ id: 'post-1' }, context()), {
      output: { postId: 'post-1' },
    });
    assert.deepEqual(looked, [['post-1', false, 'org-1', true]]);
    assert.deepEqual(deleted, ['org-1 group-1']);
  });

  it('deletes nothing for an unknown id', async () => {
    const { run, deleted } = tool([]);
    assert.deepEqual(await run.execute({ id: 'nope' }, context()), {
      output: { errors: 'Post not found' },
    });
    assert.deepEqual(deleted, []);
  });

  // A comment shares its group with the whole thread, so deleting by it
  // would take the post and every other comment with it
  it('refuses the id of a comment', async () => {
    const { run, deleted } = tool([
      { id: 'comment-1', group: 'group-1', parentPostId: 'post-1' },
    ]);
    const result = await run.execute({ id: 'comment-1' }, context());
    assert.match(result.output.errors, /belongs to a comment/);
    assert.deepEqual(deleted, []);
  });

  it('is marked destructive and says a published post stays on the network', () => {
    const { run } = tool([]);
    assert.equal(run.mcp.annotations.destructiveHint, true);
    assert.equal(run.mcp.annotations.readOnlyHint, false);
    assert.match(run.description, /only removes it from PostQueen: it stays live on the social network/);
    assert.doesNotMatch(run.description, /Postiz/i);
  });
});
