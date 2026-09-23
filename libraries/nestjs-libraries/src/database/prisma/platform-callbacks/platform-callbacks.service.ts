import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PlatformCallbacksRepository } from '@gitroom/nestjs-libraries/database/prisma/platform-callbacks/platform-callbacks.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

/**
 * What a platform tells us about one of its users, outside any session: that
 * they asked for their data to be deleted, or that they removed the app.
 * Which platform, and how its request is signed, is the provider's business
 * (`verifyPlatformCallback`); everything here works on the channels it names.
 */
@Injectable()
export class PlatformCallbacksService {
  constructor(
    private _platformCallbacksRepository: PlatformCallbacksRepository,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}

  // Removes every channel the user connected, the way removing it in the app
  // does, then erases what the channel arrived with. Channels a workspace had
  // already removed still hold that, so they are erased too. The platform
  // hands the confirmation code and the status link to the user.
  async deletion(provider: string, signedRequest: string) {
    const { providers, platformUserId } = await this.verify(
      provider,
      signedRequest
    );

    const channels =
      await this._integrationService.getIntegrationsByPlatformUser(
        providers,
        platformUserId
      );

    const confirmationCode = makeId(16);
    const request =
      await this._platformCallbacksRepository.createDeletionRequest({
        provider,
        platformUserHash: this.hashValue(platformUserId),
        confirmationCode,
        channels: channels.length,
      });

    // One channel that fails must not stop the others. The request is then
    // left in progress, which is what its status page says, and the log names
    // the channel (never the person) for someone to finish it by hand.
    let failed = 0;
    for (const channel of channels) {
      try {
        if (!channel.deletedAt) {
          await this.removeChannel(channel.organizationId, channel.id);
        }
        await this._integrationService.eraseChannelData(
          channel.organizationId,
          channel.id
        );
      } catch (err) {
        failed++;
        Logger.error(
          `Platform deletion ${request.id} could not erase channel ${
            channel.id
          }: ${(err as Error)?.message || err}`
        );
      }
    }

    if (!failed) {
      await this._platformCallbacksRepository.completeDeletionRequest(
        request.id
      );
    }

    return {
      url: `${process.env.FRONTEND_URL}/data-deletion/${confirmationCode}`,
      confirmation_code: confirmationCode,
    };
  }

  // The user removed the app, so every token it issued them is dead. Their
  // live channels go through the same path as a failed refresh: flagged for
  // reconnection, and the workspace told. One already flagged was already
  // told, and one still waiting for its page to be picked is not a channel
  // anyone publishes through yet.
  async deauthorize(provider: string, signedRequest: string) {
    const { providers, platformUserId } = await this.verify(
      provider,
      signedRequest
    );

    const channels =
      await this._integrationService.getIntegrationsByPlatformUser(
        providers,
        platformUserId
      );

    for (const channel of channels) {
      if (
        channel.deletedAt ||
        channel.refreshNeeded ||
        channel.inBetweenSteps
      ) {
        continue;
      }
      await this._integrationService.disconnectChannel(
        channel.organizationId,
        channel,
        'access removed on the platform'
      );
    }

    return { success: true };
  }

  async deletionStatus(confirmationCode: string) {
    const request = await this._platformCallbacksRepository.getDeletionRequest(
      confirmationCode
    );
    if (!request) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }

    return request;
  }

  // The same steps as removing a channel in the app
  // (IntegrationsController.deleteChannel): its posts first, so no workflow
  // is left to publish, then the channel and its credentials.
  private async removeChannel(org: string, id: string) {
    const posts = await this._integrationService.getPostsForChannel(org, id);
    if (posts.length) {
      await this._postsService.deletePostsByGroups(
        org,
        posts.map((post) => post.group)
      );
    }

    await this._integrationService.deleteChannel(org, id);
  }

  private async verify(provider: string, signedRequest: string) {
    const integrationProvider =
      this._integrationManager.getSocialIntegration(provider);
    if (!integrationProvider?.verifyPlatformCallback) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }

    const verified = await integrationProvider.verifyPlatformCallback(
      signedRequest
    );
    if (!verified) {
      throw new HttpException('Invalid signed request', HttpStatus.BAD_REQUEST);
    }

    return {
      platformUserId: verified.platformUserId,
      providers: await this._integrationManager.getPlatformCallbackProviders(
        signedRequest,
        verified.platformUserId
      ),
    };
  }

  private hashValue(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
