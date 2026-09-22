import {
  continueAsNew,
  log,
  proxyActivities,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import type { AccountPurgeActivity } from '@gitroom/orchestrator/activities/account-purge.activity';

// Listing is a few queries and sends no heartbeat.
const { listAccountPurgeTargets } = proxyActivities<AccountPurgeActivity>({
  startToCloseTimeout: '2 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// One bounded batch, heartbeating with the step it is on.
const { purgeAccountStep } = proxyActivities<AccountPurgeActivity>({
  startToCloseTimeout: '10 minute',
  heartbeatTimeout: '2 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Once a day, removes what deleted accounts leave behind: quiesce every
// deleted organization, then purge the ones past their grace, then scrub the
// deleted users. Same shape as `analyticsSyncWorkflowV1`: one target's failure
// is logged and the rest carry on, a failed run is swallowed so the next day
// still happens, and the history is handed over with `continueAsNew`. Each
// step is one bounded batch and the purge is idempotent, so a step retried or
// cut off resumes on the next call.
const RUNS_BEFORE_RESET = 30;
// Batches for one target in one run. A bigger backlog carries on tomorrow.
const STEPS_PER_TARGET = 100;

export async function accountPurgeWorkflowV1() {
  for (let run = 0; run < RUNS_BEFORE_RESET; run++) {
    // The first run works through every account deleted before the purge
    // existed, which can outgrow one history. It is handed over at once, not
    // after a day's sleep: the next execution lists again, and what is done
    // has dropped off the list. Outside the try below, which would otherwise
    // swallow the continue-as-new.
    let handOver = false;
    try {
      const targets = await listAccountPurgeTargets();
      for (const target of targets) {
        if (workflowInfo().continueAsNewSuggested) {
          handOver = true;
          break;
        }
        try {
          for (let step = 0; step < STEPS_PER_TARGET; step++) {
            const { done } = await purgeAccountStep(target);
            if (done) {
              break;
            }
          }
        } catch (err) {
          log.warn('Account purge step failed', {
            kind: target.kind,
            id: target.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      log.error('Could not list account purge targets', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (handOver) {
      return await continueAsNew();
    }
    await sleep('1 day');
    if (workflowInfo().continueAsNewSuggested) {
      break;
    }
  }

  return await continueAsNew();
}
