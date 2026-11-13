import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostActivity } from './post.activity.ts';
import {
  BadBody,
  RefreshToken,
} from '../../../../libraries/nestjs-libraries/src/integrations/social.abstract.ts';

/**
 * A provider with refreshRepeat (LinkedIn) is refused on its one mutating
 * call when the token expired, so nothing was created: finalizePost refreshes
 * the token and repeats the call itself. Going back to the workflow instead
 * made checkPostStatus find the confirmed attempt and stop with "may have
 * already published" for a post that never existed.
 */
const integration = {
  id: 'i1',
  organizationId: 'org-1',
  providerIdentifier: 'linkedin',
  token: 'old',
  refreshToken: 'r1',
} as any;

const expired = () =>
  new RefreshToken('linkedin', '{}', '{}', 'The access token expired');

const activity = (
  provider: Record<string, unknown>,
  refresh: () => Promise<unknown>,
  calls: unknown[][]
) =>
  new (PostActivity as any)(
    {},
    {},
    { getSocialIntegration: () => provider },
    {},
    {
      refresh: async (row: unknown, cause: string) => {
        calls.push(['refresh', (row as any).token, cause]);
        return refresh();
      },
    },
    {},
    {},
    {}
  );

describe('finalizePost after an expired token', () => {
  it('refreshes and repeats the call once, with the new token', async () => {
    const calls: unknown[][] = [];
    const provider = {
      refreshRepeat: true,
      finalizePost: async (token: string, _pending: unknown, row: any) => {
        calls.push(['finalize', token, row.refreshToken]);
        if (token === 'old') {
          throw expired();
        }
        return { status: 'completed', postId: 'urn:1' };
      },
    };
    const result = await activity(
      provider,
      async () => ({ accessToken: 'new', refreshToken: 'r2' }),
      calls
    ).finalizePost(integration, { attempting: true, confirmed: true });

    assert.deepEqual(result, { status: 'completed', postId: 'urn:1' });
    assert.deepEqual(calls, [
      ['finalize', 'old', 'r1'],
      ['refresh', 'old', 'The access token expired'],
      ['finalize', 'new', 'r2'],
    ]);
  });

  it('hands the refusal to the workflow when the token cannot be refreshed', async () => {
    const calls: unknown[][] = [];
    const provider = {
      refreshRepeat: true,
      finalizePost: async () => {
        throw expired();
      },
    };
    await assert.rejects(
      activity(provider, async () => false, calls).finalizePost(integration, {}),
      RefreshToken
    );
    await assert.rejects(
      activity(
        provider,
        async () => {
          throw new Error('refresh failed');
        },
        []
      ).finalizePost(integration, {}),
      RefreshToken
    );
  });

  it('leaves every other provider and error to the workflow', async () => {
    const calls: unknown[][] = [];
    await assert.rejects(
      activity(
        {
          finalizePost: async () => {
            throw expired();
          },
        },
        async () => ({ accessToken: 'new' }),
        calls
      ).finalizePost(integration, {}),
      RefreshToken
    );
    await assert.rejects(
      activity(
        {
          refreshRepeat: true,
          finalizePost: async () => {
            throw new BadBody('linkedin', '{}', '{}', 'refused');
          },
        },
        async () => ({ accessToken: 'new' }),
        calls
      ).finalizePost(integration, {}),
      BadBody
    );
    assert.deepEqual(calls, []);
  });
});
