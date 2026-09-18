'use client';

import { FC, ReactNode, useContext, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { FormProvider, useForm } from 'react-hook-form';
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { Button } from '@gitroom/react/form/button';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { Spinner } from '@gitroom/react/ui/spinner';
import { ChannelAvatar } from '@gitroom/frontend/components/new-launch/channel.avatar';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Providers } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { getProviderSettingsMeta } from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { GeneralPreviewComponent } from '@gitroom/frontend/components/launches/general.preview.component';
import { ChevronDownIcon } from '@gitroom/frontend/components/ui/icons';

dayjs.extend(utc);

/** One row of the `manualPosting` tool call: one channel, one date. */
export type AgentDraftItem = {
  integrationId: string;
  date?: string;
  settings?: Record<string, any> | { key: string; value: any }[];
  posts: {
    content: string;
    attachments?: { id: string; path: string }[];
  }[];
};

export type AgentDraftPost = {
  content: string;
  attachments: { id: string; path: string }[];
};

/**
 * Rows that share a date and the same posts are one thing to the person: a
 * post going to several channels at once, the way the composer sends it.
 */
export type AgentDraftGroup = {
  key: string;
  integrationIds: string[];
  /** UTC; missing means "the next free slot", resolved when acted on. */
  date?: string;
  settingsById: Record<string, Record<string, any>>;
  posts: AgentDraftPost[];
};

export type AgentDraftAction = 'schedule' | 'now' | 'draft';

/** What happened to a group, kept beside the thread so a reload shows it. */
export type AgentDraftOutcome = {
  status: 'scheduled' | 'posted' | 'draft' | 'composer' | 'error';
  at: string;
  /** The publish date that was used, UTC. */
  date?: string;
  error?: string;
};

type AgentChannel = Integrations & {
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
};

/**
 * The schedule tool takes settings as `[{ key, value }]` and the card as an
 * object; the model sends either. Both become the object the API expects.
 */
export const draftSettings = (
  settings: AgentDraftItem['settings']
): Record<string, any> => {
  if (Array.isArray(settings)) {
    return settings.reduce(
      (all, current) =>
        current && typeof current.key === 'string'
          ? { ...all, [current.key]: current.value }
          : all,
      {} as Record<string, any>
    );
  }
  return settings && typeof settings === 'object' ? settings : {};
};

/** Same normalisation as add.edit.modal.tsx: a line per paragraph. */
export const draftContentHtml = (content: string | undefined) => {
  const text = content || '';
  return text.indexOf('<p>') > -1
    ? text
    : text
        .split('\n')
        .map((line) => `<p>${line}</p>`)
        .join('');
};

const draftPosts = (item: AgentDraftItem): AgentDraftPost[] =>
  (Array.isArray(item.posts) && item.posts.length
    ? item.posts
    : [{ content: '', attachments: [] }]
  ).map((post) => ({
    content: draftContentHtml(post?.content),
    attachments: (post?.attachments || []).filter((a) => a?.path),
  }));

export const groupDraftItems = (
  list: AgentDraftItem[] | undefined
): AgentDraftGroup[] => {
  const groups: AgentDraftGroup[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (!item?.integrationId) {
      continue;
    }
    const posts = draftPosts(item);
    const date = item.date || undefined;
    const signature = JSON.stringify({ date, posts });
    const existing = groups.find(
      (group) => group.key === signature && !group.integrationIds.includes(item.integrationId)
    );
    if (existing) {
      existing.integrationIds.push(item.integrationId);
      existing.settingsById[item.integrationId] = draftSettings(item.settings);
      continue;
    }
    groups.push({
      key: signature,
      integrationIds: [item.integrationId],
      date,
      settingsById: { [item.integrationId]: draftSettings(item.settings) },
      posts,
    });
  }
  // A short, stable key per group: its index plus a hash of the signature,
  // so outcomes stay attached across reloads.
  return groups.map((group, index) => ({
    ...group,
    key: `${index}-${hashKey(group.key)}`,
  }));
};

const hashKey = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
};

const previewText = (html: string | undefined) =>
  stripHtmlValidation('none', html || '', false, true, false).trim();

/**
 * The channel's own Post Preview, the one Create Post shows, outside the
 * composer: the preview components read the post from `IntegrationContext`
 * and their settings from a react-hook-form provider (Instagram and Facebook
 * watch `post_type`), the same way provider-preview/ mounts them.
 */
const AgentPostPreview: FC<{
  channel: AgentChannel;
  group: AgentDraftGroup;
  allIntegrations: AgentChannel[];
}> = ({ channel, group, allIntegrations }) => {
  const meta = useMemo(() => {
    const entry = Providers.find((p) => p.identifier === channel.identifier);
    return entry ? getProviderSettingsMeta(entry.component) : undefined;
  }, [channel.identifier]);
  const settings = group.settingsById[channel.id] || {};
  const hasSettings = Object.keys(settings).length > 0;
  const form = useForm({
    defaultValues: hasSettings ? settings : undefined,
    values: hasSettings ? settings : undefined,
  });
  const contextValue = useMemo(
    () => ({
      date: group.date ? dayjs.utc(group.date).local() : dayjs(),
      integration: channel,
      allIntegrations,
      value: group.posts.map((post, index) => ({
        id: `${group.key}-${index}`,
        content: post.content,
        image: post.attachments,
      })),
    }),
    [channel, group, allIntegrations]
  );
  const Preview = meta?.CustomPreviewComponent || GeneralPreviewComponent;
  const maximumCharacters =
    typeof meta?.maximumCharacters === 'function'
      ? meta.maximumCharacters(settings)
      : meta?.maximumCharacters;

  return (
    <IntegrationContext.Provider value={contextValue}>
      <FormProvider {...form}>
        <div
          data-pq="agent-draft-preview"
          className="overflow-hidden rounded-[12px] bg-pqInner shadow-[inset_0_0_0_1px_var(--border)]"
        >
          <Preview maximumCharacters={maximumCharacters} />
        </div>
      </FormProvider>
    </IntegrationContext.Provider>
  );
};

const ChannelStack: FC<{ channels: AgentChannel[] }> = ({ channels }) => (
  <span className="flex items-center">
    {channels.map((channel, index) => (
      <span
        key={channel.id}
        title={channelNameWithHandle(channel)}
        className={clsx(
          'relative rounded-full bg-pqPop',
          index > 0 && '-ms-[8px]'
        )}
        style={{ zIndex: channels.length - index }}
      >
        <ChannelAvatar
          integration={channel}
          size={24}
          rounded="full"
          badge
          badgeSize={12}
        />
      </span>
    ))}
  </span>
);

const OutcomeLine: FC<{
  outcome: AgentDraftOutcome;
  when: (date?: string) => string;
}> = ({ outcome, when }) => {
  const t = useT();
  const label = {
    scheduled: t('draft_scheduled_for', 'Scheduled for {when}').replace(
      '{when}',
      when(outcome.date)
    ),
    posted: t('draft_posted_now', 'Published now'),
    draft: t('draft_saved_as_draft', 'Saved as draft'),
    composer: t('draft_saved_from_composer', 'Saved from Create Post'),
    error: outcome.error || t('post_save_failed', 'Could not save the post, please try again'),
  }[outcome.status];
  return (
    <div
      data-pq={`agent-draft-outcome-${outcome.status}`}
      className={clsx(
        'flex items-center gap-[6px] text-[12.5px] font-[600]',
        outcome.status === 'error' ? 'text-pqWarn' : 'text-pqMuted'
      )}
    >
      {outcome.status !== 'error' && (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span>{label}</span>
    </div>
  );
};

/**
 * Schedule, with Post now / Save as draft behind a caret: the same split
 * the composer footer draws, at the card's size.
 */
const GroupActions: FC<{
  scheduleLabel: string;
  busy: boolean;
  onAction: (action: AgentDraftAction) => void;
  onOpenComposer: () => void;
}> = ({ scheduleLabel, busy, onAction, onOpenComposer }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-[8px]">
      <div className="relative flex items-stretch">
        <Button
          type="button"
          size="sm"
          data-pq="agent-draft-schedule"
          loading={busy}
          disabled={busy}
          className="rounded-e-none"
          onClick={() => onAction('schedule')}
        >
          {scheduleLabel}
        </Button>
        <button
          type="button"
          aria-label={t('more_options', 'More options')}
          aria-expanded={open}
          disabled={busy}
          data-pq="agent-draft-more"
          onClick={() => setOpen((v) => !v)}
          className="grid h-[34px] w-[30px] place-items-center rounded-e-[8px] bg-pqBrand text-pqOnBrand shadow-[inset_1px_0_0_0_rgba(255,255,255,.24)] transition-colors hover:bg-pqBrandHover disabled:opacity-50"
        >
          <ChevronDownIcon size={14} />
        </button>
        {open && (
          <div
            role="menu"
            className="absolute end-0 top-[calc(100%+6px)] z-[3] flex min-w-[180px] flex-col gap-[2px] rounded-[10px] bg-pqPop p-[6px] shadow-pqE2 shadow-[inset_0_0_0_1px_var(--border)]"
          >
            <button
              type="button"
              role="menuitem"
              data-pq="agent-draft-now"
              onClick={() => {
                setOpen(false);
                onAction('now');
              }}
              className="rounded-[8px] px-[10px] py-[8px] text-start text-[13px] font-[600] text-pqText hover:bg-pqHover"
            >
              {t('post_now', 'Post now')}
            </button>
            <button
              type="button"
              role="menuitem"
              data-pq="agent-draft-draft"
              onClick={() => {
                setOpen(false);
                onAction('draft');
              }}
              className="rounded-[8px] px-[10px] py-[8px] text-start text-[13px] font-[600] text-pqText hover:bg-pqHover"
            >
              {t('save_as_draft', 'Save as draft')}
            </button>
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-pq="agent-draft-open"
        disabled={busy}
        onClick={onOpenComposer}
      >
        {t('edit_in_composer', 'Edit in Create Post')}
      </Button>
    </div>
  );
};

const DraftGroupView: FC<{
  group: AgentDraftGroup;
  channels: AgentChannel[];
  allIntegrations: AgentChannel[];
  expanded: boolean;
  onToggle: () => void;
  outcome?: AgentDraftOutcome;
  busy: boolean;
  actionable: boolean;
  onAction: (action: AgentDraftAction) => void;
  onOpenComposer: () => void;
}> = ({
  group,
  channels,
  allIntegrations,
  expanded,
  onToggle,
  outcome,
  busy,
  actionable,
  onAction,
  onOpenComposer,
}) => {
  const t = useT();
  const { formatDateTime } = useDateFormat();
  const when = (date?: string) =>
    date
      ? formatDateTime(dayjs.utc(date).local())
      : t('next_free_slot', 'Next free slot');
  const known = channels.filter(Boolean);
  const text = previewText(group.posts[0]?.content);

  return (
    <article
      data-pq="agent-draft-group"
      className="flex flex-col gap-[10px] border-t border-pqLine pt-[12px] first:border-t-0 first:pt-0"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-w-0 items-center gap-[10px] text-start"
      >
        {known.length ? (
          <ChannelStack channels={known} />
        ) : (
          <span className="text-[13px] font-[600] text-pqMuted">
            {group.integrationIds.join(', ')}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-[600] text-pqText">
          {known.map((c) => c.name).join(', ')}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-pqSoft">
          {when(group.date)}
        </span>
        <ChevronDownIcon
          size={14}
          className={clsx(
            'shrink-0 text-pqSoft transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>
      {expanded ? (
        <div className="flex flex-col gap-[10px]">
          {known.map((channel) => (
            <AgentPostPreview
              key={channel.id}
              channel={channel}
              group={group}
              allIntegrations={allIntegrations}
            />
          ))}
        </div>
      ) : (
        <p className="line-clamp-2 whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-pqMuted">
          {text || t('no_content', 'no content')}
        </p>
      )}
      {outcome && outcome.status !== 'error' ? (
        <OutcomeLine outcome={outcome} when={when} />
      ) : (
        <>
          {outcome?.status === 'error' && (
            <OutcomeLine outcome={outcome} when={when} />
          )}
          {actionable && (
            <GroupActions
              scheduleLabel={
                group.date
                  ? t('schedule', 'Schedule')
                  : t('schedule_next_free_slot', 'Schedule next free slot')
              }
              busy={busy}
              onAction={onAction}
              onOpenComposer={onOpenComposer}
            />
          )}
        </>
      )}
    </article>
  );
};

export type AgentDraftCardState =
  | 'streaming'
  | 'checking'
  | 'ready'
  | 'invalid'
  | 'legacy';

export const AgentDraftCard: FC<{
  groups: AgentDraftGroup[];
  state: AgentDraftCardState;
  /** Validation errors the model is about to fix; shown, never actionable. */
  errors?: { channel?: string; error: string }[];
  outcomes: Record<string, AgentDraftOutcome | undefined>;
  busy: Record<string, boolean | undefined>;
  onAction: (group: AgentDraftGroup, action: AgentDraftAction) => void;
  onOpenComposer: (group: AgentDraftGroup) => void;
  /** Above the groups: what the person typed to get here, if anything. */
  children?: ReactNode;
}> = ({ groups, state, errors, outcomes, busy, onAction, onOpenComposer }) => {
  const t = useT();
  const { properties } = useContext(PropertiesContext);
  const channels = useMemo(
    () => (Array.isArray(properties) ? properties : []) as AgentChannel[],
    [properties]
  );
  // The first group opens on its preview; the rest fold to a row, the way
  // the design lists drafts, and open on a click.
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const isOpen = (key: string, index: number) =>
    openKeys[key] ?? index === 0;
  const pending = groups.filter((group) => {
    const outcome = outcomes[group.key];
    return !outcome || outcome.status === 'error';
  });
  const actionable = state === 'ready';

  return (
    <div
      data-pq="agent-draft-card"
      data-state={state}
      className="my-[8px] flex w-full max-w-[560px] flex-col gap-[14px] rounded-[14px] bg-pqPop p-[14px_16px] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      <div className="flex items-center gap-[8px]">
        <div className="min-w-0 flex-1 text-[13px] font-[600] text-pqText">
          {t('post_preview', 'Post Preview')}
        </div>
        {state === 'checking' && (
          <span className="flex items-center gap-[6px] text-[12px] text-pqMuted">
            <Spinner width={14} height={14} />
            {t('checking_channel_rules', 'Checking channel rules')}
          </span>
        )}
        {state === 'legacy' && (
          <span className="text-[12px] text-pqSoft">
            {t('draft_from_earlier_session', 'From an earlier session')}
          </span>
        )}
      </div>
      {groups.length === 0 ? (
        <div className="flex flex-col gap-[10px]" data-pq="agent-draft-loading">
          <Skeleton className="h-[18px] w-[40%]" />
          <Skeleton className="h-[52px] w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-[12px]">
          {groups.map((group, index) => (
            <DraftGroupView
              key={group.key}
              group={group}
              channels={group.integrationIds
                .map((id) => channels.find((p) => p.id === id))
                .filter((p): p is AgentChannel => !!p)}
              allIntegrations={channels}
              expanded={isOpen(group.key, index)}
              onToggle={() =>
                setOpenKeys((prev) => ({
                  ...prev,
                  [group.key]: !isOpen(group.key, index),
                }))
              }
              outcome={outcomes[group.key]}
              busy={!!busy[group.key]}
              actionable={actionable}
              onAction={(action) => onAction(group, action)}
              onOpenComposer={() => onOpenComposer(group)}
            />
          ))}
        </div>
      )}
      {state === 'invalid' && (
        <div
          data-pq="agent-draft-invalid"
          className="flex flex-col gap-[4px] rounded-[10px] bg-pqSettings p-[10px_12px] text-[12.5px] text-pqMuted"
        >
          <span className="font-[600] text-pqText">
            {t('draft_needs_a_fix', 'Copilot is fixing this draft')}
          </span>
          {(errors || []).slice(0, 3).map((item, index) => (
            <span key={index}>
              {item.channel ? `${item.channel}: ` : ''}
              {item.error}
            </span>
          ))}
        </div>
      )}
      {actionable && pending.length > 1 && (
        <div className="flex items-center justify-between gap-[8px] border-t border-pqLine pt-[12px]">
          <span className="text-[12.5px] text-pqMuted">
            {t('n_posts_waiting', '{count} posts waiting').replace(
              '{count}',
              String(pending.length)
            )}
          </span>
          <Button
            type="button"
            size="sm"
            data-pq="agent-draft-schedule-all"
            disabled={Object.values(busy).some(Boolean)}
            onClick={() => pending.forEach((group) => onAction(group, 'schedule'))}
          >
            {t('schedule_all', 'Schedule all')}
          </Button>
        </div>
      )}
    </div>
  );
};
