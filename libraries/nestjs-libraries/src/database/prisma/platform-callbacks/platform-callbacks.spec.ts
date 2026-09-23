import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { HttpException } from '@nestjs/common';
import { PlatformCallbacksService } from './platform-callbacks.service.ts';
import { parseMetaSignedRequest } from '../../../integrations/social/meta.signed.request.ts';

// The service with every collaborator faked: none of them is loaded, so the
// spec never reaches the storage providers the real services construct.
const secret = 'spec-app-secret';
const userId = '218471';
const sign = (payload: object, key = secret) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', key).update(encoded).digest('base64url');
  return `${signature}.${encoded}`;
};
const signed = sign({
  algorithm: 'HMAC-SHA256',
  issued_at: 1291836800,
  user_id: userId,
});

let calls: unknown[][];
let stored: Record<string, unknown>[];
let channels: Record<string, unknown>[];
let failOn: string | undefined;

const service = () =>
  new PlatformCallbacksService(
    {
      createDeletionRequest: async (data: Record<string, unknown>) => {
        stored.push(data);
        return { id: 'request-1', ...data };
      },
      completeDeletionRequest: async (id: string) =>
        calls.push(['complete', id]),
      getDeletionRequest: async () => null,
    } as any,
    {
      getSocialIntegration: (identifier: string) =>
        identifier === 'app'
          ? {
              verifyPlatformCallback: async (request: string) =>
                parseMetaSignedRequest(request, secret),
            }
          : identifier === 'no-callbacks'
          ? {}
          : undefined,
      getPlatformCallbackProviders: async () => ['app', 'app-sibling'],
    } as any,
    {
      getIntegrationsByPlatformUser: async (providers: string[], id: string) => {
        calls.push(['find', providers, id]);
        return channels;
      },
      getPostsForChannel: async (org: string, id: string) => [
        { group: `group-${id}` },
      ],
      deleteChannel: async (org: string, id: string) =>
        calls.push(['deleteChannel', org, id]),
      eraseChannelData: async (org: string, id: string) => {
        if (id === failOn) {
          throw new Error('database went away');
        }
        calls.push(['erase', org, id]);
      },
      disconnectChannel: async (org: string, integration: { id: string }) =>
        calls.push(['disconnect', org, integration.id]),
    } as any,
    {
      deletePostsByGroups: async (org: string, groups: string[]) =>
        calls.push(['deletePosts', org, groups]),
    } as any
  );

const rejectsWith = (status: number) => (err: unknown) =>
  err instanceof HttpException && err.getStatus() === status;

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://app.example.test';
  calls = [];
  stored = [];
  failOn = undefined;
  channels = [
    { id: 'live', organizationId: 'org-1', deletedAt: null },
    { id: 'removed', organizationId: 'org-2', deletedAt: new Date() },
  ];
});

describe('platform data deletion', () => {
  it('answers with the status url and confirmation code, and nothing else', async () => {
    const answer = await service().deletion('app', signed);

    assert.deepEqual(Object.keys(answer).sort(), ['confirmation_code', 'url']);
    assert.match(answer.confirmation_code, /^[A-Za-z0-9]{16}$/);
    assert.equal(
      answer.url,
      `https://app.example.test/data-deletion/${answer.confirmation_code}`
    );
    assert.equal(stored[0].confirmationCode, answer.confirmation_code);
  });

  it('keeps a hash of the user id, never the id', async () => {
    await service().deletion('app', signed);

    assert.equal(
      stored[0].platformUserHash,
      createHash('sha256').update(userId).digest('hex')
    );
    assert.equal(JSON.stringify(stored).includes(userId), false);
  });

  it('removes live channels the way the app does and erases every match', async () => {
    await service().deletion('app', signed);

    assert.deepEqual(calls, [
      ['find', ['app', 'app-sibling'], userId],
      ['deletePosts', 'org-1', ['group-live']],
      ['deleteChannel', 'org-1', 'live'],
      ['erase', 'org-1', 'live'],
      ['erase', 'org-2', 'removed'],
      ['complete', 'request-1'],
    ]);
    assert.equal(stored[0].channels, 2);
  });

  it('carries on past a channel that fails and leaves the request in progress', async () => {
    failOn = 'live';
    const answer = await service().deletion('app', signed);

    assert.match(answer.confirmation_code, /^[A-Za-z0-9]{16}$/);
    assert.deepEqual(calls.slice(-1), [['erase', 'org-2', 'removed']]);
    assert.equal(calls.some(([name]) => name === 'complete'), false);
  });

  it('turns a request the app did not sign away with 400, touching nothing', async () => {
    await assert.rejects(
      service().deletion('app', sign({ algorithm: 'HMAC-SHA256', user_id: userId }, 'other')),
      rejectsWith(400)
    );
    assert.deepEqual(calls, []);
    assert.deepEqual(stored, []);
  });

  it('answers 404 for a provider without platform callbacks', async () => {
    await assert.rejects(service().deletion('no-callbacks', signed), rejectsWith(404));
    await assert.rejects(service().deletion('unknown', signed), rejectsWith(404));
  });

  it('answers 404 for an unknown confirmation code', async () => {
    await assert.rejects(service().deletionStatus('nope'), rejectsWith(404));
  });
});

describe('platform deauthorize', () => {
  it('flags the live channels for reconnection once', async () => {
    channels.push(
      {
        id: 'flagged',
        organizationId: 'org-3',
        deletedAt: null,
        refreshNeeded: true,
      },
      {
        id: 'page-not-picked',
        organizationId: 'org-4',
        deletedAt: null,
        inBetweenSteps: true,
      }
    );

    assert.deepEqual(await service().deauthorize('app', signed), {
      success: true,
    });
    assert.deepEqual(calls, [
      ['find', ['app', 'app-sibling'], userId],
      ['disconnect', 'org-1', 'live'],
    ]);
  });

  it('turns a request the app did not sign away with 400', async () => {
    await assert.rejects(service().deauthorize('app', 'x.y'), rejectsWith(400));
    assert.deepEqual(calls, []);
  });
});
