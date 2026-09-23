import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AccountPurgeService } from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.service';
import { AccountPurgeKind } from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.plan';
import {
  setHeartbeatDetails,
  withHeartbeat,
} from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';

// The account purge's two calls. A step takes a single object so a field can
// be added later without a new activity. ACCOUNT_PURGE_MODE is read by the
// service on every call, so switching between off, dry-run and on is an
// environment change and never a workflow change.
@Injectable()
@Activity()
export class AccountPurgeActivity {
  constructor(private _accountPurgeService: AccountPurgeService) {}

  @ActivityMethod()
  async listAccountPurgeTargets() {
    return this._accountPurgeService.listTargets();
  }

  // One bounded batch for one organization or user; heartbeats with the step
  // it is on, so a worker that dies is noticed and the batch runs again.
  @ActivityMethod()
  async purgeAccountStep({ kind, id }: { kind: AccountPurgeKind; id: string }) {
    return withHeartbeat(() =>
      this._accountPurgeService.purgeStep(kind, id, (stage) =>
        setHeartbeatDetails(`purgeAccountStep ${kind} ${id}: ${stage}`)
      )
    );
  }
}
