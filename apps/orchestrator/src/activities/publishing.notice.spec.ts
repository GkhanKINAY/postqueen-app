import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostActivity } from './post.activity.ts';
import { MEDIA_READ_FAILED } from '@gitroom/nestjs-libraries/integrations/social.abstract';

/**
 * post.workflow v1.0.12 hands every notice to `publishingNotice`. The in-app
 * text must keep the shapes the notifications panel classifies by
 * (notification.look.ts reads the provider id out of it), while the email
 * names the network and shows the post.
 */
const post = {
  id: 'p1',
  content: '<p>Saturday sunrise flow is back.</p>',
  settings: null,
  integration: { id: 'i1', name: 'Sunrise Studio', providerIdentifier: 'linkedin-page' },
};

// `sent` stands in for the notifications table: what went out, and when.
const run = async (
  notice: any,
  detail?: string,
  sent: { org: string; message: string; link: string; at: number }[] = [],
  target: any = post
) => {
  const calls: any[] = [];
  const activity = new (PostActivity as any)(
    {
      getPostsRecursively: async () => (target ? [target] : []),
      shouldSkipPublishNotice: (p: any) => p?.settings === '{"pq_notify":false}',
    },
    {
      inAppNotification: async (...args: any[]) => {
        calls.push(args);
        sent.push({ org: args[0], message: args[2], link: args[6], at: Date.now() });
      },
      hasNotificationSince: async (org: string, message: string, link: string, since: Date) =>
        sent.some(
          (n) =>
            n.org === org &&
            n.message === message &&
            n.link === link &&
            n.at >= since.getTime()
        ),
    },
    { getSocialIntegrationName: () => 'LinkedIn Page' }
  );
  await activity.publishingNotice('org1', 'p1', notice, detail);
  return calls[0];
};

describe('publishingNotice', () => {
  it('keeps the identifier in the in-app text and names the network in the email', async () => {
    const [org, subject, message, sendEmail, digest, type, link, email] = await run('reconnect');
    assert.equal(org, 'org1');
    assert.match(message, /couldn't post to linkedin-page for Sunrise Studio because you need to reconnect it/);
    assert.doesNotMatch(message, /enable it/);
    assert.equal(subject, 'Reconnect LinkedIn Page to publish your post');
    assert.equal(sendEmail, true);
    assert.equal(digest, true);
    assert.equal(type, 'info');
    assert.equal(link, '/channels?channel=linkedin-page&focus=i1');
    assert.equal(email.footer, 'alert');
  });

  it('carries the platform message on a refused post', async () => {
    const [, , message, , , type, , email, row] = await run('bad_body', 'Duplicate content');
    assert.equal(message, 'An error occurred while posting on linkedin-page: Duplicate content');
    assert.equal(type, 'fail');
    assert.deepEqual(
      email.blocks.find((b: any) => b.type === 'reason'),
      { type: 'reason', label: 'What LinkedIn Page said', text: 'Duplicate content' }
    );
    assert.equal(row.title, 'Saturday sunrise flow is back.');
  });

  it('does not put PostQueen\'s own failure in the network\'s mouth', async () => {
    const [, subject, , , , , , email] = await run('bad_body', MEDIA_READ_FAILED);
    assert.equal(subject, 'Your post to LinkedIn Page didn’t go out');
    assert.deepEqual(
      email.blocks.find((b: any) => b.type === 'reason'),
      { type: 'reason', label: 'What happened', text: MEDIA_READ_FAILED }
    );
    assert.equal(email.preheader, MEDIA_READ_FAILED);
    assert.match(email.lead, /^We could not send your post from Sunrise Studio to LinkedIn Page/);
  });

  it('keeps the published text the panel and the quiet-post check read', async () => {
    const [, subject, message, , , type, link] = await run('published', 'https://www.linkedin.com/feed/update/1');
    assert.equal(message, 'Your post has been published on Linkedin-page at https://www.linkedin.com/feed/update/1');
    assert.equal(subject, 'Your post is live on LinkedIn Page');
    assert.equal(type, 'success');
    assert.equal(link, 'https://www.linkedin.com/feed/update/1');
  });

  it('sends no email for the in-app-only notices', async () => {
    const [, , , sendEmail] = await run('processing');
    assert.equal(sendEmail, false);
  });

  it('says a processing post can take a few minutes, under the network\'s own name', async () => {
    const [, subject, message] = await run('processing');
    assert.equal(subject, 'Publishing your post on LinkedIn Page');
    assert.match(message, /^LinkedIn Page accepted your post/);
    assert.match(message, /can take a few minutes to appear on your profile/);
  });

  it('tells about a channel problem once a day for each channel', async () => {
    const sent: any[] = [];
    assert.ok(await run('disabled', undefined, sent));
    assert.equal(await run('disabled', undefined, sent), undefined);
    // Another problem of the same channel, and the same problem of another one
    assert.ok(await run('reconnect', undefined, sent));
    assert.ok(
      await run('disabled', undefined, sent, {
        ...post,
        integration: { ...post.integration, id: 'i2', name: 'Studio Two' },
      })
    );
    assert.equal(await run('reconnect', undefined, sent), undefined);
    assert.ok(await run('unfinished', undefined, sent));
    assert.equal(await run('unfinished', undefined, sent), undefined);
  });

  it('tells again once the day has passed', async () => {
    const sent: any[] = [];
    await run('disabled', undefined, sent);
    sent[0].at -= 25 * 60 * 60 * 1000;
    assert.ok(await run('disabled', undefined, sent));
  });

  it('never holds back what is about the post itself', async () => {
    const sent: any[] = [];
    const url = 'https://www.linkedin.com/feed/update/1';
    assert.ok(await run('published', url, sent));
    assert.ok(await run('published', url, sent));
    assert.ok(await run('bad_body', 'Duplicate content', sent));
    assert.ok(await run('bad_body', 'Duplicate content', sent));
  });

  it('sends every channel notice when the channel cannot be read', async () => {
    // The link falls back to /channels then, the same for every channel
    const sent: any[] = [];
    assert.ok(await run('disabled', undefined, sent, null));
    assert.ok(await run('disabled', undefined, sent, null));
  });
});
