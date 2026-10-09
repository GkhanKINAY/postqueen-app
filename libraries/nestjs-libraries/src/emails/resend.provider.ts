import { Resend } from 'resend';
import {
  EmailExtras,
  EmailInterface,
} from '@gitroom/nestjs-libraries/emails/email.interface';

const resend = new Resend(process.env.RESEND_API_KEY || 're_132');

export class ResendProvider implements EmailInterface {
  name = 'resend';
  validateEnvKeys = ['RESEND_API_KEY'];
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string,
    extras?: EmailExtras,
  ) {
    const sends = await resend.emails.send({
      from: `${emailFromName} <${emailFromAddress}>`,
      to,
      subject,
      html,
      ...(extras?.text && { text: extras.text }),
      ...(extras?.headers && { headers: extras.headers }),
      ...(replyTo && { reply_to: replyTo }),
    });

    // The SDK returns API errors (like a 429 rate limit) instead of throwing.
    // Throw, so sendEmailSync retries the send and logs it as failed rather
    // than as sent.
    if (sends.error) {
      throw new Error(`${sends.error.name}: ${sends.error.message}`);
    }

    return sends;
  }
}
