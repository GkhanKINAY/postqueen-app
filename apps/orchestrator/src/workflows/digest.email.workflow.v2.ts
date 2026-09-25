import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import { digestItemsSignal } from '@gitroom/orchestrator/signals/email.v2.signal';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';
import {
  DigestItem,
  digestEmail,
  emailContent,
} from '@gitroom/nestjs-libraries/emails/email.content';

const { getUserOrgs, sendEmailAsync } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

/**
 * The hourly publishing summary. Same rhythm as v1 (the first notice starts an
 * hour, everything that arrives in it goes out together), but it sends one
 * drawn email, what needs attention first, where v1 joined raw messages.
 */
export async function digestEmailWorkflowV2({
  organizationId,
  queue = [],
}: {
  organizationId: string;
  queue?: DigestItem[];
}) {
  setHandler(digestItemsSignal, (data) => {
    queue.push(...data);
  });

  while (true) {
    await condition(() => queue.length > 0);
    await sleep(3600000);

    // Take a snapshot batch and immediately clear queue.
    const batch = queue.splice(0, queue.length);
    queue = [];

    const org = await getUserOrgs(organizationId);

    for (const user of org?.users || []) {
      const toSend = batch.filter(
        (item) =>
          item.type === 'info' ||
          (item.type === 'fail' && user.user.sendFailureEmails) ||
          (item.type === 'success' && user.user.sendSuccessEmails),
      );

      if (toSend.length === 0) continue;

      const { subject, content } = digestEmail(toSend);
      await sendEmailAsync(
        user.user.email,
        subject,
        emailContent(content),
        'bottom',
      );
    }

    return await continueAsNew({
      organizationId,
      queue,
    });
  }
}
