import { proxyActivities, sleep } from '@temporalio/workflow';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';

const { sendStreakEnded, setStreak } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
});

/**
 * v2 with the email written by an activity, which can read how long the
 * streak ran: the workflow only says when it ended.
 */
export async function streakWorkflowV3({
  organizationId,
}: {
  organizationId: string;
}) {
  await setStreak(organizationId, 'start');
  await sleep(86400000);
  await sendStreakEnded(organizationId);
  await setStreak(organizationId, 'end');
}
