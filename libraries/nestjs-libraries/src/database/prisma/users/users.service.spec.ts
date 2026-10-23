import 'reflect-metadata';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import dayjs from 'dayjs';
import { UsersService } from './users.service.ts';

// Only the repository is reached by markOnline; the other collaborators are
// never touched.
let writes: { id: string; staleBefore: Date }[];
const service = () =>
  new UsersService(
    {
      markOnline: async (id: string, staleBefore: Date) => {
        writes.push({ id, staleBefore });
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

describe('UsersService.markOnline', () => {
  beforeEach(() => {
    writes = [];
  });

  it('writes when the last visit is older than five minutes', async () => {
    await service().markOnline({
      id: 'u1',
      lastOnline: dayjs().subtract(6, 'minute').toDate(),
    });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'u1');
    // The write is conditional on the same cutoff, so parallel requests
    // holding the same stale value write once.
    const cutoff = dayjs().subtract(5, 'minute');
    assert.ok(Math.abs(dayjs(writes[0].staleBefore).diff(cutoff)) < 1000);
  });

  it('does not write again within five minutes', async () => {
    await service().markOnline({
      id: 'u1',
      lastOnline: dayjs().subtract(4, 'minute').toDate(),
    });
    assert.equal(writes.length, 0);
  });

  it('writes for an account that never had a visit recorded', async () => {
    // Every row held its signup time until this writer existed.
    await service().markOnline({
      id: 'u1',
      lastOnline: dayjs().subtract(40, 'day').toDate(),
    });
    assert.equal(writes.length, 1);
  });
});
