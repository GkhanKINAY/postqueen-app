import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';

const { searchForMissingThreeHoursPosts } = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Same two faults `autoPostWorkflowV2` was written for, and the same shape of
// fix — but on the one workflow whose job is to catch everything else, so both
// cost more here.
//
// v1 had no try/catch. Once the activity exhausted its three attempts the throw
// left the loop, the execution closed, and the product's only recovery
// mechanism was gone until someone restarted the backend — `onModuleInit` in
// infinite.workflow.register is the only thing that ever starts it. Nothing
// logged, nothing alerted, and the symptom is posts quietly not going out.
//
// v1 also ran `while (true)` with no handoff, so history grew until Temporal
// terminated the execution. Same silent outcome, on a delay measured in months.
//
// The swallow is deliberate: the activity has already retried three times over
// six minutes, and a sweep that misses one hour and runs the next is the whole
// point of a safety net. A sweep that dies is not.
const RUNS_BEFORE_RESET = 24 * 7;

export async function missingPostWorkflowV2() {
  for (let run = 0; run < RUNS_BEFORE_RESET; run++) {
    try {
      await searchForMissingThreeHoursPosts();
    } catch (err) {}
    await sleep('1 hour');
  }

  return await continueAsNew();
}
