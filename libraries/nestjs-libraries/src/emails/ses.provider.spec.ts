import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import {
  InternalServiceErrorException,
  LimitExceededException,
  MessageRejected,
  SESv2Client,
  SendEmailCommand,
  TooManyRequestsException,
} from '@aws-sdk/client-sesv2';
import { SesProvider } from './ses.provider.ts';

const provider = new SesProvider();

/** Every command the provider hands the client, with the client answering `reply`. */
const capture = (t: TestContext, reply: () => unknown) => {
  const sent: SendEmailCommand['input'][] = [];
  t.mock.method(SESv2Client.prototype, 'send', async (command: SendEmailCommand) => {
    sent.push(command.input);
    return reply();
  });
  return sent;
};

const accepted = () => ({ MessageId: 'ses-1', $metadata: { httpStatusCode: 200 } });

describe('SES email provider', () => {
  it('sends the HTML and text parts and the unsubscribe headers', async (t) => {
    const sent = capture(t, accepted);
    const answer = await provider.sendEmail(
      'person@example.com',
      'Your weekly summary',
      '<p>Hello</p>',
      'PostQueen',
      'notifications@example.com',
      'support@example.com',
      {
        text: 'Hello',
        headers: {
          'List-Unsubscribe': '<https://api.example.com/public/emails/unsubscribe?token=t>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        idempotencyKey: 'notice-1',
      }
    );

    assert.deepEqual(answer, accepted());
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      FromEmailAddress: '"PostQueen" <notifications@example.com>',
      Destination: { ToAddresses: ['person@example.com'] },
      ReplyToAddresses: ['support@example.com'],
      Content: {
        Simple: {
          Subject: { Data: 'Your weekly summary', Charset: 'UTF-8' },
          Body: {
            Html: { Data: '<p>Hello</p>', Charset: 'UTF-8' },
            Text: { Data: 'Hello', Charset: 'UTF-8' },
          },
          Headers: [
            {
              Name: 'List-Unsubscribe',
              Value: '<https://api.example.com/public/emails/unsubscribe?token=t>',
            },
            { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
          ],
        },
      },
    });
  });

  it('leaves out reply-to, the text part and headers it was not given', async (t) => {
    const sent = capture(t, accepted);
    await provider.sendEmail(
      'person@example.com',
      'Sign in',
      '<p>Code</p>',
      'PostQueen',
      'hello@example.com'
    );

    assert.deepEqual(sent[0], {
      FromEmailAddress: '"PostQueen" <hello@example.com>',
      Destination: { ToAddresses: ['person@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'Sign in', Charset: 'UTF-8' },
          Body: { Html: { Data: '<p>Code</p>', Charset: 'UTF-8' } },
        },
      },
    });
  });

  it('quotes an ASCII sender name and encodes any other', async (t) => {
    const sent = capture(t, accepted);
    await provider.sendEmail('a@example.com', 's', 'h', 'Say "hi" \\ Co', 'f@example.com');
    await provider.sendEmail('a@example.com', 's', 'h', 'Zoë Café', 'f@example.com');

    assert.equal(sent[0].FromEmailAddress, '"Say \\"hi\\" \\\\ Co" <f@example.com>');
    assert.equal(
      sent[1].FromEmailAddress,
      `=?UTF-8?B?${Buffer.from('Zoë Café').toString('base64')}?= <f@example.com>`
    );
  });

  it('answers a refusal with an error, so it is not sent again', async (t) => {
    const logged = t.mock.method(console, 'error', () => undefined);
    capture(t, () => {
      throw new MessageRejected({
        message: 'Email address is not verified.',
        $metadata: { httpStatusCode: 400 },
      });
    });

    const answer = await provider.sendEmail('a@example.com', 's', 'h', 'n', 'f@example.com');

    assert.deepEqual(answer, {
      error: {
        name: 'MessageRejected',
        message: 'Email address is not verified.',
        statusCode: 400,
      },
    });
    assert.equal(logged.mock.callCount(), 1);
  });

  it('throws on what a retry can fix, so the caller tries again', async (t) => {
    for (const error of [
      new TooManyRequestsException({ message: 'slow down', $metadata: { httpStatusCode: 429 } }),
      new LimitExceededException({ message: 'quota', $metadata: { httpStatusCode: 400 } }),
      new InternalServiceErrorException({ message: 'oops', $metadata: { httpStatusCode: 500 } }),
      new Error('socket hang up'),
    ]) {
      await t.test(error.name, async (t) => {
        capture(t, () => {
          throw error;
        });
        await assert.rejects(
          provider.sendEmail('a@example.com', 's', 'h', 'n', 'f@example.com'),
          error
        );
      });
    }
  });
});
