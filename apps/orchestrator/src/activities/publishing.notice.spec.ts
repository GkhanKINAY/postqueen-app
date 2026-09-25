import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostActivity } from './post.activity.ts';

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

const run = async (notice: any, detail?: string) => {
  const calls: any[] = [];
  const activity = new (PostActivity as any)(
    {
      getPostsRecursively: async () => [post],
      shouldSkipPublishNotice: (p: any) => p?.settings === '{"pq_notify":false}',
    },
    { inAppNotification: async (...args: any[]) => calls.push(args) },
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
});
