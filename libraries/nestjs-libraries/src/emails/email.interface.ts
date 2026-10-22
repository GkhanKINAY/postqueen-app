/** Parts of an email beyond the HTML body. */
export interface EmailExtras {
  /** The plain-text part. Mailboxes trust an email more when it has one. */
  text?: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /**
   * The same key on a retry makes a provider that supports it (Resend)
   * answer with the first send instead of sending again. Others ignore it.
   */
  idempotencyKey?: string;
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
