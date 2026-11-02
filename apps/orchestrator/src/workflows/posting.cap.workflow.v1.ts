import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';

const { warnNearPostingAccountCaps } = proxyActivities<IntegrationsActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '5 minutes',
  },
});

// Once a day, compares how many accounts posted through PostQueen on each
// platform that caps it with that cap, and warns the alerts channel from
// half of it. Same shape as `billingReconcileWorkflowV1`: a failed run is
// swallowed so the next day still happens, and the history is handed over
// with `continueAsNew`. A retried run can only repeat a warning.
const RUNS_BEFORE_RESET = 30;

export async function postingCapWorkflowV1() {
  for (let run = 0; run < RUNS_BEFORE_RESET; run++) {
    try {
      await warnNearPostingAccountCaps();
    } catch (err) {}
    await sleep('1 day');
  }
  return await continueAsNew();
}
