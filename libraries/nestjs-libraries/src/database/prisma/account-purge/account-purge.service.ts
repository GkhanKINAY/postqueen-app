import { Injectable, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { AccountPurgeRepository } from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.repository';
import { ClippingService } from '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { isBillingEnabled } from '@gitroom/helpers/utils/billing.enabled';
import {
  AccountPurgeMode,
  accountPurgeHolds,
  accountPurgeMode,
} from '@gitroom/helpers/utils/account.purge.mode';
import { chunk } from 'lodash';
import {
  AccountPurgeKind,
  AccountPurgeTarget,
  DRY_RUN_BUDGET_MS,
  FILE_BATCH,
  KEY_BATCH,
  MEMBER_COMMENTS_IN_LIVE_WORKSPACES,
  ORGANIZATION_PURGE_STEPS,
  OrganizationPurgeStep,
  PURGE_BATCH,
  PURGE_GRACE_DAYS,
  PURGE_OVERDUE_DAYS,
  THREAD_BATCH,
  USER_PURGE_STEPS,
  UserPurgeStep,
  copilotResourceIds,
  daysAgo,
  keysUsedIn,
  organizationSkipReason,
  ownFiles,
  postImageUrls,
  purgeCountsLine,
  urlsInText,
  userSkipReason,
} from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.plan';

type StepResult = { count: number; more: boolean };

// What one call has counted and which files it has already handled, so a key
// used by a post and a media row is looked up and removed once.
type PurgeCall = {
  counts: Record<string, number>;
  seen: Set<string>;
  inUse?: (string | null)[];
  deadline: number;
};

/**
 * Removes what a deleted organization or user leaves behind, a few days after
 * the deletion. Called by the daily account purge workflow, one bounded batch
 * per call, until the call reports done.
 *
 * ACCOUNT_PURGE_MODE is read on every call: "off" does nothing, "dry-run"
 * counts what would go and writes nothing, not even purgedAt, "on" removes it.
 * Logs carry ids and counts only.
 *
 * Files go before rows, because the rows are the only way back to the files:
 * storage keys are random with no organization prefix. A key another
 * organization or a live account still uses is kept. What stays behind is a
 * tombstone: the organization, its channels and the user keep their ids and
 * the few fields billing and the trial check read, and nothing that names
 * anyone.
 */
@Injectable()
export class AccountPurgeService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _accountPurgeRepository: AccountPurgeRepository,
    private _clippingService: ClippingService,
    private _temporalService: TemporalService
  ) {}

  async listTargets(): Promise<AccountPurgeTarget[]> {
    const mode = accountPurgeMode();
    if (mode === 'off') {
      Logger.log('[purge] run mode=off');
      return [];
    }

    const holds = accountPurgeHolds();
    const now = new Date();
    const graceEndsBefore = daysAgo(PURGE_GRACE_DAYS, now);
    const overdueBefore = daysAgo(PURGE_OVERDUE_DAYS, now);

    const organizations = (
      await this._accountPurgeRepository.getUnpurgedDeletedOrganizations()
    ).filter((org) => !holds.has(org.id));
    const users = (
      await this._accountPurgeRepository.getUnpurgedDeletedUsers(
        graceEndsBefore
      )
    ).filter((user) => !holds.has(user.id));
    const due = organizations.filter((org) => org.deletedAt! < graceEndsBefore);
    const overdue = organizations.filter(
      (org) => org.deletedAt! < overdueBefore
    ).length;

    Logger.log(
      `[purge] run mode=${mode} quiesce=${organizations.length} organizations=${due.length} users=${users.length} held=${holds.size} overdue=${overdue}`
    );
    if (overdue) {
      Logger.warn(`[purge] overdue=${overdue}`);
    }

    // Quiesce first: an organization past its grace is quiesced and purged in
    // the same run, one still inside it only quiesced.
    return [
      ...organizations.map((org) => ({
        kind: 'quiesce' as const,
        id: org.id,
      })),
      ...due.map((org) => ({ kind: 'organization' as const, id: org.id })),
      ...users.map((user) => ({ kind: 'user' as const, id: user.id })),
    ];
  }

  async purgeStep(
    kind: AccountPurgeKind,
    id: string,
    progress: (stage: string) => void = () => undefined
  ): Promise<{ done: boolean }> {
    const mode = accountPurgeMode();
    if (mode === 'off') {
      return { done: true };
    }

    switch (kind) {
      case 'quiesce':
        return this.quiesceOrganization(id, mode);
      case 'organization':
        return this.purgeOrganization(id, mode, progress);
      case 'user':
        return this.purgeUser(id, mode, progress);
      default:
        return { done: true };
    }
  }

  // The grace and an unfinished subscription cancel only hold back the purge.
  // Stopping workflows loses nothing, so quiesce waits on neither.
  private async organizationSkip(orgId: string, purge: boolean) {
    return organizationSkipReason(
      await this._accountPurgeRepository.getOrganizationGuard(orgId),
      {
        held: accountPurgeHolds().has(orgId),
        graceEndsBefore: purge ? daysAgo(PURGE_GRACE_DAYS) : undefined,
        billingEnabled: purge && isBillingEnabled(),
      }
    );
  }

  /**
   * Stops everything still running for a deleted organization: scheduled
   * posts, token refreshes, autopost rules, digests, streaks, media and
   * clipping jobs. Terminated rather than deleted, so their histories age out
   * under the namespace retention. No grace: nothing is lost by stopping them.
   */
  private async quiesceOrganization(orgId: string, mode: AccountPurgeMode) {
    const skip = await this.organizationSkip(orgId, false);
    if (skip) {
      if (skip !== 'purged') {
        Logger.log(`[purge] skipped quiesce org=${orgId} reason=${skip}`);
      }
      return { done: true };
    }

    const apply = mode === 'on';
    const owners = await this._accountPurgeRepository.getWorkflowOwners(orgId);
    const workflowIds = new Set<string>([
      ...owners.autoposts.map((id) => `autopost-${id}`),
      ...owners.integrations.map((id) => `refresh_${id}`),
      `digest_email_workflow_${orgId}`,
      `streak_${orgId}`,
      ...owners.media.map((id) => `media_${id}`),
      ...owners.clippings.map((id) => `clipping_${id}`),
      ...(await this.runningWorkflowIds(`organizationId="${orgId}"`)),
    ]);
    for (const postId of owners.repeatPosts) {
      for (const workflowId of await this.runningWorkflowIds(
        `postId="${postId}"`
      )) {
        workflowIds.add(workflowId);
      }
    }

    let workflows = 0;
    let failed = 0;
    for (const workflowId of workflowIds) {
      if (!(await this.isRunning(workflowId))) {
        continue;
      }
      workflows++;
      if (apply) {
        const result = await this._temporalService.terminateWorkflow(
          workflowId,
          'Account deleted'
        );
        if (!result.success) {
          failed++;
        }
      }
    }

    const autoposts = await this._accountPurgeRepository.quiesceAutoposts(
      orgId,
      apply
    );

    Logger.log(
      `[purge] quiesce org=${orgId} mode=${mode} ${purgeCountsLine({
        workflows,
        workflowsFailed: failed,
        autoposts: autoposts.count,
      })}`.trim()
    );
    return { done: true };
  }

  // Same visibility search deletePost uses.
  private async runningWorkflowIds(query: string) {
    const ids: string[] = [];
    try {
      const workflows = this._temporalService.client
        .getRawClient()
        ?.workflow.list({ query: `${query} AND ExecutionStatus="Running"` });
      if (!workflows) {
        return ids;
      }
      for await (const executionInfo of workflows) {
        ids.push(executionInfo.workflowId);
      }
    } catch (err) {}
    return ids;
  }

  private async isRunning(workflowId: string) {
    try {
      const workflow =
        await this._temporalService.client.getWorkflowHandle(workflowId);
      return (await workflow.describe()).status.name === 'RUNNING';
    } catch (err) {
      // not found: never started, or already gone under retention
      return false;
    }
  }

  private async purgeOrganization(
    orgId: string,
    mode: AccountPurgeMode,
    progress: (stage: string) => void
  ) {
    const skip = await this.organizationSkip(orgId, true);
    if (skip) {
      if (skip !== 'purged') {
        Logger.log(`[purge] skipped org=${orgId} reason=${skip}`);
      }
      return { done: true };
    }

    const apply = mode === 'on';
    const call: PurgeCall = {
      counts: { files: 0, filesShared: 0, filesForeign: 0 },
      seen: new Set(),
      deadline: Date.now() + DRY_RUN_BUDGET_MS,
    };

    for (const { step } of ORGANIZATION_PURGE_STEPS) {
      progress(step);
      const { count, more } = await this.organizationStep(
        step,
        orgId,
        apply,
        call
      );
      call.counts[step] = (call.counts[step] || 0) + count;
      if (more) {
        Logger.log(
          `[purge] org=${orgId} mode=${mode} ${purgeCountsLine(
            call.counts
          )} done=false`
        );
        return { done: false };
      }
    }

    progress('tombstone');
    const pictures =
      await this._accountPurgeRepository.integrationPictures(orgId);
    await this.files(
      orgId,
      pictures.map((integration) => integration.picture!),
      apply,
      call
    );

    if (!apply) {
      Logger.log(
        `[purge] org=${orgId} mode=dry-run ${purgeCountsLine(call.counts)}`
      );
      return { done: true };
    }

    await this._accountPurgeRepository.tombstoneOrganization(orgId);
    Logger.log(
      `[purge] org=${orgId} mode=on ${purgeCountsLine(call.counts)} done=true`
    );
    return { done: true };
  }

  private organizationStep(
    step: OrganizationPurgeStep,
    orgId: string,
    apply: boolean,
    call: PurgeCall
  ): Promise<StepResult> {
    const repository = this._accountPurgeRepository;
    switch (step) {
      case 'comments':
        return repository.purgeComments(orgId, apply);
      case 'tagsPosts':
        return repository.purgeTagsPosts(orgId, apply);
      case 'errors':
        return repository.purgeErrors(orgId, apply);
      case 'snapshots':
        return repository.purgeSnapshots(orgId, apply);
      case 'postLinks':
        return repository.purgePostLinks(orgId, apply);
      case 'posts':
        return this.withFiles(orgId, apply, call, {
          page: (after, take) => repository.postsWithFiles(orgId, after, take),
          urls: (post) => [
            ...postImageUrls(post.image),
            ...urlsInText(post.content),
            ...urlsInText(post.settings),
          ],
          remove: (ids) => repository.deletePosts(orgId, ids),
        });
      case 'integrationWebhooks':
        return repository.purgeIntegrationWebhooks(orgId, apply);
      case 'webhooks':
        return repository.purgeWebhooks(orgId, apply);
      case 'plugs':
        return repository.purgePlugs(orgId, apply);
      case 'plugData':
        return repository.purgePlugData(orgId, apply);
      case 'media':
        return this.withFiles(orgId, apply, call, {
          page: (after, take) => repository.mediaWithFiles(orgId, after, take),
          urls: (media) => [media.path, media.thumbnail || ''],
          remove: (ids) => repository.deleteMedia(orgId, ids),
          saved: true,
        });
      case 'customers':
        return repository.purgeCustomers(orgId, apply);
      case 'tags':
        return repository.purgeTags(orgId, apply);
      case 'sets':
        return this.withFiles(orgId, apply, call, {
          page: (after, take) => repository.setsWithFiles(orgId, after, take),
          urls: (set) => urlsInText(set.content),
          remove: (ids) => repository.deleteSets(orgId, ids),
        });
      case 'signatures':
        return this.withFiles(orgId, apply, call, {
          page: (after, take) =>
            repository.signaturesWithFiles(orgId, after, take),
          urls: (signature) => urlsInText(signature.content),
          remove: (ids) => repository.deleteSignatures(orgId, ids),
        });
      case 'autoposts':
        return repository.purgeAutoposts(orgId, apply);
      case 'thirdParty':
        return repository.purgeThirdParty(orgId, apply);
      case 'notifications':
        return repository.purgeNotifications(orgId, apply);
      case 'creditAllocations':
        return repository.purgeCreditAllocations(orgId, apply);
      case 'credits':
        return repository.purgeCredits(orgId, apply);
      case 'creditGrants':
        return repository.purgeCreditGrants(orgId, apply);
      case 'github':
        return repository.purgeGithub(orgId, apply);
      case 'clips':
        return this.withFiles(orgId, apply, call, {
          page: (after, take) => repository.clipsWithFiles(orgId, after, take),
          urls: (clip) => [
            clip.path || '',
            clip.thumbnail || '',
            ...this.derivedUrls([], [clip.id]),
          ],
          remove: (ids) => repository.deleteClips(orgId, ids),
        });
      case 'clippings':
        return this.withFiles(orgId, apply, call, {
          page: (after, take) =>
            repository.clippingsWithFiles(orgId, after, take),
          urls: (clipping) => [
            clipping.thumbnail || '',
            ...this.derivedUrls([clipping.id], []),
          ],
          remove: (ids) => repository.deleteClippings(orgId, ids),
        });
      case 'oauthAuthorizations':
        return repository.purgeOauthAuthorizations(orgId, apply);
      case 'oauthApps':
        return repository.purgeOauthApps(orgId, apply);
      case 'subscription':
        return repository.purgeSubscription(orgId, apply);
      case 'members':
        return repository.purgeMembers(orgId, apply);
      case 'threads':
        return this.threads(orgId, apply, call);
      case 'copilotResources':
        return repository.purgeCopilotResources(
          copilotResourceIds(orgId),
          apply
        );
      default:
        return Promise.resolve({ count: 0, more: false });
    }
  }

  // Clipping jobs write intermediate files under keys derived from ids
  // rather than saved URLs; this is the URL each one would be saved under.
  private derivedUrls(clippingIds: string[], clipIds: string[]) {
    return this._clippingService
      .derivedFileKeys(clippingIds, clipIds)
      .map((key) =>
        this.storage.publicUrl ? this.storage.publicUrl(key) : key
      );
  }

  /**
   * One table that carries file URLs. Dry-run reads every row page by page,
   * within its time budget, and counts; on, the first batch's files are
   * removed and then its rows, so
   * a call that dies in between finds the same rows, and the same files, on
   * the next run.
   */
  private async withFiles<T extends { id: string }>(
    orgId: string,
    apply: boolean,
    call: PurgeCall,
    table: {
      page: (after: string, take: number) => Promise<T[]>;
      urls: (row: T) => string[];
      remove: (ids: string[]) => Promise<{ count: number }>;
      // A column that only ever holds an upload: a URL there that this
      // storage does not recognise is counted, since it means a file the
      // purge cannot remove (one saved under an earlier upload URL).
      saved?: boolean;
    }
  ): Promise<StepResult> {
    if (!apply) {
      let total = 0;
      let after = '';
      for (;;) {
        if (this.outOfTime(call)) {
          return { count: total, more: false };
        }
        const rows = await table.page(after, PURGE_BATCH);
        total += rows.length;
        await this.files(
          orgId,
          rows.flatMap(table.urls),
          false,
          call,
          table.saved
        );
        if (rows.length < PURGE_BATCH) {
          return { count: total, more: false };
        }
        after = rows[rows.length - 1].id;
      }
    }

    const rows = await table.page('', PURGE_BATCH);
    if (!rows.length) {
      return { count: 0, more: false };
    }
    await this.files(orgId, rows.flatMap(table.urls), true, call, table.saved);
    const { count } = await table.remove(rows.map((row) => row.id));
    return { count, more: rows.length >= PURGE_BATCH };
  }

  // A dry-run reads everything in one call. Past its budget it stops reading
  // and marks its counts partial, so it still logs instead of timing out.
  private outOfTime(call: PurgeCall) {
    if (Date.now() < call.deadline) {
      return false;
    }
    call.counts.partial = 1;
    return true;
  }

  // Copilot threads with everything keyed by them, messages first; a thread
  // goes only once nothing keyed by it is left.
  private async threads(
    orgId: string,
    apply: boolean,
    call: PurgeCall
  ): Promise<StepResult> {
    const repository = this._accountPurgeRepository;
    const resourceIds = copilotResourceIds(orgId);
    const tally = (keyed: { messages: number; count: number }) => {
      call.counts.messages = (call.counts.messages || 0) + keyed.messages;
      call.counts.threadRows =
        (call.counts.threadRows || 0) + keyed.count - keyed.messages;
    };

    if (!apply) {
      let total = 0;
      let after = '';
      for (;;) {
        if (this.outOfTime(call)) {
          return { count: total, more: false };
        }
        const threads = await repository.threadsWithFiles(
          resourceIds,
          after,
          THREAD_BATCH
        );
        total += threads.length;
        if (threads.length) {
          tally(
            await repository.purgeThreadRows(
              threads.map((thread) => thread.id),
              false
            )
          );
        }
        await this.files(
          orgId,
          threads.flatMap((thread) => urlsInText(thread.metadata)),
          false,
          call
        );
        if (threads.length < THREAD_BATCH) {
          return { count: total, more: false };
        }
        after = threads[threads.length - 1].id;
      }
    }

    const threads = await repository.threadsWithFiles(
      resourceIds,
      '',
      THREAD_BATCH
    );
    if (!threads.length) {
      return { count: 0, more: false };
    }
    const ids = threads.map((thread) => thread.id);
    const keyed = await repository.purgeThreadRows(ids, true);
    tally(keyed);
    if (keyed.more) {
      return { count: 0, more: true };
    }
    await this.files(
      orgId,
      threads.flatMap((thread) => urlsInText(thread.metadata)),
      true,
      call
    );
    const { count } = await repository.deleteThreads(resourceIds, ids);
    return { count, more: threads.length >= THREAD_BATCH };
  }

  /**
   * The files behind these URLs: only this storage's own, minus any key a
   * row outside the purge still uses. Removed in batches when applying; a
   * failure keeps the rows for the next run, so the files stay findable.
   */
  private async files(
    orgId: string,
    urls: string[],
    apply: boolean,
    call: PurgeCall,
    saved = false
  ) {
    const isOwnFile = (url: string) => this.storage.isOwnFile(url);
    if (saved) {
      call.counts.filesForeign += urls.filter(
        (url) => url && !isOwnFile(url)
      ).length;
    }

    const candidates = [...ownFiles(urls, isOwnFile)].filter(
      ([key]) => !call.seen.has(key)
    );
    if (!candidates.length) {
      return;
    }
    candidates.forEach(([key]) => call.seen.add(key));

    const shared = await this.sharedKeys(
      orgId,
      candidates.map(([key]) => key),
      call
    );
    const removable = candidates.filter(([key]) => !shared.has(key));
    call.counts.files += removable.length;
    call.counts.filesShared += shared.size;
    if (!apply) {
      return;
    }

    let failed = 0;
    for (const batch of chunk(removable, FILE_BATCH)) {
      const results = await Promise.allSettled(
        batch.map(([, url]) => this.storage.removeFile(url))
      );
      failed += results.filter((result) => result.status === 'rejected').length;
    }
    if (failed) {
      throw new Error(
        `[purge] org=${orgId} could not remove ${failed} files, rows kept for the next run`
      );
    }
  }

  private async sharedKeys(orgId: string, keys: string[], call: PurgeCall) {
    if (!call.inUse) {
      const kept = await this._accountPurgeRepository.mediaKeptInUse(orgId);
      call.counts.mediaKept = kept.length;
      call.inUse = kept.flatMap((media) => [media.path, media.thumbnail]);
    }

    const shared = keysUsedIn(keys, call.inUse);
    for (const batch of chunk(
      keys.filter((key) => !shared.has(key)),
      KEY_BATCH
    )) {
      const values = await this._accountPurgeRepository.valuesUsingKeys(
        orgId,
        batch
      );
      keysUsedIn(batch, values).forEach((key) => shared.add(key));
    }
    return shared;
  }

  private async purgeUser(
    userId: string,
    mode: AccountPurgeMode,
    progress: (stage: string) => void
  ) {
    const guard = await this._accountPurgeRepository.getUserGuard(userId);
    const skip = userSkipReason(guard, {
      held: accountPurgeHolds().has(userId),
      graceEndsBefore: daysAgo(PURGE_GRACE_DAYS),
    });
    if (skip) {
      if (skip !== 'purged') {
        Logger.log(`[purge] skipped user=${userId} reason=${skip}`);
      }
      return { done: true };
    }

    const apply = mode === 'on';
    const counts: Record<string, number> = {};
    for (const { step } of USER_PURGE_STEPS) {
      progress(step);
      if (
        step === 'memberComments' &&
        MEMBER_COMMENTS_IN_LIVE_WORKSPACES === 'keep'
      ) {
        counts.memberCommentsKept = (
          await this._accountPurgeRepository.purgeMemberComments(userId, false)
        ).count;
        continue;
      }
      const { count, more } = await this.userStep(step, userId, apply);
      counts[step] = (counts[step] || 0) + count;
      if (more) {
        Logger.log(
          `[purge] user=${userId} mode=${mode} ${purgeCountsLine(
            counts
          )} done=false`
        );
        return { done: false };
      }
    }

    if (apply) {
      await this._accountPurgeRepository.tombstoneUser(
        userId,
        guard!.deletedAt!
      );
    }
    Logger.log(
      `[purge] user=${userId} mode=${mode} ${purgeCountsLine(counts)}${
        apply ? ' done=true' : ''
      }`
    );
    return { done: true };
  }

  private userStep(
    step: UserPurgeStep,
    userId: string,
    apply: boolean
  ): Promise<StepResult> {
    const repository = this._accountPurgeRepository;
    switch (step) {
      case 'userAuthorizations':
        return repository.purgeUserAuthorizations(userId, apply);
      case 'items':
        return repository.purgeItems(userId, apply);
      case 'agencyNiches':
        return repository.purgeAgencyNiches(userId, apply);
      case 'agency':
        return repository.purgeAgency(userId, apply);
      case 'memberComments':
        return repository.purgeMemberComments(userId, apply);
      case 'identities':
        return repository.purgeIdentities(userId, apply);
      default:
        return Promise.resolve({ count: 0, more: false });
    }
  }
}
