import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  AuthTokenDetails,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { TemporalService } from 'nestjs-temporal-core';
import dayjs from 'dayjs';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { timer } from '@gitroom/helpers/utils/timer';

const DAY_SECONDS = 24 * 60 * 60;
// Channels whose name and picture are read again in one hourly run, so a
// backlog (a new provider setting, a cleared Redis) spreads over a few hours,
// and the time those reads may take, well inside the listing activity's
// 10-minute limit. A read that hangs is given up after 20 seconds.
const PROFILE_READS_PER_RUN = 25;
const PROFILE_RUN_BUDGET_MS = 3 * 60 * 1000;
const PROFILE_READ_TIMEOUT_MS = 20 * 1000;

@Injectable()
export class RefreshIntegrationService {
  constructor(
    private _integrationManager: IntegrationManager,
    @Inject(forwardRef(() => IntegrationService))
    private _integrationService: IntegrationService,
    private _temporalService: TemporalService
  ) {}
  async refresh(integration: Integration, cause = ''): Promise<false | AuthTokenDetails> {
    // A removed channel stays removed: the write below would bring the row
    // back, and a failure would ask the person to reconnect it.
    if (integration.deletedAt) {
      return false as const;
    }

    const socialProvider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const refresh = await this.refreshProcess(integration, socialProvider, cause);

    if (!refresh) {
      return false as const;
    }

    await this._integrationService.createOrUpdateIntegration(
      undefined,
      !!socialProvider.oneTimeToken,
      integration.organizationId,
      integration.name,
      integration.picture!,
      'social',
      integration.internalId,
      integration.providerIdentifier,
      refresh.accessToken,
      refresh.refreshToken,
      refresh.expiresIn
    );

    return refresh;
  }

  // Whether a channel's token is past the expiry stored with it and has to be
  // refreshed before it is used. A provider whose token never expires is
  // never due, whatever date its rows carry from before it said so.
  isExpired(integration: Integration) {
    const socialProvider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (socialProvider?.tokenNeverExpires) {
      return false;
    }

    return dayjs(integration.tokenExpiration).isBefore(dayjs());
  }

  public async setBetweenSteps(integration: Integration, cause = '') {
    await this._integrationService.setBetweenRefreshSteps(integration.id);
    await this._integrationService.informAboutRefreshError(
      integration.organizationId,
      integration,
      cause
    );
  }

  // A provider with profileRetentionDays may keep a connected channel's name
  // and picture only that long, so the hourly run reads them again once that
  // much time has passed, a few channels per run and within a time budget, so
  // the analytics listing that runs it is never held up. A channel whose read
  // fails, or whose picture could not be copied, is tried again a day later.
  async refreshDueProfiles() {
    const stopAt = Date.now() + PROFILE_RUN_BUDGET_MS;
    let reads = 0;
    for (const identifier of this._integrationManager.getAllowedSocialsIntegrations()) {
      const provider = this._integrationManager.getSocialIntegration(identifier);
      const days = provider?.profileRetentionDays;
      if (!days || !provider.fetchPageInformation) {
        continue;
      }

      const channels =
        await this._integrationService.listProfileRefreshCandidates(identifier);
      for (const channel of channels) {
        if (reads >= PROFILE_READS_PER_RUN || Date.now() > stopAt) {
          return;
        }
        const key = `integration:profile-read:${channel.id}`;
        if (await ioRedis.get(key)) {
          continue;
        }
        reads++;

        let ok = false;
        try {
          let token = channel.token;
          if (this.isExpired(channel)) {
            // A refresh that throws found the token working but the channel
            // gone from the account. For a provider whose terms limit what a
            // disconnected channel keeps, it then waits for its person, as
            // when a post finds it so, and its data goes in time; otherwise
            // it is read again a day later, as before.
            const refreshed = await this.refresh(channel).catch(
              async (err: Error) => {
                if (!provider.disconnectedDataRetentionDays) {
                  throw err;
                }
                await this.setBetweenSteps(channel, err?.message || '');
                return false as const;
              }
            );
            token = refreshed ? refreshed.accessToken : '';
            if (token && provider.refreshWait) {
              await timer(10000);
            }
          }
          const page = token
            ? await Promise.race([
                provider.fetchPageInformation(token, {
                  page: channel.internalId,
                }),
                timer(PROFILE_READ_TIMEOUT_MS).then(() => undefined),
              ])
            : undefined;
          if (page?.name && String(page.id) === channel.internalId) {
            const { copyFailed } =
              await this._integrationService.refreshProfile(channel.id, {
                name: page.name,
                picture: page.picture,
                profile: page.username,
              });
            ok = !copyFailed;
          }
        } catch {
          // tried again below, a day later
        }

        // Read again a day before the limit, so the stored copy is never older
        await ioRedis.set(
          key,
          '1',
          'EX',
          ok ? (days - 1) * DAY_SECONDS : DAY_SECONDS
        );
      }
    }
  }

  public async startRefreshWorkflow(orgId: string, id: string, integration: SocialProvider) {
    if (!integration.refreshCron) {
      return false;
    }

    return this._temporalService.client
      .getRawClient()
      ?.workflow.start(`refreshTokenWorkflow`, {
        workflowId: `refresh_${id}`,
        args: [{integrationId: id, organizationId: orgId}],
        taskQueue: 'main',
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
      });
  }

  private async refreshProcess(
    integration: Integration,
    socialProvider: SocialProvider,
    cause = ''
  ): Promise<AuthTokenDetails | false> {
    let refreshError: any = undefined;
    const refresh: false | AuthTokenDetails = await socialProvider
      .refreshToken(integration.refreshToken)
      .catch((err) => {
        refreshError = err;
        return false as const;
      });

    if (!refresh || !refresh.accessToken) {
      if (refreshError) {
        console.error(
          `Could not refresh ${integration.providerIdentifier} integration ${integration.id}`,
          [
            refreshError?.response?.data?.error,
            refreshError?.response?.data?.error_description,
          ]
            .filter((p) => typeof p === 'string')
            .join(' ') ||
            refreshError?.message ||
            String(refreshError)
        );
      }

      await this._integrationService.refreshNeeded(
        integration.organizationId,
        integration.id
      );

      // No disconnectChannel call here: it only writes the refreshNeeded flag
      // set on the line above, and it notifies again — with an empty cause —
      // so one failure produced two identical notifications and two emails.
      await this._integrationService.informAboutRefreshError(
        integration.organizationId,
        integration,
        cause,
        socialProvider.refreshErrorMessage?.(refreshError)
      );

      return false;
    }

    if (
      !socialProvider.reConnect ||
      integration.rootInternalId === integration.internalId
    ) {
      return refresh;
    }

    let reConnect;
    try {
      reConnect = await socialProvider.reConnect(
        integration.rootInternalId,
        integration.internalId,
        refresh.accessToken
      );
    } catch (err: any) {
      console.error(
        `Could not reconnect ${integration.providerIdentifier} integration ${integration.id} after a successful token refresh`,
        err?.message || String(err)
      );
      throw err;
    }

    return {
      ...refresh,
      ...reConnect,
    };
  }
}
