import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canChangeRole,
  canLeaveWorkspace,
  canMutateMember,
  canTransferOwnership,
  isLastSuperAdmin,
  roleLevel,
} from './team-roles.ts';

describe('roleLevel', () => {
  it('orders USER < ADMIN < SUPERADMIN', () => {
    assert.equal(roleLevel('USER'), 0);
    assert.equal(roleLevel('ADMIN'), 1);
    assert.equal(roleLevel('SUPERADMIN'), 2);
  });
});

describe('canMutateMember', () => {
  it('lets SUPERADMIN change USER and ADMIN, not a peer SUPERADMIN', () => {
    assert.equal(canMutateMember('SUPERADMIN', 'USER'), true);
    assert.equal(canMutateMember('SUPERADMIN', 'ADMIN'), true);
    assert.equal(canMutateMember('SUPERADMIN', 'SUPERADMIN'), false);
  });

  it('forbids ADMIN from acting on ADMIN (equal level)', () => {
    assert.equal(canMutateMember('ADMIN', 'USER'), true);
    assert.equal(canMutateMember('ADMIN', 'ADMIN'), false);
    assert.equal(canMutateMember('ADMIN', 'SUPERADMIN'), false);
  });
});

describe('canChangeRole', () => {
  it('lets SUPERADMIN switch USER and ADMIN, never promote to SUPERADMIN', () => {
    assert.equal(
      canChangeRole({ myRole: 'SUPERADMIN', targetRole: 'USER', nextRole: 'ADMIN' }),
      true
    );
    assert.equal(
      canChangeRole({ myRole: 'SUPERADMIN', targetRole: 'ADMIN', nextRole: 'USER' }),
      true
    );
    assert.equal(
      canChangeRole({
        myRole: 'SUPERADMIN',
        targetRole: 'USER',
        nextRole: 'SUPERADMIN',
      }),
      false
    );
  });

  it('forbids ADMIN from promoting another ADMIN', () => {
    assert.equal(
      canChangeRole({ myRole: 'ADMIN', targetRole: 'ADMIN', nextRole: 'ADMIN' }),
      false
    );
    assert.equal(
      canChangeRole({ myRole: 'ADMIN', targetRole: 'USER', nextRole: 'ADMIN' }),
      true
    );
  });
});

describe('isLastSuperAdmin / leave / transfer', () => {
  it('refuses dropping the last SUPERADMIN', () => {
    assert.equal(isLastSuperAdmin(1, 'SUPERADMIN'), true);
    assert.equal(isLastSuperAdmin(2, 'SUPERADMIN'), false);
    assert.equal(canLeaveWorkspace({ myRole: 'SUPERADMIN', superAdminCount: 1 }), false);
    assert.equal(canLeaveWorkspace({ myRole: 'ADMIN', superAdminCount: 1 }), true);
  });

  it('transfers only SUPERADMIN → ADMIN with confirm', () => {
    assert.equal(
      canTransferOwnership({ myRole: 'SUPERADMIN', targetRole: 'ADMIN', confirm: true }),
      true
    );
    assert.equal(
      canTransferOwnership({ myRole: 'SUPERADMIN', targetRole: 'ADMIN', confirm: false }),
      false
    );
    assert.equal(
      canTransferOwnership({ myRole: 'SUPERADMIN', targetRole: 'USER', confirm: true }),
      false
    );
    assert.equal(
      canTransferOwnership({ myRole: 'ADMIN', targetRole: 'ADMIN', confirm: true }),
      false
    );
  });
});

describe('leaveWorkspace', () => {
  const service = readFileSync(
    fileURLToPath(new URL('./organization.service.ts', import.meta.url)),
    'utf8'
  );
  const leave = service.slice(
    service.indexOf('async leaveWorkspace('),
    service.indexOf('async updateOrganizationName(')
  );

  // The auth middleware needs one workspace to sign a request into, so an
  // account left with none is refused everywhere.
  it('refuses to leave the only workspace', () => {
    assert.match(leave, /getOrgsByUserId\(userId\)/);
    assert.match(leave, /f\.id !== org\.id && !f\.users\[0\]\?\.disabled/);
    assert.match(leave, /You cannot leave your only workspace/);
    assert.ok(
      leave.indexOf('only workspace') < leave.indexOf('deleteTeamMember('),
      'the check comes before the membership is removed'
    );
  });
});
