import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ClippingService } from '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service';
import {
  setHeartbeatDetails,
  withHeartbeat,
} from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';

// An activity on main can never change its parameters, so every one takes a
// single object of ids: the state lives on the clipping records, and a field
// can be added to the object without a new activity.
//
// analyseClipping, fetchClip and renderClip run on the `clipping` queue: each
// hands one job to the clipping processor and waits for it to finish, the way
// normalizeMedia runs on `media`. They heartbeat end to end with the stage the
// processor reports, so a worker that dies mid-job is noticed within the
// workflow's heartbeatTimeout and the job runs again. The rest is bookkeeping
// and calls to OpenAI and Deepgram, and runs on `main`.
@Injectable()
@Activity()
export class ClippingActivity {
  constructor(private _clippingService: ClippingService) {}

  @ActivityMethod()
  async analyseClipping({ clippingId }: { clippingId: string }) {
    return withHeartbeat(() =>
      this._clippingService.analyse(clippingId, (stage) =>
        setHeartbeatDetails(`analyseClipping ${clippingId}: ${stage}`)
      )
    );
  }

  @ActivityMethod()
  async transcribeClipping({ clippingId }: { clippingId: string }) {
    return this._clippingService.transcribe(clippingId);
  }

  @ActivityMethod()
  async pickClippingClips({ clippingId }: { clippingId: string }) {
    return this._clippingService.pickClips(clippingId);
  }

  @ActivityMethod()
  async fetchClip({ clipId }: { clipId: string }) {
    return withHeartbeat(() =>
      this._clippingService.fetchClip(clipId, (stage) =>
        setHeartbeatDetails(`fetchClip ${clipId}: ${stage}`)
      )
    );
  }

  @ActivityMethod()
  async captionClip({ clipId }: { clipId: string }) {
    return this._clippingService.captionClip(clipId);
  }

  @ActivityMethod()
  async renderClip({ clipId }: { clipId: string }) {
    return withHeartbeat(() =>
      this._clippingService.renderClip(clipId, (stage) =>
        setHeartbeatDetails(`renderClip ${clipId}: ${stage}`)
      )
    );
  }

  // "customer" says the error was written for the customer to read
  @ActivityMethod()
  async failClip({
    clipId,
    error,
    customer,
  }: {
    clipId: string;
    error: string;
    customer?: boolean;
  }) {
    return this._clippingService.failClip(clipId, error, customer);
  }

  @ActivityMethod()
  async createClippingDrafts({ clippingId }: { clippingId: string }) {
    return this._clippingService.createDrafts(clippingId);
  }

  @ActivityMethod()
  async finishClipping({ clippingId }: { clippingId: string }) {
    return this._clippingService.finishClipping(clippingId);
  }

  @ActivityMethod()
  async failClipping({
    clippingId,
    error,
    customer,
  }: {
    clippingId: string;
    error: string;
    customer?: boolean;
  }) {
    return this._clippingService.failClipping(clippingId, error, customer);
  }
}
