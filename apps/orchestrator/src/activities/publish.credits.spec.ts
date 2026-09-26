import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { PostActivity } from './post.activity.ts';
import { insufficientCredits } from '../../../../libraries/nestjs-libraries/src/database/prisma/credits/credits.repository.ts';
import { BadBody } from '../../../../libraries/nestjs-libraries/src/integrations/social.abstract.ts';

/**
 * The publish activities keep their signatures; the credits an X post set
 * aside when it was scheduled are paid, settled and handed back inside them.
 */
let calls: unknown[][];
let short: boolean;

const activity = () =>
  new (PostActivity as any)(
    {
      getPostsRecursively: async () => [
        { id: 'p1', organizationId: 'org-1', state: 'QUEUE' },
      ],
      changeState: async (id: string, state: string) =>
        calls.push(['changeState', id, state]),
      releasePublish: async (id: string, thread?: { id: string }[]) =>
        calls.push(['release', id, thread?.map((p) => p.id)]),
      updatePost: async (id: string) => calls.push(['updatePost', id]),
      settlePublish: async (id: string, releaseId: string) =>
        calls.push(['settle', id, releaseId]),
      payForPublish: async (provider: string, post: { id: string }) => {
        calls.push(['pay', provider, post.id]);
        if (short) {
          throw insufficientCredits(500, 20);
        }
      },
      updateTags: async (_org: string, posts: unknown[]) => posts,
      updateMedia: async () => [],
      shouldSkipPublishNotice: () => true,
    },
    { inAppNotification: async () => undefined },
    {
      getSocialIntegration: () => ({
        editor: 'html',
        comment: async () => {
          calls.push(['comment']);
          return [];
        },
      }),
      getSocialIntegrationName: () => 'X',
    },
    {},
    {},
    {},
    {},
    { getSubscription: async () => ({}) }
  );

const thread = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
const refused = { cause: { type: 'bad_body', message: 'Duplicate content' } };

beforeEach(() => {
  calls = [];
  short = false;
});

describe('Publish credits in the post activities', () => {
  it('hands back an item the network refused, with the rest of its thread', async () => {
    await activity().changeState('p2', 'ERROR', refused, thread);
    assert.deepEqual(calls, [
      ['changeState', 'p2', 'ERROR'],
      ['release', 'p2', ['p1', 'p2', 'p3']],
    ]);
  });

  it('hands back a post that failed before reaching the network', async () => {
    for (const reason of [
      'Refresh channel needed',
      'Channel disabled',
      'Channel setup not finished',
      'This channel cannot post comments',
    ]) {
      calls = [];
      await activity().changeState('p1', 'ERROR', reason, thread);
      assert.deepEqual(calls.at(-1), ['release', 'p1', ['p1', 'p2', 'p3']]);
    }
  });

  it('hands back all of a post that failed before its thread was read', async () => {
    await activity().changeState('p1', 'ERROR', 'No Post');
    assert.deepEqual(calls.at(-1), ['release', 'p1', undefined]);
  });

  it('hands back the parts a channel cannot post as comments', async () => {
    // the workflow passes only the root it will publish
    await activity().changeState(
      'p2',
      'ERROR',
      'This channel cannot post comments',
      [{ id: 'p1' }]
    );
    assert.deepEqual(calls.at(-1), ['release', 'p2', ['p1']]);
  });

  it('keeps the credits of an outcome nobody knows', async () => {
    for (const reason of [
      'A previous publish attempt was interrupted',
      'Could not confirm the post status',
      'Could not publish after several attempts',
    ]) {
      calls = [];
      await activity().changeState('p1', 'ERROR', reason, thread);
      assert.ok(
        !calls.some(([what]) => what === 'release'),
        `${reason} released credits`
      );
    }
  });

  it('settles what an item used once it is live', async () => {
    await activity().updatePost('p1', 'x-100', 'https://x.com/a/status/x-100');
    assert.deepEqual(calls, [
      ['updatePost', 'p1'],
      ['settle', 'p1', 'x-100'],
    ]);
  });

  it('pays before a reply goes out, and fails it as refused when the balance is short', async () => {
    const integration = {
      organizationId: 'org-1',
      providerIdentifier: 'x',
      internalId: '42',
      token: 't',
    };
    await activity().postComment('x-1', undefined, integration, [
      { id: 'p2', content: '<p>reply</p>', settings: '{}', image: '[]' },
    ]);
    assert.deepEqual(calls, [['pay', 'x', 'p2'], ['comment']]);

    calls = [];
    short = true;
    await assert.rejects(
      activity().postComment('x-1', undefined, integration, [
        { id: 'p2', content: '<p>reply</p>', settings: '{}', image: '[]' },
      ]),
      (err) => {
        assert.ok(err instanceof BadBody);
        assert.match(
          (err as BadBody).message,
          /Not enough credits: this costs 5 and the balance is 0\.2\. Add credits in Billing/
        );
        return true;
      }
    );
    assert.deepEqual(calls, [['pay', 'x', 'p2']]);
  });
});
