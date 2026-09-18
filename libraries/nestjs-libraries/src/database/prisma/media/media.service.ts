import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import {
  ImageOrientation,
  OpenaiService,
} from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  spooledFile,
  uploadTempDir,
} from '@gitroom/nestjs-libraries/upload/uploaded.file';
import { promises as fsp } from 'fs';
import { dirname } from 'path';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';

/**
 * Whether this video type is held back because the organization is still on
 * trial.
 *
 * The `isBillingEnabled()` half is the part that was missing. Every new
 * organization is written `isTrailing: true` for seven days
 * (`organization.repository.ts`), and `auth.middleware.ts` derives the live flag
 * from that without consulting billing — so on an install with no Stripe keys
 * the first week of every account was told to "finish your trial" and sent to a
 * billing page that cannot take money. There is no trial to finish when there
 * is nothing to buy.
 *
 * `integration.service.ts`'s `assertConnectAllowed` is the same rule written
 * correctly; this is that guard applied to video generation.
 */
const isTrialLocked = (
  video: { trial?: boolean },
  org: { isTrailing?: boolean }
) => isBillingEnabled() && !video.trial && !!org.isTrailing;

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _temporalService: TemporalService
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  findOwnedMediaIds(org: string, ids: string[]) {
    return this._mediaRepository.findOwnedMediaIds(org, ids);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean,
    orientation?: ImageOrientation
  ) {
    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
          }
          return this._openAi.generateImage(prompt, orientation);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  /**
   * One AI image from a brief, expanded into a full render prompt first, then
   * hosted and saved to the media library: the path the AI Image modal, the
   * composer's rail and the agent's tool share. Returns the media row.
   */
  async generateImageToLibrary(
    org: Organization,
    brief: string,
    orientation?: ImageOrientation
  ) {
    const image = await this.generateImage(brief, org, true, orientation);
    const file = await this.storage.uploadSimple(
      'data:image/png;base64,' + image
    );
    return this.saveFile(org.id, file.split('/').pop(), file);
  }

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize?: number
  ) {
    return this._mediaRepository.saveFile(
      org,
      fileName,
      filePath,
      originalName,
      fileSize
    );
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (isTrialLocked(video, org)) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  private async validateVideoRequest(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new Error(`Video type ${body.type} not found`);
    }

    if (isTrialLocked(video, org)) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    await video.instance.processAndValidate(body.customParams);
    return video;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const video = await this.validateVideoRequest(org, body);

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const produced = await video.instance.process(
            body.output,
            body.customParams
          );
          // A provider's own URL is fetched into storage; a file the
          // generator rendered here is moved in and its directory dropped.
          if (typeof produced === 'string') {
            const file = await this.storage.uploadSimple(produced);
            return this.saveFile(org.id, file.split('/').pop(), file);
          }
          try {
            // The size is read before the upload: local storage renames
            // the file into place, so nothing is there to stat afterwards.
            const rendered = spooledFile(produced.localPath, 'video/mp4', 'video.mp4');
            const uploaded = await this.storage.uploadFile(rendered);
            return this.saveFile(
              org.id,
              uploaded.originalname,
              uploaded.path,
              undefined,
              rendered.size
            );
          } finally {
            // The generator's own directory goes with the file. A file
            // dropped straight into the spool directory takes only itself.
            const dir = dirname(produced.localPath);
            await fsp.rm(dir === uploadTempDir() ? produced.localPath : dir, {
              recursive: true,
              force: true,
            });
          }
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  // Generating a video takes minutes, longer than an MCP request can stay open,
  // so the generation runs in a workflow and the caller polls its status by job id
  async startGenerateVideo(org: Organization, body: VideoDto) {
    // validated here as well as in the workflow so bad input fails before a job exists
    try {
      await this.validateVideoRequest(org, body);
    } catch (err) {
      throw generationError(err);
    }

    const client = this._temporalService.client.getRawClient();
    if (!client) {
      throw new HttpException('Video generation is not available', 503);
    }

    const jobId = `video_${org.id}_${makeId(10)}`;
    await client.workflow.start('generateVideoWorkflow', {
      workflowId: jobId,
      taskQueue: 'main',
      args: [
        {
          organizationId: org.id,
          body,
        },
      ],
      typedSearchAttributes: new TypedSearchAttributes([
        {
          key: organizationId,
          value: org.id,
        },
      ]),
    });

    return { jobId };
  }

  async getGenerateVideoStatus(
    org: Organization,
    jobId: string
  ): Promise<{
    status: 'pending' | 'completed' | 'failed';
    id?: string;
    path?: string;
    /** From the live row: a poster made by an earlier reader stays. */
    thumbnail?: string | null;
    alt?: string | null;
    error?: string;
  }> {
    // the job id carries the organization, so one org can't poll another's job
    if (!jobId.startsWith(`video_${org.id}_`)) {
      throw new HttpException('Video job not found', 404);
    }

    const handle = await this._temporalService.client.getWorkflowHandle(jobId);
    let status: string;
    try {
      status = (await handle.describe()).status.name;
    } catch (err) {
      throw new HttpException('Video job not found', 404);
    }

    if (status === 'RUNNING') {
      return { status: 'pending' };
    }

    try {
      const media = (await handle.result()) as Awaited<
        ReturnType<MediaService['saveFile']>
      >;
      // The workflow's result is the row as it was saved; the poster and alt
      // text written since live on the row, and a card drawn again for a
      // finished job must not make a second poster over them.
      const row = await this._mediaRepository.getMediaById(media.id);
      return {
        status: 'completed',
        id: media.id,
        path: media.path,
        thumbnail: row?.thumbnail ?? null,
        alt: row?.alt ?? null,
      };
    } catch (err) {
      // the workflow failure wraps the activity failure which wraps the actual error
      let cause: any = err;
      while (cause?.cause && cause.cause !== cause) {
        cause = cause.cause;
      }
      return {
        status: 'failed',
        error: cause?.message || String(err),
      };
    }
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
