import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

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
