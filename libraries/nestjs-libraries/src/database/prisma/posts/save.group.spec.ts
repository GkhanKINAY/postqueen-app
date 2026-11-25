import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostsRepository } from './posts.repository.ts';

// What createOrUpdatePost asks of the post table, recorded: the group comes
// from the request, so every sweep of it has to stay in the organization.
const repositoryRecording = () => {
  const sweeps: any[] = [];
  const post = {
    findFirst: async () => null,
    findUnique: async () => ({ organizationId: 'org-1' }),
    upsert: async ({ where }: any) => ({ id: where.id }),
    updateMany: async ({ where }: any) => {
      sweeps.push(where);
      return { count: 0 };
    },
  };
  const repository = new PostsRepository(
    { model: { post } } as any,
    {} as any,
    {} as any,
    {} as any,
    { model: { tagsPosts: { deleteMany: async () => ({ count: 0 }) } } } as any,
    {} as any
  );
  return { repository, sweeps };
};

const save = (repository: PostsRepository, keepGroup: boolean) =>
  repository.createOrUpdatePost(
    'update',
    'org-1',
    '2026-12-01T10:00:00Z',
    {
      group: 'group-of-org-1',
      integration: { id: 'channel-1' },
      value: [{ id: 'post-1', content: 'Hello', image: [] }],
      settings: {},
    } as any,
    [],
    'WEB' as any,
    undefined,
    keepGroup
  );

describe('saving posts that name a group', () => {
  it("sweeps the group's dropped posts only in the organization, when it keeps the group", async () => {
    const { repository, sweeps } = repositoryRecording();

    await save(repository, true);

    assert.equal(sweeps.length, 1);
    assert.equal(sweeps[0].organizationId, 'org-1');
    assert.equal(sweeps[0].group, 'group-of-org-1');
  });

  it('sweeps the old group only in the organization, when it rotates the group', async () => {
    const { repository, sweeps } = repositoryRecording();

    await save(repository, false);

    assert.equal(sweeps.length, 1);
    assert.equal(sweeps[0].organizationId, 'org-1');
  });
});
