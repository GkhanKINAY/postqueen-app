import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  AuthTokenDetails,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Disconnect } from '@gitroom/nestjs-libraries/integrations/social.abstract';
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

    // The renewal is stored only under the root the channel was read with. A
    // caller holding a partial row, without that key, gets the row read
    // again: with no root the write would be a connect's, which checks none.
    if (integration.rootInternalId === undefined) {
      const row = await this._integrationService.getIntegrationById(
        integration.organizationId,
        integration.id
      );
      if (!row || row.deletedAt) {
        return false as const;
      }
      integration = { ...integration, rootInternalId: row.rootInternalId };
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
      // A root that is a page id (older channels) names no login: other
      // organizations' channels of that page can belong to other logins.
      !!socialProvider.oneTimeToken &&
        !socialProvider.isPageId?.(integration.rootInternalId || ''),
      integration.organizationId,
      integration.name,
      // The stored picture stays as it is: the copy this caller holds may be
      // older than the row's, whose file a profile read has replaced.
      undefined,
      'social',
      integration.internalId,
      integration.providerIdentifier,
      refresh.accessToken,
      refresh.refreshToken,
      refresh.expiresIn,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      // Stored only if no reconnect moved the channel meanwhile.
      integration.rootInternalId
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
            // A Disconnect from the refresh means the token works but the
            // channel is gone from the account: it then waits for its person,
            // as when a post finds it so. Any other failure is read again a
            // day later.
            const refreshed = await this.refresh(channel).catch(
              async (err: Error) => {
                if (!(err instanceof Disconnect)) {
                  throw err;
                }
                await this.setBetweenSteps(channel, err.message || '');
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
      // Two flows can refresh the same channel at once (two posts, a post and
      // analytics). A provider that replaces the refresh token on every refresh
      // rejects the second one while the first is still storing its tokens:
      // wait for them and reuse them instead of flagging the channel.
      // Both rows compared here come from Prisma reads, whose extension
      // decrypts the tokens (prisma.service.ts): every caller of refresh()
      // hands over such a row, directly or through an activity. Stored
      // ciphertext has a random IV, so it would always read as changed.
      for (let attempt = 0; attempt < 3; attempt++) {
        const stored = await this._integrationService.getIntegrationById(
          integration.organizationId,
          integration.id
        );
        if (
          !stored ||
          stored.refreshNeeded ||
          stored.inBetweenSteps ||
          stored.deletedAt
        ) {
          break;
        }
        if (
          stored.internalId === integration.internalId &&
          stored.providerIdentifier === integration.providerIdentifier &&
          stored.refreshToken &&
          stored.refreshToken !== integration.refreshToken &&
          stored.token !== integration.token &&
          stored.tokenExpiration &&
          stored.tokenExpiration.getTime() > Date.now()
        ) {
          return {
            id: stored.internalId,
            name: stored.name,
            username: stored.profile || '',
            picture: stored.picture || '',
            accessToken: stored.token,
            refreshToken: stored.refreshToken,
            expiresIn: Math.floor(
              (stored.tokenExpiration.getTime() - Date.now()) / 1000
            ),
          };
        }
        if (attempt < 2) {
          await timer(1000 * (attempt + 1));
        }
      }

      console.error(
        `Could not refresh ${integration.providerIdentifier} integration ${integration.id}`,
        refreshError
          ? [
              refreshError?.response?.data?.error,
              refreshError?.response?.data?.error_description,
            ]
              .filter((p) => typeof p === 'string')
              .join(' ') ||
              refreshError?.message ||
              String(refreshError)
          : 'no access token returned'
      );

      // A channel that is already flagged keeps failing on every later
      // refresh attempt (e.g. hourly analytics polling of an expired token),
      // so only the attempt that flagged it notifies.
      const flagged = await this._integrationService.refreshNeeded(
        integration.organizationId,
        integration.id
      );

      // No disconnectChannel call here: it only writes the refreshNeeded flag
      // set on the line above, and it notifies again — with an empty cause —
      // so one failure produced two identical notifications and two emails.
      if (flagged) {
        await this._integrationService.informAboutRefreshError(
          integration.organizationId,
          integration,
          cause,
          socialProvider.refreshErrorMessage?.(refreshError)
        );
      }

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
