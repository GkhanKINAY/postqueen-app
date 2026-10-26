import 'reflect-metadata';
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

process.env.JWT_SECRET ||= 'invite-token-spec-secret';

let AuthService: any;
let AuthChecker: any;
before(async () => {
  ({ AuthService } = await import('./auth.service.ts'));
  ({ AuthService: AuthChecker } = await import(
    '@gitroom/helpers/auth/auth.service'
  ));
});

// getOrgFromCookie reads nothing but the token, so it runs on a bare object.
const read = (value: object) =>
  AuthService.prototype.getOrgFromCookie.call({}, AuthChecker.signJWT(value));

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

describe('team invite token', () => {
  it('accepts what inviteTeamMember signs', () => {
    const invite = {
      email: 'a@example.com',
      role: 'ADMIN',
      orgId: 'org-1',
      timeLimit: tomorrow(),
      id: 'abcde',
    };
    const { iat, ...claims } = read(invite);
    assert.equal(typeof iat, 'number');
    assert.deepEqual(claims, invite);
  });

  it('refuses a role a member cannot be given', () => {
    assert.equal(
      read({ role: 'SUPERADMIN', orgId: 'org-1', timeLimit: tomorrow(), id: 'abcde' }),
      false
    );
  });

  it('refuses ids that are not strings', () => {
    assert.equal(
      read({ role: 'USER', orgId: { not: '' }, timeLimit: tomorrow(), id: 'abcde' }),
      false
    );
    assert.equal(
      read({ role: 'USER', orgId: 'org-1', timeLimit: tomorrow(), id: 1 }),
      false
    );
  });

  it('refuses an expired invite and one with no time limit', () => {
    assert.equal(
      read({ role: 'USER', orgId: 'org-1', timeLimit: '2020-01-01', id: 'abcde' }),
      false
    );
    assert.equal(read({ role: 'USER', orgId: 'org-1', id: 'abcde' }), false);
  });
});
