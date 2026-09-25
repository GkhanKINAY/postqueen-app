import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { BillingReconcileActivity } from '@gitroom/orchestrator/activities/billing.reconcile.activity';

const { reconcileStripeSubscriptions } =
  proxyActivities<BillingReconcileActivity>({
    startToCloseTimeout: '30 minute',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '5 minutes',
    },
  });

// Once a day, revokes local Stripe plans whose subscription Stripe no longer
// considers entitled. Same shape as `foundingFeeWorkflow`: a failed run is
// swallowed so the next day still happens, and the history is handed over
// with `continueAsNew`. The revoke is idempotent, so an overlapping or retried
// run cannot do harm.
const RUNS_BEFORE_RESET = 30;

export async function billingReconcileWorkflowV1() {
  for (let run = 0; run < RUNS_BEFORE_RESET; run++) {
    try {
      await reconcileStripeSubscriptions();
    } catch (err) {}
    await sleep('1 day');
  }
  return await continueAsNew();
}
