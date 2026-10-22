import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import {
  NoticeBatch,
  NoticeEmail,
  NoticesService,
} from '@gitroom/nestjs-libraries/database/prisma/notices/notices.service';

// The service notice's two calls (POST /admin/notices). Each takes a single
// object, so a field can be added later without a new activity.
@Injectable()
@Activity()
export class NoticeActivity {
  constructor(private _noticesService: NoticesService) {}

  // Starts one email workflow per account for the next page of accounts.
  @ActivityMethod()
  async startNoticeBatch(batch: NoticeBatch) {
    return this._noticesService.startNoticeBatch(batch);
  }

  // Sends one account its notice and records the proof; runs on the bulk
  // email queue, under its rate limit.
  @ActivityMethod()
  async sendNoticeEmail(email: NoticeEmail) {
    return this._noticesService.sendNoticeEmail(email);
  }
}
