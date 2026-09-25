import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { CreditGrantsActivity } from '@gitroom/orchestrator/activities/credit.grants.activity';

const { grantScheduledCredits } = proxyActivities<CreditGrantsActivity>({
  startToCloseTimeout: '30 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '5 minutes',
  },
});

// Once a day, gives each plan the credits no invoice brings: a founding
// member's month, the monthly gift, and a Stripe period whose webhook was
// lost. Same shape as `billingReconcileWorkflowV1`: a failed run is swallowed
// so the next day still happens, and the history is handed over with
// `continueAsNew`. Every grant is keyed, so an overlapping or retried run
// cannot grant twice.
const RUNS_BEFORE_RESET = 30;

export async function creditGrantsWorkflowV1() {
  for (let run = 0; run < RUNS_BEFORE_RESET; run++) {
    try {
      await grantScheduledCredits();
    } catch (err) {}
    await sleep('1 day');
  }
  return await continueAsNew();
}
