import { Injectable } from '@nestjs/common';
import { EmailInterface } from '@gitroom/nestjs-libraries/emails/email.interface';
import { ResendProvider } from '@gitroom/nestjs-libraries/emails/resend.provider';
import { EmptyProvider } from '@gitroom/nestjs-libraries/emails/empty.provider';
import { NodeMailerProvider } from '@gitroom/nestjs-libraries/emails/node.mailer.provider';
import { TemporalService } from 'nestjs-temporal-core';
import { timer } from '@gitroom/helpers/utils/timer';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import {
  EmailStream,
  readEmailContent,
} from '@gitroom/nestjs-libraries/emails/email.content';
import {
  EmailEnv,
  renderEmail,
  renderLegacyEmail,
} from '@gitroom/nestjs-libraries/emails/email.layout';

@Injectable()
export class EmailService {
  emailService: EmailInterface;
  constructor(private _temporalService: TemporalService) {
    this.emailService = this.selectProvider(process.env.EMAIL_PROVIDER!);
    console.log('Email service provider:', this.emailService.name);
    for (const key of this.emailService.validateEnvKeys) {
      if (!process.env[key]) {
        console.error(`Missing environment variable: ${key}`);
      }
    }
  }

  /**
   * Whether this installation can actually deliver mail.
   *
   * The from-address half matters as much as the provider. `sendEmail` below
   * returns early when `EMAIL_FROM_ADDRESS` or `EMAIL_FROM_NAME` is missing, and
   * both ship commented out in `.env.example` — so a provider set without them
   * looked configured to every caller while delivering nothing. With
   * `REQUIRE_EMAIL_ACTIVATION=true` that combination writes accounts
   * `activated: false`, never sends the link, and answers `{success: true}` to
   * every resend request: a permanent lockout with no error anywhere. Same
   * shape locks out passwordless login when it is the only sign-in method.
   */
  hasProvider() {
    return (
      !(this.emailService instanceof EmptyProvider) &&
      !!process.env.EMAIL_FROM_ADDRESS &&
      !!process.env.EMAIL_FROM_NAME
    );
  }

  /**
   * Notifications go out from their own address when one is set, so a
   * mailbox that learns to file publishing updates away never learns it about
   * sign-in codes. Replies still reach the support inbox.
   */
  private sender(stream: EmailStream) {
    const account = process.env.EMAIL_FROM_ADDRESS!;
    const notifications = process.env.EMAIL_NOTIFICATIONS_FROM_ADDRESS;
    if (stream === 'notifications' && notifications) {
      return { from: notifications, replyTo: account };
    }
    return { from: account, replyTo: undefined };
  }

  /**
   * Links and company details in every footer. Hosted PostQueen falls back to
   * its own site, the way the app's legal and support links do; a self-hosted
   * install shows only what it configures.
   */
  private layoutEnv(): EmailEnv {
    const hosted = isBillingEnabled();
    return {
      frontendUrl: process.env.FRONTEND_URL || '',
      fromName: process.env.EMAIL_FROM_NAME || 'PostQueen',
      supportEmail: process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM_ADDRESS,
      legalUrl:
        process.env.LEGAL_URL || (hosted ? 'https://postqueen.ai' : undefined),
      helpUrl: hosted ? 'https://docs.postqueen.ai' : undefined,
      postalAddress: process.env.EMAIL_POSTAL_ADDRESS,
    };
  }

  selectProvider(provider: string) {
    switch (provider) {
      case 'resend':
        return new ResendProvider();
      case 'nodemailer':
        return new NodeMailerProvider();
      default:
        return new EmptyProvider();
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    addTo: 'top' | 'bottom',
    replyTo?: string
  ) {
    return this._temporalService.client
      .getRawClient()
      ?.workflow.signalWithStart('sendEmailWorkflow', {
        taskQueue: 'main',
        workflowId: 'send_email',
        signal: 'sendEmail',
        args: [{ queue: [] }],
        signalArgs: [{ to, subject, html, replyTo, addTo }],
        workflowIdConflictPolicy: 'USE_EXISTING',
      });
  }

  async sendEmailSync(
    to: string,
    subject: string,
    html: string,
    replyTo?: string
  ) {
    if (to.indexOf('@') === -1) {
      return;
    }

    if (!process.env.EMAIL_FROM_ADDRESS || !process.env.EMAIL_FROM_NAME) {
      console.log(
        'Email sender information not found in environment variables'
      );
      return;
    }

    const content = readEmailContent(html);
    const env = this.layoutEnv();
    const rendered = content
      ? renderEmail(env, subject, content)
      : renderLegacyEmail(env, subject, html);
    const sender = this.sender(content?.stream || 'account');

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const sends = await this.emailService.sendEmail(
          to,
          subject,
          rendered.html,
          process.env.EMAIL_FROM_NAME,
          sender.from,
          replyTo || sender.replyTo,
          { text: rendered.text }
        );
        console.log(sends);
        return;
      } catch (err) {
        lastErr = err;
        console.log(`Email attempt ${attempt + 1}/3 failed:`, err);
        if (attempt < 2) {
          await timer(700);
        }
      }
    }
    console.log(`Email to ${to} failed after 3 attempts:`, lastErr);
  }
}
