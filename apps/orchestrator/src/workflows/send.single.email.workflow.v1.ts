import { proxyActivities } from '@temporalio/workflow';
import type { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';
import type { SendEmail } from '@gitroom/orchestrator/signals/send.email.signal';
import { emailQueues } from '@gitroom/nestjs-libraries/temporal/email.queues';

const { sendEmail: sendPriorityEmail } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: emailQueues.priority.taskQueue,
  cancellationType: 'ABANDON',
});

const { sendEmail: sendBulkEmail } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: emailQueues.bulk.taskQueue,
  cancellationType: 'ABANDON',
});

// One execution per email. It replaces the `send_email` singleton
// (`sendEmailWorkflow`), which held every email in one queue and slept 700ms
// between sends: the Resend rate limit is now enforced by the Temporal server
// on the two email task queues, and 'top' keeps its head start by having a
// queue of its own instead of jumping the line.
export async function sendSingleEmailWorkflowV1(email: SendEmail) {
  const send = email.addTo === 'top' ? sendPriorityEmail : sendBulkEmail;
  await send(email.to, email.subject, email.html, email.replyTo);
}
