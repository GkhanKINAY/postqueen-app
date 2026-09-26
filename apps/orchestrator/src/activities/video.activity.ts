import { HttpException, Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { Context } from '@temporalio/activity';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';

@Injectable()
@Activity()
export class VideoActivity {
  constructor(
    private _mediaService: MediaService,
    private _organizationService: OrganizationService
  ) {}

  @ActivityMethod()
  async generateVideo(organizationId: string, body: VideoDto) {
    // credits are checked against the subscription, so it has to be loaded with the org
    const org = await this._organizationService.getOrgByIdWithSubscription(
      organizationId
    );
    if (!org) {
      throw new Error('Organization not found');
    }

    try {
      // The job's id keys the charge, so it is taken once for this video.
      return await this._mediaService.generateVideo(
        org,
        body,
        Context.current().info.workflowExecution.workflowId
      );
    } catch (err) {
      // only the message survives the workflow failure, so the credits
      // refusal is passed on as its readable message
      if (err instanceof HttpException && err.getStatus() === 402) {
        const response = err.getResponse() as { message?: string } | string;
        throw new Error(
          (typeof response === 'object' && response?.message) ||
            'Not enough credits for this video.'
        );
      }
      throw err;
    }
  }
}
