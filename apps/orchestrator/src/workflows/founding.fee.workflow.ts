import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { FoundingFeeActivity } from '@gitroom/orchestrator/activities/founding.fee.activity';

const { settleDueFoundingFees } = proxyActivities<FoundingFeeActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Takes the deferred founding fee once a trial has ended, rather than waiting
// for the customer to come back to the app. Same shape as
// `missingPostWorkflowV2`, for the same reasons: a failed run is swallowed so
// the next hour still happens, and the history is handed over with
// `continueAsNew` before it can grow without bound. Settling is idempotent, so
// a retried or overlapping run cannot charge twice.
const RUNS_BEFORE_RESET = 24 * 7;

export async function foundingFeeWorkflow() {
  for (let run = 0; run < RUNS_BEFORE_RESET; run++) {
    try {
      await settleDueFoundingFees();
    } catch (err) {}
    await sleep('1 hour');
  }
  return await continueAsNew();
}
