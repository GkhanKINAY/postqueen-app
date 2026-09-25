import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import type { MastraService as Service } from './mastra.service.ts';

// mastra.store builds its PostgresStore at import time and only needs a
// connection string to exist; nothing here ever reaches the database.
let MastraService: typeof Service;
before(async () => {
  process.env.DATABASE_URL ||= 'postgresql://spec:spec@127.0.0.1:1/spec';
  ({ MastraService } = await import('./mastra.service.ts'));
});

type Thread = {
  id: string;
  resourceId: string;
  title: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

/** Just the Memory calls the Chats list uses, over an in-memory table. */
const fakeMemory = (threads: Thread[]) => ({
  deleted: [] as string[],
  async getThreadById({ threadId }: { threadId: string }) {
    return threads.find((t) => t.id === threadId) || null;
  },
  async listThreads({ filter }: { filter: { resourceId: string } }) {
    return { threads: threads.filter((t) => t.resourceId === filter.resourceId) };
  },
  async updateThread({ id, title, metadata }: { id: string; title: string; metadata: Record<string, unknown> }) {
    const thread = threads.find((t) => t.id === id)!;
    Object.assign(thread, { title, metadata });
    return thread;
  },
  async deleteThread(id: string) {
    this.deleted.push(id);
    threads.splice(threads.findIndex((t) => t.id === id), 1);
  },
});

const at = new Date('2026-09-26T10:00:00Z');
const thread = (id: string, resourceId: string, title = id): Thread => ({
  id,
  resourceId,
  title,
  metadata: { pq: { channels: ['c1'] } },
  createdAt: at,
  updatedAt: at,
});

describe('Copilot chats: list, rename, delete, clear', () => {
  let memory: ReturnType<typeof fakeMemory>;
  let service: Service;
  let running: Set<string>;

  beforeEach(() => {
    memory = fakeMemory([
      thread('mine', 'org1', 'Spring launch posts'),
      thread('other', 'org1'),
      thread('composer', 'org1:composer'),
      thread('theirs', 'org2'),
    ]);
    MastraService.mastra = {
      getAgent: () => ({ getMemory: () => memory }),
    } as never;
    service = new MastraService({} as never);
    running = new Set();
    // The live-run store is process wide; the tests only need its answer.
    (service as any).isRunning = async (_org: string, id: string) => running.has(id);
  });

  it('lists only the page chats, with the dates the list groups by', async () => {
    const list = await service.listThreads('org1');
    assert.deepEqual(
      list.map((t) => t.id),
      ['mine', 'other']
    );
    assert.equal(list[0].updatedAt, at);
    assert.equal(list[0].createdAt, at);
  });

  it('renames a page chat, trims the name and keeps its metadata', async () => {
    const renamed = await service.renameThread('org1', 'mine', '  Launch week  ');
    assert.deepEqual(renamed, { id: 'mine', title: 'Launch week' });
    assert.deepEqual((await memory.getThreadById({ threadId: 'mine' }))!.metadata, {
      pq: { channels: ['c1'] },
    });
  });

  it('refuses an empty name', async () => {
    await assert.rejects(service.renameThread('org1', 'mine', '   '));
  });

  it('never reaches a composer chat or another organization', async () => {
    assert.equal(await service.renameThread('org1', 'composer', 'x'), null);
    assert.equal(await service.renameThread('org1', 'theirs', 'x'), null);
    assert.equal(await service.deleteThread('org1', 'composer'), 'missing');
    assert.equal(await service.deleteThread('org1', 'theirs'), 'missing');
    assert.deepEqual(memory.deleted, []);
  });

  it('deletes a page chat, but not while it is still answering', async () => {
    running.add('mine');
    assert.equal(await service.deleteThread('org1', 'mine'), 'running');
    assert.deepEqual(memory.deleted, []);
    running.clear();
    assert.equal(await service.deleteThread('org1', 'mine'), 'deleted');
    assert.deepEqual(memory.deleted, ['mine']);
  });

  it('clears every page chat except the ones answering, and says how many', async () => {
    running.add('other');
    assert.deepEqual(await service.clearThreads('org1'), { deleted: 1, running: 1 });
    assert.deepEqual(memory.deleted, ['mine']);
    assert.ok(await memory.getThreadById({ threadId: 'composer' }));
    assert.ok(await memory.getThreadById({ threadId: 'theirs' }));
  });
});
