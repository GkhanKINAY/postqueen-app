import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
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
    private _videoManager: VideoManager
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

  /**
   * Generate a picture on our own OpenAI key, and charge a credit for it.
   *
   * The allowance check belongs here rather than in the controller, which is
   * where it used to live alone. `POST /media/generate-image` was never the
   * only caller: the MCP `generateImageTool` and the in-app assistant both
   * reach this method directly, so an agent could generate past the plan's
   * monthly count with nothing to stop it while the same request from the
   * media library was refused. `generateVideo` below always checked in the
   * service, which is why videos never had the hole.
   *
   * Putting a picture the customer already has into the library costs nothing
   * and always did: the upload routes and `uploadFromUrlTool` never touch
   * credits. The charge is for generating on our key, not for storing a file.
   *
   * TWO THINGS THAT LOOK WRONG AND ARE NOT
   *
   *   isBillingEnabled   with no Stripe keys an organization has no
   *                      subscription, `checkCredits` reads that as FREE and
   *                      returns zero, so a self-hosted install would refuse
   *                      every generation it is entitled to make. The
   *                      controller's copy of this check guards for the same
   *                      reason.
   *   throwing in `try`  the catch runs everything through `generationError`,
   *                      which returns an HttpException untouched rather than
   *                      wrapping it. That is why `generateVideo` throws from
   *                      inside its own try as well.
   *
   * The controller keeps its own check on purpose. It answers `false` instead
   * of throwing and `ai.image.tsx` reads that as "no image", so folding it into
   * this one would turn a handled empty response into a 402 the picture flow
   * does not expect.
   */
  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    try {
      if (isBillingEnabled()) {
        const totalCredits = await this._subscriptionService.checkCredits(
          org,
          'ai_images'
        );

        if (totalCredits.credits <= 0) {
          throw new SubscriptionException({
            action: AuthorizationActions.Create,
            section: Sections.IMAGES_PER_MONTH,
          });
        }
      }

      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
          }
          return this._openAi.generateImage(prompt);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
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

  async generateVideo(org: Organization, body: VideoDto) {
    try {
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
        throw new HttpException(
          'This video is not available in trial mode',
          406
        );
      }

      await video.instance.processAndValidate(body.customParams);

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const loadedData = await video.instance.process(
            body.output,
            body.customParams
          );

          const file = await this.storage.uploadSimple(loadedData);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      throw generationError(err);
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
