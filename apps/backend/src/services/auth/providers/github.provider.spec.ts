import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GithubProvider } from './github.provider.ts';

/**
 * GitHub's /user/emails lists every address on the account, unverified ones
 * included, and does not promise an order. Sign-in takes the verified primary
 * address, and is refused when there is none rather than trusting another.
 */

const realFetch = globalThis.fetch;

const answer = (emails: unknown) => {
  globalThis.fetch = (async (url: string) =>
    new Response(
      JSON.stringify(
        String(url) === 'https://api.github.com/user/emails'
          ? emails
          : { id: 42, login: 'ada' }
      ),
      { status: 200 }
    )) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GithubProvider.getUser', () => {
  it('takes the verified primary address when it is not listed first', async () => {
    answer([
      { email: 'old@example.com', primary: false, verified: false },
      { email: '42+ada@users.noreply.github.com', primary: false, verified: true },
      { email: 'ada@example.com', primary: true, verified: true },
    ]);

    assert.deepEqual(await new GithubProvider().getUser('token'), {
      email: 'ada@example.com',
      id: '42',
    });
  });

  it('refuses an unverified primary address', async () => {
    answer([
      { email: 'ada@example.com', primary: true, verified: false },
      { email: 'old@example.com', primary: false, verified: true },
    ]);

    await assert.rejects(
      () => new GithubProvider().getUser('token'),
      /no verified primary email/
    );
  });

  it('refuses when no address is both primary and verified', async () => {
    for (const emails of [
      [{ email: 'old@example.com', primary: false, verified: true }],
      [],
    ]) {
      answer(emails);

      await assert.rejects(
        () => new GithubProvider().getUser('token'),
        /no verified primary email/
      );
    }
  });
});
