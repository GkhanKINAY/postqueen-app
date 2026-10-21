import { HttpException, Injectable, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { NoticesRepository } from '@gitroom/nestjs-libraries/database/prisma/notices/notices.repository';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import {
  NoticeContentDto,
  SendNoticeDto,
} from '@gitroom/nestjs-libraries/dtos/notices/send.notice.dto';
import {
  EmailContent,
  emailContent,
} from '@gitroom/nestjs-libraries/emails/email.content';
import { renderEmail } from '@gitroom/nestjs-libraries/emails/email.layout';
import { normalizeEmail } from '@gitroom/helpers/auth/account-security';

/** What sendNoticeWorkflowV1 carries from one batch to the next. */
export interface NoticeBatch {
  noticeKey: string;
  subject: string;
  html: string;
  /** The last user id the previous batch started; the list is in id order. */
  after?: string;
  limit: number;
}

/** What one sendNoticeEmailWorkflowV1 sends. No address: it is read at send time. */
export interface NoticeEmail {
  noticeKey: string;
  userId: string;
  subject: string;
  html: string;
}

/** The fan-out: one per notice, so a second request while it runs starts nothing. */
export const noticeWorkflowId = (noticeKey: string) => `notice:${noticeKey}`;

/**
 * One per notice and account. Started with ALLOW_DUPLICATE_FAILED_ONLY:
 * running the same notice again starts no account whose email is sent or on
 * its way, and starts again one whose every attempt failed. The delivery row
 * is checked before each send, so even that cannot be a second copy.
 */
export const noticeEmailWorkflowId = (noticeKey: string, userId: string) =>
  `notice:${noticeKey}:${userId}`;

/**
 * Who still gets a notice: one account per address, whatever its case (the
 * oldest, as the rows come oldest first), leaving out the accounts and the
 * addresses it already reached. In id order, so the fan-out can page through
 * it with a cursor that new or deleted accounts do not shift.
 */
export const pendingNoticeRecipients = (
  rows: { id: string; email: string }[],
  delivered: { userId: string; user: { email: string } }[]
) => {
  const doneUsers = new Set(delivered.map((d) => d.userId));
  const doneEmails = new Set(
    delivered.map((d) => normalizeEmail(d.user.email))
  );
  const seen = new Set<string>();
  const pending: { id: string; email: string }[] = [];
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (seen.has(email)) {
      continue;
    }
    seen.add(email);
    if (!doneUsers.has(row.id) && !doneEmails.has(email)) {
      pending.push(row);
    }
  }
  return pending.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
};

const noticeContent = (content: NoticeContentDto): EmailContent => ({
  stream: 'account',
  category: content.category,
  preheader: content.preheader,
  tone: content.tone || 'brand',
  icon: content.icon,
  title: content.title,
  accent: content.accent,
  lead: content.lead,
  blocks: content.blocks,
  footer: 'legal',
  footerText: content.footerText,
});

const alreadyStarted = (err: unknown) =>
  (err as { name?: string })?.name === 'WorkflowExecutionAlreadyStartedError';

/**
 * Service notices: an email every account holder gets once, whatever their
 * email settings (a Terms change, a new sub-processor). The endpoint counts
 * and starts one fan-out workflow; the fan-out starts one workflow per
 * account, paced so the bulk email queue keeps room for everything else on
 * it; each of those sends one email and records it. Logs carry counts and
 * ids, never addresses.
 */
@Injectable()
export class NoticesService {
  private readonly _logger = new Logger(NoticesService.name);

  constructor(
    private _noticesRepository: NoticesRepository,
    private _usersRepository: UsersRepository,
    private _emailService: EmailService,
    private _temporalService: TemporalService
  ) {}

  async pendingRecipients(noticeKey: string) {
    const [rows, delivered] = await Promise.all([
      this._usersRepository.listNoticeRecipients(),
      this._noticesRepository.listDeliveries(noticeKey),
    ]);
    return pendingNoticeRecipients(rows, delivered);
  }

  /**
   * POST /admin/notices. Answers at once; the sending runs in Temporal.
   * Sending the same notice again once a run has finished reaches only who
   * it missed: an account created during the run, or one whose every attempt
   * failed.
   */
  async sendNotice(body: SendNoticeDto) {
    const content = noticeContent(body.content);
    // A block missing its fields would fail every send; this fails the request.
    try {
      renderEmail(
        { frontendUrl: '', fromName: 'PostQueen' },
        body.subject,
        content
      );
    } catch (err) {
      throw new HttpException(
        `The notice does not render: ${(err as Error).message}`,
        400
      );
    }

    const recipients = (await this.pendingRecipients(body.noticeKey)).length;
    if (body.dryRun || !recipients) {
      this._logger.log(
        `[notice] key=${body.noticeKey} recipients=${recipients} dryRun=${body.dryRun}`
      );
      return { recipients, started: false };
    }

    if (!this._emailService.hasProvider()) {
      throw new HttpException('No email provider is configured', 400);
    }
    const client = this._temporalService.client.getRawClient();
    if (!client) {
      throw new HttpException('Temporal is not available', 503);
    }

    let started = false;
    try {
      await client.workflow.start('sendNoticeWorkflowV1', {
        workflowId: noticeWorkflowId(body.noticeKey),
        taskQueue: 'main',
        args: [
          {
            noticeKey: body.noticeKey,
            subject: body.subject,
            html: emailContent(content),
          },
        ],
      });
      started = true;
    } catch (err) {
      // Still sending from an earlier request: that run reaches everyone.
      if (!alreadyStarted(err)) {
        throw err;
      }
    }
    this._logger.log(
      `[notice] key=${body.noticeKey} recipients=${recipients} started=${started}`
    );
    return { recipients, started };
  }

  /**
   * One page of the fan-out: starts the email workflow for the next `limit`
   * accounts after `after`. An account whose workflow is running or has
   * completed is skipped, so a retried or repeated batch emails nobody twice;
   * one whose workflow failed is started again.
   */
  async startNoticeBatch({
    noticeKey,
    subject,
    html,
    after,
    limit,
  }: NoticeBatch) {
    const batch = (await this.pendingRecipients(noticeKey))
      .filter((recipient) => !after || recipient.id > after)
      .slice(0, limit);

    const client = this._temporalService.client.getRawClient();
    if (!client) {
      throw new Error('[notice] Temporal client unavailable');
    }

    let started = 0;
    let skipped = 0;
    for (const { id: userId } of batch) {
      try {
        await client.workflow.start('sendNoticeEmailWorkflowV1', {
          workflowId: noticeEmailWorkflowId(noticeKey, userId),
          taskQueue: 'main',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
          args: [{ noticeKey, userId, subject, html } satisfies NoticeEmail],
        });
        started += 1;
      } catch (err) {
        if (!alreadyStarted(err)) {
          throw err;
        }
        skipped += 1;
      }
    }

    this._logger.log(
      `[notice] key=${noticeKey} batch started=${started} skipped=${skipped}`
    );
    return {
      started,
      skipped,
      next: batch.length === limit ? batch[batch.length - 1].id : undefined,
    };
  }

  /**
   * Sends one account its notice and records it. The account is read again,
   * so one deleted since the fan-out gets nothing, and so is the proof, so an
   * address that already has it does not get it twice. An email that did not
   * reach the provider throws, for Temporal to try again; one the provider
   * refused or accepted does not, since a retry would be refused again or
   * send a second copy.
   */
  async sendNoticeEmail({ noticeKey, userId, subject, html }: NoticeEmail) {
    const recipient = await this._usersRepository.getNoticeRecipient(userId);
    if (!recipient) {
      this._logger.log(`[notice] key=${noticeKey} user=${userId} skipped=gone`);
      return { sent: false };
    }
    if (
      await this._noticesRepository.wasDelivered(
        noticeKey,
        userId,
        recipient.email
      )
    ) {
      this._logger.log(`[notice] key=${noticeKey} user=${userId} skipped=sent`);
      return { sent: false };
    }

    const { accepted, refused } = await this._emailService.deliverEmail(
      recipient.email,
      subject,
      html
    );
    // An address the provider refuses is refused again on every retry.
    if (refused) {
      this._logger.warn(`[notice] key=${noticeKey} user=${userId} refused`);
      return { sent: false };
    }
    if (!accepted) {
      throw new Error(`[notice] key=${noticeKey} user=${userId} not accepted`);
    }

    try {
      await this._noticesRepository.recordDelivery(noticeKey, userId);
    } catch (err) {
      this._logger.error(
        `[notice] key=${noticeKey} user=${userId} sent, proof not recorded: ${
          (err as Error)?.message
        }`
      );
    }
    return { sent: true };
  }
}
