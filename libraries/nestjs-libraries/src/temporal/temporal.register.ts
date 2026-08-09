import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { Connection } from '@temporalio/client';

@Injectable()
export class TemporalRegister implements OnModuleInit {
  constructor(private _client: TemporalService) {}

  /**
   * Registers the two custom search attributes every post workflow is started
   * and cancelled by.
   *
   * This used to return early whenever `TEMPORAL_TLS` was set, which reads as
   * "managed Temporal registers these for you" and is not true — Temporal Cloud
   * requires them to be created explicitly too. On a TLS install the attributes
   * were therefore never registered, and since both the start path and the
   * terminate sweep address workflows through them, nothing would schedule and
   * nothing would cancel. Silently: neither path treats a missing attribute as
   * an error.
   *
   * The guard was presumably there because a failure here throws out of
   * `onModuleInit` and takes the boot with it. That is the part worth keeping,
   * so the call is wrapped instead of skipped: an install that cannot register
   * them logs and continues, exactly as a TLS install did before, while one
   * that can now actually does.
   */
  async onModuleInit(): Promise<void> {
    try {
      const connection = this._client?.client?.getRawClient()
        ?.connection as Connection;

      const { customAttributes } =
        await connection.operatorService.listSearchAttributes({
          namespace: process.env.TEMPORAL_NAMESPACE || 'default',
        });

      const neededAttribute = ['organizationId', 'postId'];
      const missingAttributes = neededAttribute.filter(
        (attr) => !customAttributes[attr]
      );

      if (missingAttributes.length > 0) {
        await connection.operatorService.addSearchAttributes({
          namespace: process.env.TEMPORAL_NAMESPACE || 'default',
          searchAttributes: missingAttributes.reduce((all, current) => {
            // @ts-ignore
            all[current] = 1;
            return all;
          }, {}),
        });
      }
    } catch (err) {
      console.error(
        '[temporal] could not register search attributes; scheduling and cancellation will not work until they exist',
        err
      );
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [TemporalRegister],
  get exports() {
    return this.providers;
  },
})
export class TemporalRegisterMissingSearchAttributesModule {}
