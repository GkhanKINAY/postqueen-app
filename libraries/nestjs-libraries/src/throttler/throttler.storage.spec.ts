import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import Redis from 'ioredis';
import {
  MemoryThrottlerStorage,
  RedisThrottlerStorage,
} from './throttler.storage.ts';

const HOUR = 3600000;

describe('MemoryThrottlerStorage', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'] }));
  afterEach(() => mock.timers.reset());

  const hit = (storage: MemoryThrottlerStorage, limit = 3) =>
    storage.increment('org_posts', HOUR, limit, HOUR, 'default');

  it('counts a fixed window and blocks past the limit', async () => {
    const storage = new MemoryThrottlerStorage();
    for (const expected of [1, 2, 3]) {
      const record = await hit(storage);
      assert.equal(record.totalHits, expected);
      assert.equal(record.isBlocked, false);
      assert.equal(record.timeToExpire, 3600);
    }

    const over = await hit(storage);
    assert.equal(over.isBlocked, true);
    assert.equal(over.timeToBlockExpire, 3600);

    // The window starts again an hour after its first hit.
    mock.timers.tick(HOUR);
    assert.deepEqual(await hit(storage), {
      totalHits: 1,
      timeToExpire: 3600,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('keeps the allowance of a hit that was given back', async () => {
    const storage = new MemoryThrottlerStorage();
    await hit(storage);
    await hit(storage);
    await storage.decrement('org_posts', 'default');

    assert.equal((await hit(storage)).totalHits, 2);
    assert.equal((await hit(storage)).isBlocked, false);
    assert.equal((await hit(storage)).isBlocked, true);
  });

  it('never goes below zero', async () => {
    const storage = new MemoryThrottlerStorage();
    await storage.decrement('org_posts', 'default');
    await hit(storage);
    for (let i = 0; i < 3; i++) {
      await storage.decrement('org_posts', 'default');
    }

    assert.equal((await hit(storage)).totalHits, 1);
  });

  it('gives nothing back once the window has ended', async () => {
    const storage = new MemoryThrottlerStorage();
    await hit(storage);
    mock.timers.tick(HOUR);
    await storage.decrement('org_posts', 'default');

    assert.equal((await hit(storage)).totalHits, 1);
  });

  it('keeps keys and throttlers apart', async () => {
    const storage = new MemoryThrottlerStorage();
    await hit(storage);
    await storage.decrement('org_uploads', 'default');
    await storage.decrement('org_posts', 'other');

    assert.equal((await hit(storage)).totalHits, 2);
  });
});

describe('RedisThrottlerStorage', () => {
  it('gives back the counter @nest-lab/throttler-storage-redis increments', async () => {
    // A Redis that only records which key each script was run against.
    const keys: string[] = [];
    const redis = Object.assign(Object.create(Redis.prototype), {
      call: async (_eval: string, _script: string, _n: number, key: string) => {
        keys.push(key);
        return [1, HOUR, 0, 0];
      },
    });
    const storage = new RedisThrottlerStorage(redis);

    await storage.increment('org_posts', HOUR, 30, HOUR, 'default');
    await storage.decrement('org_posts', 'default');

    assert.equal(keys.length, 2);
    assert.equal(keys[1], keys[0]);
  });
});
