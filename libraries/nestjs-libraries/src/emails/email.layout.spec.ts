import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DigestItem,
  EmailContent,
  digestEmail,
  emailContent,
  noticeEmail,
  readEmailContent,
} from './email.content.ts';
import { EmailEnv, renderEmail, renderLegacyEmail } from './email.layout.ts';

const env: EmailEnv = {
  frontendUrl: 'https://app.example.com',
  fromName: 'PostQueen',
  supportEmail: 'support@example.com',
  legalUrl: 'https://example.com',
  postalAddress: 'Example Ltd, 1 Main St, Tallinn',
};

const invite = (workspace: string): EmailContent => ({
  stream: 'account',
  category: 'Invitation',
  preheader: 'Join the team.',
  tone: 'brand',
  initial: workspace,
  title: `Join ${workspace}`,
  accent: 'on PostQueen.',
  lead: `**Maya** invited you to the ${workspace} team.`,
  blocks: [
    { type: 'details', rows: [['Workspace', workspace]] },
    {
      type: 'button',
      link: { label: 'Accept invitation', url: '/?org=token' },
    },
    { type: 'fallback', url: 'https://app.example.com/?org=token' },
  ],
  footer: 'invite',
});

describe('email content', () => {
  it('travels through the html argument and back', () => {
    const content = invite('Sunrise Studio');
    assert.deepEqual(readEmailContent(emailContent(content)), content);
  });

  it('leaves plain HTML alone, so emails queued before the change still send', () => {
    assert.equal(readEmailContent('Click <a href="x">here</a>'), null);
    assert.equal(readEmailContent('pq-email:v1:{not json'), null);
  });
});

describe('renderEmail', () => {
  it('escapes what people typed, so a workspace name cannot carry markup', () => {
    const { html } = renderEmail(
      env,
      'Invite',
      invite('<a href="https://evil.test">Win</a>'),
    );
    assert.ok(!html.includes('<a href="https://evil.test">'));
    assert.ok(
      html.includes(
        '&lt;a href=&quot;https://evil.test&quot;&gt;Win&lt;/a&gt;',
      ),
    );
  });

  it('turns **word** into bold and nothing else into markup', () => {
    const { html } = renderEmail(env, 'Invite', invite('Sunrise Studio'));
    assert.match(html, /<strong[^>]*>Maya<\/strong> invited you/);
  });

  it('puts the app address in front of app paths and leaves full URLs as they are', () => {
    const { html } = renderEmail(env, 'Invite', invite('Sunrise Studio'));
    assert.ok(html.includes('href="https://app.example.com/?org=token"'));
    assert.ok(html.includes('https://app.example.com/email/logo.png'));
  });

  it('carries its own dark colours for Apple Mail and Outlook.com', () => {
    const { html } = renderEmail(env, 'Invite', invite('Sunrise Studio'));
    assert.ok(html.includes('<meta name="color-scheme" content="light dark">'));
    assert.match(
      html,
      /@media \(prefers-color-scheme:dark\)\{\.pq-bg\{background-color:#0E0C14!important\}/,
    );
    assert.ok(html.includes('[data-ogsb] .pq-bg{'));
    assert.ok(html.includes('[data-ogsc] .pq-ink{'));
  });

  it('writes a plain-text part from the same content', () => {
    const { text } = renderEmail(env, 'Invite', invite('Sunrise Studio'));
    assert.ok(text.includes('Join Sunrise Studio on PostQueen.'));
    assert.ok(text.includes('Maya invited you to the Sunrise Studio team.'));
    assert.ok(
      text.includes('Accept invitation: https://app.example.com/?org=token'),
    );
    assert.ok(!/<[a-z]/i.test(text));
  });

  it('offers notification settings only on emails that can be turned off', () => {
    const manage = 'https://app.example.com/settings?tab=notifications';
    const failure = renderEmail(
      env,
      'x',
      noticeEmail({ title: 'Failed', message: 'Failed.', type: 'fail' }),
    );
    const security = renderEmail(env, 'x', {
      ...invite('A'),
      footer: 'security',
    });
    assert.ok(failure.html.includes(manage));
    assert.ok(!security.html.includes(manage));
  });

  it('shows the company and the legal pages only when the install sets them', () => {
    const withAll = renderEmail(env, 'x', invite('A')).html;
    assert.ok(
      withAll.includes('PostQueen is made by Example Ltd, 1 Main St, Tallinn.'),
    );
    assert.ok(withAll.includes('https://example.com/privacy-policy'));
    const bare = renderEmail(
      { frontendUrl: env.frontendUrl, fromName: 'PostQueen' },
      'x',
      invite('A'),
    ).html;
    assert.ok(!bare.includes('is made by'));
    assert.ok(!bare.includes('privacy-policy'));
  });
});

describe('renderLegacyEmail', () => {
  it('keeps the old markup and its links inside the new frame', () => {
    const { html, text } = renderLegacyEmail(
      env,
      'Activate your account',
      'Click <a href="https://app.example.com/a">here</a> to activate',
    );
    assert.ok(html.includes('<a href="https://app.example.com/a">here</a>'));
    assert.ok(text.includes('here (https://app.example.com/a) to activate'));
  });
});

describe('the hourly summary', () => {
  const live = (n: number): DigestItem => ({
    title: `Your post has been published on Network ${n}`,
    message: `Your post has been published on Network ${n} at https://network.test/${n}`,
    type: 'success',
    link: `https://network.test/${n}`,
  });
  const failed: DigestItem = {
    title: 'We couldn’t publish your post to Instagram',
    message:
      'We couldn’t publish your post to Studio: Aspect ratio not supported.',
    type: 'fail',
    link: '/launches',
  };

  it('sends a lone notice as its own email', () => {
    const own = noticeEmail(failed);
    const { subject, content } = digestEmail([
      { ...failed, email: { ...own, title: 'Custom' } },
    ]);
    assert.equal(subject, failed.title);
    assert.equal(content.title, 'Custom');
  });

  it('counts what went live and what needs attention, attention first', () => {
    const { subject, content } = digestEmail([
      live(1),
      failed,
      live(2),
      live(3),
    ]);
    assert.equal(subject, '3 posts went live, 1 needs you');
    const rows = content.blocks.filter((b) => b.type === 'rows');
    assert.deepEqual(
      rows.map((b) => (b.type === 'rows' ? b.label : '')),
      ['Needs you', 'Went live'],
    );
  });

  it('does not repeat a published notice’s title as its text', () => {
    const { content } = digestEmail([live(1), live(2)]);
    const rows = content.blocks.find((b) => b.type === 'rows');
    assert.ok(rows && rows.type === 'rows');
    assert.equal(rows.rows[0].text, undefined);
    assert.equal(rows.rows[0].link?.url, 'https://network.test/1');
  });
});
