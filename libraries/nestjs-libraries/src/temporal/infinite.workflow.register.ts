import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { accountPurgeMode } from '@gitroom/helpers/utils/account.purge.mode';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (!!process.env.RUN_CRON) {
      try {
        // v2, and a new workflow id with it. The id has to change: v1 is an
        // unbounded `while (true)` that never closes on its own, so starting v2
        // under the same id would be rejected as already-running and the old,
        // fragile execution would simply carry on. With a distinct id the two
        // can overlap for one deploy, which is why the v1 singleton is
        // terminated by hand as part of shipping this.
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('missingPostWorkflowV2', {
            workflowId: 'missing-post-workflow-v2',
            taskQueue: 'main',
          });
      } catch (err) {
        // Already running is the normal case on every restart after the first.
      }

      try {
        // Takes the deferred founding fee once a trial has ended, instead of
        // only when the customer next opens the app.
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('foundingFeeWorkflow', {
            workflowId: 'founding-fee-sweep',
            taskQueue: 'main',
          });
      } catch (err) {
        // Already running, as above.
      }

      try {
        // Revokes plans Stripe no longer backs, once a day.
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('billingReconcileWorkflowV1', {
            workflowId: 'billing-reconcile-v1',
            taskQueue: 'main',
          });
      } catch (err) {
        // Already running, as above.
      }

      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('analyticsSyncWorkflowV1', {
            workflowId: 'analytics-sync-workflow-v1',
            taskQueue: 'main',
          });
      } catch (err) {
        // Already running, as above.
      }
    }

    // Its own switch rather than RUN_CRON: turning RUN_CRON on also starts
    // the founding-fee charges and the missing-post recovery, a separate
    // decision. Unset means off and nothing starts. Once started, the
    // orchestrator reads the mode on every run, so going from dry-run to on
    // (or back to off) is an environment change on the orchestrator.
    if (accountPurgeMode() !== 'off') {
      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('accountPurgeWorkflowV1', {
            workflowId: 'account-purge-v1',
            taskQueue: 'main',
          });
      } catch (err) {
        // Already running, as above.
      }
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
