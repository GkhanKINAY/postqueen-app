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
    // Throw on the ones a retry can fix (429, 5xx, no response), so
    // sendEmailSync tries again. Any other 4xx (an invalid address or key)
    // fails the same way every time: log it once and give up.
    if (sends.error) {
      const { name, message, statusCode } = sends.error;
      if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        console.error(`[email] Resend refused the email: ${name}: ${message}`);
        return sends;
      }
      throw new Error(`${name}: ${message}`);
    }

    return sends;
  }
}
