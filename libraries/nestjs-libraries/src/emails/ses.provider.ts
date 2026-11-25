import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  EmailExtras,
  EmailInterface,
} from '@gitroom/nestjs-libraries/emails/email.interface';

// Without SES_ACCESS_KEY the default AWS credential chain is used
// (AWS_* env vars, ECS task role, EC2 instance profile)
const ses = new SESv2Client({
  region: process.env.SES_REGION,
  ...(process.env.SES_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.SES_ACCESS_KEY,
          secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
        },
      }
    : {}),
});

export class SesProvider implements EmailInterface {
  name = 'ses';
  validateEnvKeys = [
    'SES_REGION',
    ...(process.env.SES_ACCESS_KEY ? ['SES_SECRET_ACCESS_KEY'] : []),
  ];
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string,
    extras?: EmailExtras,
  ) {
    // SES only accepts 7-bit ASCII in the From address, so a non-ASCII
    // sender name has to be a MIME encoded-word (RFC 2047)
    const fromName = /^[\x20-\x7e]*$/.test(emailFromName)
      ? `"${emailFromName.replace(/["\\]/g, '\\$&')}"`
      : `=?UTF-8?B?${Buffer.from(emailFromName).toString('base64')}?=`;

    try {
      return await ses.send(
        new SendEmailCommand({
          FromEmailAddress: `${fromName} <${emailFromAddress}>`,
          Destination: { ToAddresses: [to] },
          ...(replyTo && { ReplyToAddresses: [replyTo] }),
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: {
                Html: { Data: html, Charset: 'UTF-8' },
                ...(extras?.text && {
                  Text: { Data: extras.text, Charset: 'UTF-8' },
                }),
              },
              ...(extras?.headers && {
                Headers: Object.entries(extras.headers).map(
                  ([Name, Value]) => ({ Name, Value })
                ),
              }),
            },
          },
        })
      );
    } catch (err: any) {
      // The SDK throws on API errors, after retrying throttling and 5xx
      // itself. Throw again on the ones a retry can fix (throttling, 5xx, no
      // response), so sendEmailSync tries again. Any other 4xx (a rejected
      // message, an unverified sender, a paused account) fails the same way
      // every time: log it once and give up, as Resend does.
      const statusCode: number | undefined = err?.$metadata?.httpStatusCode;
      if (
        statusCode &&
        statusCode >= 400 &&
        statusCode < 500 &&
        statusCode !== 429 &&
        err.name !== 'LimitExceededException'
      ) {
        console.error(`[email] SES refused the email: ${err.name}: ${err.message}`);
        return { error: { name: err.name, message: err.message, statusCode } };
      }
      throw err;
    }
  }
}
