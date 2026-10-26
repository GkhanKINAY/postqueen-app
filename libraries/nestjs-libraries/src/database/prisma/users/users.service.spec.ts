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

type Role = 'SUPERADMIN' | 'ADMIN' | 'USER';
type Org = {
  id: string;
  subscription: object | null;
  members: { id: string; role: Role }[];
};

// The account being deleted is `me`. Each organization lists its members,
// disabled ones included, the way getAllUsersOrgs reads them.
let orgs: Org[];
let calls: string[];

const memberOf = (org: Org) => org.members.find((m) => m.id === 'me')!;
const organizationRepository = {
  getOrgsByUserId: async () =>
    orgs
      .filter((org) => org.members.some((m) => m.id === 'me'))
      .map((org) => ({
        id: org.id,
        subscription: org.subscription,
        users: [{ role: memberOf(org).role, disabled: false }],
      })),
  getAllUsersOrgs: async (id: string) => ({
    users: orgs
      .find((org) => org.id === id)!
      .members.map((m) => ({ role: m.role, user: { id: m.id } })),
  }),
  deleteTeamMember: async (org: string, user: string) => {
    calls.push(`remove ${user} from ${org}`);
  },
  deleteOrganization: async (org: string) => {
    calls.push(`delete ${org}`);
  },
};

const deletingService = () =>
  new UsersService(
    {
      getUserById: async () => null,
      deleteAccount: async () => {
        calls.push('delete me');
      },
    } as any,
    organizationRepository as any,
    {
      deleteIntegrationsForAccount: async (org: string) => {
        calls.push(`channels of ${org}`);
      },
    } as any,
    {} as any,
    {
      changeActiveCron: async (org: string) => {
        calls.push(`autoposts of ${org}`);
      },
      revokeAccessForAccount: async (org: string) => {
        calls.push(`revoke ${org}`);
      },
    } as any
  );

describe('deleting an account', () => {
  beforeEach(() => {
    calls = [];
    orgs = [];
  });

  it('no longer refuses an owner whose organization has members', async () => {
    orgs = [
      {
        id: 'own',
        subscription: { subscriptionTier: 'PRO' },
        members: [
          { id: 'me', role: 'SUPERADMIN' },
          { id: 'teammate', role: 'USER' },
        ],
      },
    ];

    assert.deepEqual(await deletingService().getDeleteAccountInfo('me'), {
      hasSubscription: true,
      hasAdditionalMembers: true,
    });
    await deletingService().deleteAccount('me');
    assert.deepEqual(calls, [
      'remove teammate from own',
      'autoposts of own',
      'revoke own',
      'channels of own',
      'delete own',
      'delete me',
    ]);
  });

  it('leaves an organization that has another owner, and only leaves it', async () => {
    orgs = [
      {
        id: 'shared',
        subscription: { subscriptionTier: 'PRO' },
        members: [
          { id: 'me', role: 'SUPERADMIN' },
          { id: 'cofounder', role: 'SUPERADMIN' },
          { id: 'teammate', role: 'USER' },
        ],
      },
    ];

    assert.deepEqual(await deletingService().getOrgsToDeleteForAccount('me'), []);
    assert.deepEqual(await deletingService().getDeleteAccountInfo('me'), {
      hasSubscription: false,
      hasAdditionalMembers: false,
    });
    await deletingService().deleteAccount('me');
    assert.deepEqual(calls, ['remove me from shared', 'delete me']);
  });

  it('only leaves an organization where the account is a member', async () => {
    orgs = [
      {
        id: 'theirs',
        subscription: { subscriptionTier: 'PRO' },
        members: [
          { id: 'owner', role: 'SUPERADMIN' },
          { id: 'me', role: 'ADMIN' },
        ],
      },
      {
        id: 'own',
        subscription: null,
        members: [{ id: 'me', role: 'SUPERADMIN' }],
      },
    ];

    assert.deepEqual(await deletingService().getDeleteAccountInfo('me'), {
      hasSubscription: false,
      hasAdditionalMembers: false,
    });
    await deletingService().deleteAccount('me');
    assert.deepEqual(calls, [
      'remove me from theirs',
      'autoposts of own',
      'revoke own',
      'channels of own',
      'delete own',
      'delete me',
    ]);
  });
});
