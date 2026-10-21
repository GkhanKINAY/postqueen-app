import {
  continueAsNew,
  log,
  proxyActivities,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import type { NoticeActivity } from '@gitroom/orchestrator/activities/notice.activity';
import type { NoticeEmail } from '@gitroom/nestjs-libraries/database/prisma/notices/notices.service';
import { emailQueues } from '@gitroom/nestjs-libraries/temporal/email.queues';

// Each batch is a couple of queries and up to BATCH workflow starts. A start
// that already exists is skipped, so a batch is safe to repeat: it is retried
// until it goes through, rather than a database or Temporal hiccup ending the
// fan-out halfway after the endpoint said it started. A run that must stop is
// terminated by hand.
const { startNoticeBatch } = proxyActivities<NoticeActivity>({
  startToCloseTimeout: '5 minute',
  retry: {
    backoffCoefficient: 2,
    initialInterval: '1 minute',
    maximumInterval: '15 minutes',
  },
});

// On the bulk email queue, under its rate limit. It throws only when the email
// never reached the provider, so a retry cannot send a second copy. Patient,
// about two hours in all, so a provider outage is waited out; an account that
// still fails is started again by sending the same notice again.
const { sendNoticeEmail } = proxyActivities<NoticeActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: emailQueues.bulk.taskQueue,
  retry: {
    maximumAttempts: 8,
    backoffCoefficient: 2,
    initialInterval: '1 minute',
    maximumInterval: '1 hour',
  },
});

// 30 accounts every 2 minutes is 0.25 a second, half of what the bulk email
// queue sends: the welcome, streak and hourly summary emails on it keep their
// pace instead of waiting behind every account's notice.
const BATCH = 30;
const PAUSE = '2 minutes';

/**
 * A service notice to every account holder (POST /admin/notices), one per
 * notice under the id `notice:<noticeKey>`. Pages through the accounts that
 * still need it in id order, starting `sendNoticeEmailWorkflowV1` for each,
 * and hands its history over with `continueAsNew` on a long list.
 */
export async function sendNoticeWorkflowV1(notice: {
  noticeKey: string;
  subject: string;
  html: string;
  after?: string;
  started?: number;
  skipped?: number;
}) {
  const { noticeKey, subject, html } = notice;
  let { after, started = 0, skipped = 0 } = notice;
  for (;;) {
    const batch = await startNoticeBatch({
      noticeKey,
      subject,
      html,
      after,
      limit: BATCH,
    });
    started += batch.started;
    skipped += batch.skipped;
    if (!batch.next) {
      break;
    }
    after = batch.next;
    if (batch.started) {
      await sleep(PAUSE);
    }
    if (workflowInfo().continueAsNewSuggested) {
      return await continueAsNew<typeof sendNoticeWorkflowV1>({
        ...notice,
        after,
        started,
        skipped,
      });
    }
  }
  log.info('Service notice fan-out finished', { noticeKey, started, skipped });
}

/**
 * One account's notice, under the id `notice:<noticeKey>:<userId>`, started
 * with ALLOW_DUPLICATE_FAILED_ONLY: the same notice starts again for an
 * account only after its run failed.
 */
export async function sendNoticeEmailWorkflowV1(email: NoticeEmail) {
  await sendNoticeEmail(email);
}
