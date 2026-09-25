import { proxyActivities, sleep } from '@temporalio/workflow';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';
import { emailContent } from '@gitroom/nestjs-libraries/emails/email.content';

const { sendEmailAsync, getUserOrgs, setStreak } =
  proxyActivities<EmailActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue: 'main',
    cancellationType: 'ABANDON',
  });

/**
 * v1 with the redesigned email: the same 24 hours after the last published
 * post, from the notifications address, drawn like every other email.
 */
export async function streakWorkflowV2({
  organizationId,
}: {
  organizationId: string;
}) {
  await setStreak(organizationId, 'start');
  await sleep(86400000);
  const userOrgs = await getUserOrgs(organizationId);

  for (const user of userOrgs?.users || []) {
    if (!user.user.sendStreakEmails) {
      continue;
    }
    await sendEmailAsync(
      user.user.email,
      'Your posting streak ended',
      emailContent({
        stream: 'notifications',
        category: 'Streak',
        preheader:
          'Nothing went out in the last 24 hours. One post today starts a new streak.',
        tone: 'streak',
        icon: 'flame',
        title: 'Start a new streak',
        accent: 'today.',
        lead: 'Nothing was published in the last 24 hours, so your posting streak ended.',
        blocks: [
          {
            type: 'button',
            link: { label: 'Schedule a post', url: '/launches' },
          },
        ],
        footer: 'streak',
      }),
      'bottom',
    );
  }

  await setStreak(organizationId, 'end');
}
