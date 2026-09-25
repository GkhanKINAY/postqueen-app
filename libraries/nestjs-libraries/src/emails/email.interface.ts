/** Parts of an email beyond the HTML body. */
export interface EmailExtras {
  /** The plain-text part. Mailboxes trust an email more when it has one. */
  text?: string;
}

export interface EmailInterface {
  name: string;
  validateEnvKeys: string[];
  sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string,
    extras?: EmailExtras,
  ): Promise<any>;
}
