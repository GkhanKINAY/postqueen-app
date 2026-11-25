import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SubscriptionExceptionFilter } from './subscription.exception.ts';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from './permission.exception.class.ts';

// The body the filter answers a refused request with.
const reply = (request: Record<string, unknown>, section: Sections) => {
  let body: any;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({
        status: () => ({
          json: (sent: unknown) => {
            body = sent;
          },
        }),
      }),
    }),
  };
  new SubscriptionExceptionFilter().catch(
    new SubscriptionException({ section, action: AuthorizationActions.Create }),
    host as any
  );
  return body;
};
// A web session carries the user and the member's own role.
const session = (role: string) => ({
  user: { id: 'user1' },
  org: { id: 'org1', users: [{ role }] },
});
const UPGRADE =
  'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.';

describe('a refused request', () => {
  it('tells a plain member to ask an admin, since Billing is not theirs', () => {
    const body = reply(session('USER'), Sections.POSTS_PER_MONTH);
    assert.equal(body.canManageBillingUi, false);
    assert.equal(body.message, `${UPGRADE} Please ask an admin of this workspace.`);
  });

  it('sends an admin to Billing as before', () => {
    for (const role of ['ADMIN', 'SUPERADMIN']) {
      const body = reply(session(role), Sections.POSTS_PER_MONTH);
      assert.equal(body.canManageBillingUi, true, role);
      assert.equal(body.message, UPGRADE, role);
    }
  });

  it('does not repeat the admin policy, which already says who can act', () => {
    const body = reply(session('USER'), Sections.ADMIN);
    assert.equal(body.canManageBillingUi, false);
    assert.equal(
      body.message,
      'Only a workspace admin can do this. Please ask an admin of this workspace.'
    );
  });

  it('adds nothing for an API key or an OAuth app', () => {
    const body = reply(
      { org: { id: 'org1', users: [{ role: 'SUPERADMIN' }] } },
      Sections.POSTS_PER_MONTH
    );
    assert.equal('canManageBillingUi' in body, false);
    assert.equal(body.message, UPGRADE);
  });
});
