import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';

const { autoPost } = proxyActivities<AutopostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// One hourly iteration costs ~13-14 history events, not 4: two workflow-task
// triples around the activity, the activity triple itself, and the timer pair —
// more when the activity burns its retries. `autoPostWorkflow` (v1) accumulates
// them until Temporal terminates the execution, at which point the rule stops
// running while the UI still shows it active. Hand off every RUNS_BEFORE_RESET
// hours so history stays bounded.
//
// A week keeps a run near 2.5k events, well under the ~10k point where Temporal
// starts suggesting continue-as-new. 24 * 30 sat right on that threshold.
//
// v1 is deliberately left in place and still exported: executions started
// against it keep replaying their own code. `processCron` starts this one, and
// its TERMINATE_EXISTING policy migrates a rule to v2 the next time it is saved
// or toggled.
const RUNS_BEFORE_RESET = 24 * 7;

export async function autoPostWorkflowV2({
  id,
  immediately,
}: {
  id: string;
  immediately: boolean;
}) {
  for (let run = 0; run < RUNS_BEFORE_RESET; run++) {
    try {
      if (immediately) {
        await autoPost(id);
      }
    } catch (err) {}
    immediately = true;
    await sleep(3600000);
  }

  return await continueAsNew({ id, immediately: true });
}
