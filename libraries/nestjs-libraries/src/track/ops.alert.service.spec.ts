import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { OpsAlertService } from './ops.alert.service.ts';

describe('OpsAlertService', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.SLACK_ALERT_WEBHOOK_URL;
  });

  it('does nothing without a webhook', async () => {
    globalThis.fetch = (async () => {
      throw new Error('should not be called');
    }) as any;
    assert.equal(await new OpsAlertService().alert('x'), false);
  });

  it('posts in the shape the host alerts use', async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = 'https://hooks.slack.invalid/x';
    let sent: any;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response('ok');
    }) as any;
    assert.equal(await new OpsAlertService().alert('TikTok: 150'), true);
    assert.deepEqual(sent, { text: ':warning: [PostQueen] TikTok: 150' });
  });

  it('reads what Slack answered instead of trusting the request', async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = 'https://hooks.slack.invalid/x';
    globalThis.fetch = (async () =>
      new Response('channel_not_found', { status: 404 })) as any;
    assert.equal(await new OpsAlertService().alert('x'), false);
  });

  it('never throws when Slack cannot be reached', async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = 'https://hooks.slack.invalid/x';
    globalThis.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as any;
    assert.equal(await new OpsAlertService().alert('x'), false);
  });
});
