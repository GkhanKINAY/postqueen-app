import { EmailInterface } from './email.interface';

export class EmptyProvider implements EmailInterface {
  name = 'no provider';
  validateEnvKeys = [];
  // The caller logs whatever this returns. The body is left out on purpose:
  // password-reset and activation emails carry a live token in their links,
  // and an instance without a provider would otherwise write it to the logs.
  async sendEmail(to: string, subject: string, html: string) {
    return `No email provider configured; "${subject}" to ${to} was not sent`;
  }
}
