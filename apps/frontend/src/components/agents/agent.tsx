'use client';

import React, {
  createContext,
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import clsx from 'clsx';
import useCookie from 'react-use-cookie';
import useSWR from 'swr';
import { sortIntegrationsByProviderImportance } from '@gitroom/frontend/components/launches/helpers/sort.integrations';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { TrialLockCard } from '@gitroom/frontend/components/billing/trial-lock-card';
import { useOpenReconnectInChannels } from '@gitroom/frontend/components/launches/use.open.reconnect';
import { ChannelsListEmpty } from '@gitroom/frontend/components/ui/no-channels-art';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { channelListSubtitle, channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { MobileSheet } from '@gitroom/frontend/components/layout/mobile-sheet';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useClickOutside } from '@mantine/hooks';

const needsAttention = (integration: {
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
}) => !!(integration.refreshNeeded || integration.inBetweenSteps);

/**
 * The thread this page shows, read from the URL. `usePathname`, not
 * `useParams`: after the first message the chat moves `/agents/new` to
 * `/agents/<id>` with `history.replaceState`, which updates the pathname
 * but leaves `useParams` at `new`.
 */
export const useAgentRouteId = () => {
  const pathname = usePathname();
  return pathname?.split('/').filter(Boolean).pop() || 'new';
};

type ThreadList = {
  threads: { id: string; title?: string; createdAt?: string; updatedAt?: string }[];
};

/** How often the Chats rail asks for a fresh thread's title, and for how long. */
const THREAD_TITLE_POLL_MS = 2000;
const THREAD_TITLE_POLL_FOR_MS = 30_000;

/**
 * The Chats rail. Mastra names a thread after its first run, so a fresh
 * thread's title lands a few seconds after its reply: the chat passes that
 * thread and the list polls until the title is in it, then switches itself
 * off (the way notifications/live.bridge.tsx does), or gives up after
 * `THREAD_TITLE_POLL_FOR_MS` when naming failed.
 */
export const useCopilotThreads = (awaitTitle?: { id: string; until: number }) => {
  const fetch = useFetch();
  const load = useCallback(async (): Promise<ThreadList> => {
    // `customFetch` resolves 4xx/5xx, so without this a failed list would
    // parse as an account with no chats and paint the empty state.
    const response = await fetch('/copilot/list');
    if (!response.ok) {
      throw new Error('Could not load chats');
    }
    return response.json();
  }, [fetch]);
  const refreshInterval = useCallback(
    (latest?: ThreadList) =>
      awaitTitle &&
      Date.now() < awaitTitle.until &&
      !latest?.threads?.some((p) => p.id === awaitTitle.id && p.title)
        ? THREAD_TITLE_POLL_MS
        : 0,
    [awaitTitle]
  );
  return useSWR<ThreadList>('threads', load, { refreshInterval });
};

export const threadTitleWait = (id: string) => ({
  id,
  until: Date.now() + THREAD_TITLE_POLL_FOR_MS,
});

/**
 * What PostQueen keeps beside a thread's transcript: the channels that were
 * selected while chatting, and what happened to each Post Preview card.
 */
type ThreadState = {
  channels?: string[];
  cards?: Record<string, unknown>;
  media?: Record<string, unknown>;
};

const useThreadState = (threadId: string) => {
  const fetch = useFetch();
  return useSWR<ThreadState>(
    threadId === 'new' ? null : `thread-state-${threadId}`,
    async () => (await fetch(`/copilot/${threadId}/state`)).json()
  );
};

export const MediaPortal: FC<{
  media: { path: string; id: string }[];
  value: string;
  // Thumbs sit above the textarea; toolbar buttons stay in the controls row.
  part?: 'thumbs' | 'toolbar';
  setMedia: (event: {
    target: {
      name: string;
      value?: {
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
        thumbnailTimestamp?: number;
      }[];
    };
  }) => void;
}> = ({ media, setMedia, value, part = 'toolbar' }) => {
  // Rendered inside the composer frame (agent.input.tsx / UnconfiguredAgentShell).
  // Do not gate on CopilotKit's `.copilotKitMessages` — that class is only on
  // the live SDK tree; waiting for it hid Insert media / Design / AI when the
  // unconfigured shell was shown (and could race on mount).
  return (
    <MultiMediaComponent
      ghost={true}
      ghostPart={part}
      allData={[{ content: value }]}
      text={value}
      label=""
      description=""
      value={media}
      dummy={false}
      name="image"
      onChange={setMedia}
      onOpen={() => {}}
      onClose={() => {}}
    />
  );
};

export const AgentList: FC<{
  /** The selection lives in `Agent` (one source for the list, the pill
   *  and the chat); this list only paints and toggles it. */
  selected: Integrations[];
  onChange: (arr: any[]) => void;
}> = ({ selected, onChange }) => {
  const t = useT();
  const router = useRouter();
  const openReconnectInChannels = useOpenReconnectInChannels();
  const [query, setQuery] = useState('');

  // Shared `/integrations/list` cache (array shape). Do not use the bare
  // `'integrations'` key — webhooks/autopost historically cached `{ integrations }`.
  const { data, isLoading } = useIntegrationList();

  const openAddChannel = useCallback(() => {
    router.push('/channels?add=1');
  }, [router]);

  const setIntegration = useCallback(
    (integration: Integrations) => () => {
      if (selected.some((p) => p.id === integration.id)) {
        onChange(selected.filter((p) => p.id !== integration.id));
        return;
      }
      if (needsAttention(integration)) {
        openReconnectInChannels(integration.id);
        return;
      }
      onChange([...selected, integration]);
    },
    [selected, onChange, openReconnectInChannels]
  );

  const sortedIntegrations = useMemo(() => {
    return sortIntegrationsByProviderImportance(data || []) as Array<
      Integrations & {
        refreshNeeded?: boolean;
        inBetweenSteps?: boolean;
      }
    >;
  }, [data]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q
      ? sortedIntegrations.filter((integration) =>
          channelNameWithHandle(integration).toLocaleLowerCase().includes(q)
        )
      : sortedIntegrations;
  }, [sortedIntegrations, query]);

  return (
    <div data-pq="agent-channel-picker" className="flex min-h-0 flex-col">
      {sortedIntegrations.length > 0 && (
        <div className="shrink-0 p-[12px_12px_6px]">
          <label className="flex h-[36px] items-center gap-[8px] rounded-[9px] bg-pqInner px-[10px] shadow-[inset_0_0_0_1px_var(--border)] focus-within:shadow-[inset_0_0_0_1.5px_var(--brand)]">
            <SearchGlyph />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search_channels', 'Search channels')}
              aria-label={t('search_channels', 'Search channels')}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-pqText outline-none placeholder:text-pqSoft"
            />
          </label>
        </div>
      )}
      <div
        role="group"
        aria-label={t('choose_channels', 'Choose channels')}
        className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto overflow-x-hidden p-[2px_6px_6px]"
      >
        {/* `fallbackData: []` makes a load look identical to an empty list,
            so the empty art waits for the fetch — same reason as the
            Channels rail and the posts panel. */}
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-[11px] rounded-pqSm px-[10px] py-[9px]"
            >
              <Skeleton className="size-[18px] shrink-0 rounded-[5px]" />
              <Skeleton className="size-[28px] shrink-0 rounded-full" />
              <Skeleton
                className={clsx(
                  'h-[12px]',
                  i % 2 === 0 ? 'w-[58%]' : 'w-[46%]'
                )}
              />
            </div>
          ))}
        {!isLoading && !sortedIntegrations.length && (
          <ChannelsListEmpty
            hint={t(
              'agent_channels_list_empty_hint',
              'Connect an account to draft and schedule with Copilot.'
            )}
          />
        )}
        {shown.map((integration) => {
          const blocked = needsAttention(integration);
          const isSelected =
            !blocked && selected.some((p) => p.id === integration.id);
          return (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={isSelected}
              onClick={setIntegration(integration)}
              key={integration.id}
              title={channelNameWithHandle(integration)}
              className={clsx(
                'flex min-h-[48px] w-full items-center gap-[11px] rounded-pqSm px-[10px] py-[7px] text-start transition-colors hover:bg-pqHover mobile:min-h-[56px]',
                blocked && 'opacity-60'
              )}
            >
              {blocked ? (
                <span className="size-[18px] shrink-0" />
              ) : (
                <span
                  className={clsx(
                    'flex size-[18px] shrink-0 items-center justify-center rounded-[5px]',
                    isSelected
                      ? 'bg-pqBrand text-pqOnBrand'
                      : 'shadow-[inset_0_0_0_1.5px_var(--border)]'
                  )}
                >
                  {isSelected && (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              )}
              <ChannelAvatar integration={integration} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-[600] text-pqText">
                  {integration.name}
                </span>
                <span
                  className={clsx(
                    'block truncate text-[12px]',
                    blocked ? 'text-pqWarn' : 'text-pqMuted'
                  )}
                >
                  {blocked
                    ? t('needs_reconnect', 'Needs reconnect')
                    : channelListSubtitle(integration)}
                </span>
              </span>
              {blocked && (
                <span className="shrink-0 text-[12px] font-[600] text-pqWarn">
                  {t('reconnect', 'Reconnect')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex h-[46px] shrink-0 items-center gap-[8px] border-t border-pqLine ps-[14px] pe-[8px]">
        <span className="text-[12.5px] text-pqMuted">
          {t('n_channels_selected', '{{count}} selected', {
            count: selected.length,
          })}
        </span>
        <button
          type="button"
          data-pq="agent-add-channel"
          onClick={openAddChannel}
          className="ms-auto flex h-[30px] items-center gap-[6px] rounded-[8px] px-[8px] text-[12.5px] font-[600] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
        >
          <PlusGlyph size={14} />
          {t('add_channel', 'Add Channel')}
        </button>
      </div>
    </div>
  );
};

/** A channel's picture with its platform badge, as the pickers draw it. */
const ChannelAvatar: FC<{
  integration: { identifier: string; picture?: string | null };
  size: number;
}> = ({ integration, size }) => (
  <span className="relative shrink-0" style={{ width: size, height: size }}>
    <ImageWithFallback
      fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
      src={integration.picture || '/no-picture.jpg'}
      className="rounded-full"
      alt={integration.identifier}
      width={size}
      height={size}
    />
    <img
      src={`/icons/platforms/${integration.identifier}.png`}
      alt=""
      className="absolute -bottom-[2px] -end-[2px] rounded-full border border-pqPop"
      style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }}
    />
  </span>
);

const SearchGlyph: FC = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" className="shrink-0 text-pqSoft">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
    <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const PlusGlyph: FC<{ size?: number }> = ({ size = 15 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className="shrink-0">
    <path d="M12 5.5v13M5.5 12h13" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
);

/**
 * "Posting to" in the message box: the selected channels at a glance, and
 * the way in to change them. Desktop opens the picker above the pill; a
 * phone gets it as a sheet. `openChannels` from the context opens the same
 * picker (an empty-state button, a card asking for a channel).
 */
export const ChannelPickerButton: FC = () => {
  const t = useT();
  const { mobile } = useViewport();
  const { properties, onChannelsChange, pickerOpen, setPickerOpen } =
    useContext(PropertiesContext);
  const { referenceRef, floatingRef } = useAnchoredPopover<
    HTMLButtonElement,
    HTMLDivElement
  >(pickerOpen && !mobile, 'start', { placement: 'top-start', offsetPx: 8 });
  const wrapRef = useClickOutside(() => {
    if (!mobile) setPickerOpen(false);
  });
  const count = properties.length;
  const label = !count
    ? t('choose_channels', 'Choose channels')
    : count === 1
    ? t('agent_posting_to_one', 'Posting to 1 channel')
    : t('agent_posting_to_many', 'Posting to {{count}} channels', { count });

  return (
    <div ref={wrapRef} className="flex">
      <button
        ref={referenceRef}
        type="button"
        data-pq="agent-posting-to"
        onClick={() => setPickerOpen(!pickerOpen)}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        className={clsx(
          'flex h-[30px] max-w-full items-center gap-[8px] rounded-full text-[12.5px] font-[600] transition-colors mobile:h-[36px]',
          !count
            ? 'border border-dashed border-pqBrand bg-pqBrandSoft px-[11px] text-pqFocused'
            : pickerOpen
            ? 'bg-pqBrandSoft ps-[4px] pe-[8px] text-pqText shadow-[inset_0_0_0_1.5px_var(--brand)]'
            : 'bg-pqSettings ps-[4px] pe-[8px] text-pqText hover:bg-pqHover'
        )}
      >
        {!count ? (
          <PlusGlyph size={13} />
        ) : (
          <span className="flex shrink-0 items-center">
            {properties.slice(0, 4).map((p, i) => (
              <span
                key={p.id}
                className={clsx(
                  'flex rounded-full shadow-[0_0_0_2px_var(--pop)]',
                  i > 0 && '-ms-[6px]'
                )}
                title={channelNameWithHandle(p)}
              >
                <ChannelAvatar integration={p} size={22} />
              </span>
            ))}
          </span>
        )}
        <span className="truncate">{label}</span>
        {!!count && (
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            className={clsx('shrink-0 text-pqSoft', pickerOpen && 'rotate-180')}
          >
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {pickerOpen && !mobile && (
        <div
          ref={floatingRef}
          role="dialog"
          aria-label={t('choose_channels', 'Choose channels')}
          className="z-[80] flex max-h-[min(460px,70vh)] w-[340px] flex-col overflow-hidden rounded-[16px] border border-pqBorder bg-pqPop shadow-menu"
        >
          <AgentList selected={properties} onChange={onChannelsChange} />
        </div>
      )}
      {mobile && (
        <MobileSheet
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          title={t('agent_posting_to', 'Posting to')}
          footer={
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="h-[46px] w-full rounded-[10px] bg-pqBrand text-[14.5px] font-[600] text-pqOnBrand"
            >
              {t('done', 'Done')}
            </button>
          }
        >
          <AgentList selected={properties} onChange={onChannelsChange} />
        </MobileSheet>
      )}
    </div>
  );
};

/** Per card, per group: what the person did with a Post Preview. */
export type ThreadCardOutcomes = Record<string, Record<string, unknown>>;
/** Per card, per group: the attachments put on it after it was drawn. */
export type ThreadCardMedia = Record<
  string,
  Record<string, { id: string; path: string; thumbnail?: string }[]>
>;

/**
 * One per-card, per-group map kept with the thread (`metadata.pq[key]`):
 * what was saved plus what this page wrote on top, scoped to the thread (a
 * fresh chat's move from `new` to its id carries the local part over).
 * "Schedule all" and `publishFromCard` write several entries from one
 * closure, so the merge base is a ref updated on the spot.
 */
const useThreadCardMap = <T,>(
  routeId: string,
  saved: Record<string, Record<string, T>> | undefined,
  key: 'cards' | 'media',
  save: (patch: Record<string, unknown>) => Promise<void>
) => {
  const [local, setLocal] = useState<{
    routeId: string;
    entries: Record<string, Record<string, T>>;
  }>({ routeId, entries: {} });
  useEffect(() => {
    if (routeId !== 'new') {
      setLocal((prev) =>
        prev.routeId === 'new' ? { ...prev, routeId } : prev
      );
    }
  }, [routeId]);
  const merged = useMemo<Record<string, Record<string, T>>>(() => {
    const entries = local.routeId === routeId ? local.entries : {};
    const out: Record<string, Record<string, T>> = { ...(saved || {}) };
    for (const [cardId, groups] of Object.entries(entries)) {
      out[cardId] = { ...(out[cardId] || {}), ...groups };
    }
    return out;
  }, [saved, local, routeId]);
  const latest = useRef(merged);
  useEffect(() => {
    latest.current = merged;
  }, [merged]);
  const set = useCallback(
    (cardId: string, groupKey: string, value: T) => {
      const base = latest.current;
      const next = {
        ...base,
        [cardId]: { ...(base[cardId] || {}), [groupKey]: value },
      };
      latest.current = next;
      setLocal({ routeId, entries: next });
      if (routeId !== 'new') {
        void save({ [key]: next });
      }
    },
    [routeId, key, save]
  );
  return { value: merged, set };
};

export const PropertiesContext = createContext<{
  /** The channels selected in the Channels column. */
  properties: any[];
  /**
   * Every channel of the account. A Post Preview card from an earlier chat
   * names its channel from here, whether or not it is selected right now.
   */
  allChannels: any[];
  /** Opens the channel picker (the "Posting to" pill in the message box). */
  openChannels: () => void;
  onChannelsChange: (next: Integrations[]) => void;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  /** Text an empty-state suggestion puts in the message box; `n` makes a repeat land. */
  composerSeed: { text: string; n: number };
  seedComposer: (text: string) => void;
  /** Outcomes of the Post Preview cards in this thread, keyed by card id. */
  cards: ThreadCardOutcomes;
  setCardOutcome: (cardId: string, groupKey: string, outcome: unknown) => void;
  /** Attachments put on a card's group after it was drawn (the image changed from chat or the menu). */
  media: ThreadCardMedia;
  setCardMedia: (
    cardId: string,
    groupKey: string,
    attachments: { id: string; path: string }[]
  ) => void;
}>({
  properties: [],
  allChannels: [],
  openChannels: () => {},
  onChannelsChange: () => {},
  pickerOpen: false,
  setPickerOpen: () => {},
  composerSeed: { text: '', n: 0 },
  seedComposer: () => {},
  cards: {},
  setCardOutcome: () => {},
  media: {},
  setCardMedia: () => {},
});

/**
 * Keeps the channel selection and the card outcomes with the thread.
 * Reopening a thread restores the channels that were selected while
 * chatting, resolved against the live list so a deleted channel, or one that
 * now needs a reconnect, simply drops out. Only the person's own changes are
 * written back. Mastra names a thread after its first run and that write
 * overwrites metadata saved in between, so both channels and card outcomes
 * are written as soon as the thread has an id and once more when the title
 * lands.
 */
const useThreadSync = (
  routeId: string,
  properties: Integrations[],
  setProperties: (next: Integrations[]) => void
) => {
  const fetch = useFetch();
  const { data: integrations } = useIntegrationList();
  const { data: threads } = useCopilotThreads();
  const { data: state, mutate: mutateState } = useThreadState(routeId);
  const titled = !!threads?.threads?.find((p) => p.id === routeId)?.title;
  // `dirty`: a selection change not written yet. `touched`: the person
  // changed the selection of this thread at all, so the title-time flush
  // may write it (a restored selection is never written back by itself).
  const dirty = useRef(false);
  const touched = useRef(false);
  const restoredFor = useRef<string | null>(null);

  // Writes go out one after the other, so a later, fuller state can never
  // be overtaken by an earlier one.
  const queue = useRef(Promise.resolve());
  const save = useCallback(
    (patch: Record<string, unknown>) => {
      queue.current = queue.current.then(async () => {
        const response = await fetch(`/copilot/${routeId}/state`, {
          method: 'POST',
          body: JSON.stringify({ surface: 'agent', ...patch }),
        });
        if (response.ok) {
          void mutateState(await response.json(), { revalidate: false });
        }
      });
      return queue.current;
    },
    [fetch, routeId, mutateState]
  );

  const onChange = useCallback(
    (next: Integrations[]) => {
      dirty.current = true;
      touched.current = true;
      setProperties(next);
    },
    [setProperties]
  );

  const { value: cards, set: setCardOutcome } = useThreadCardMap<unknown>(
    routeId,
    state?.cards as ThreadCardOutcomes | undefined,
    'cards',
    save
  );
  const { value: media, set: setCardMedia } = useThreadCardMap<
    { id: string; path: string }[]
  >(routeId, state?.media as ThreadCardMedia | undefined, 'media', save);

  // The title arriving is the one moment a write may have been lost.
  const flushedFor = useRef<string | null>(null);
  useEffect(() => {
    if (routeId === 'new' || !titled || flushedFor.current === routeId) {
      return;
    }
    flushedFor.current = routeId;
    const patch: Record<string, unknown> = {};
    if (Object.keys(cards).length) {
      patch.cards = cards;
    }
    if (Object.keys(media).length) {
      patch.media = media;
    }
    if (touched.current) {
      patch.channels = properties.map((p) => p.id);
    }
    if (Object.keys(patch).length) {
      void save(patch);
    }
  }, [routeId, titled, cards, media, properties, save]);

  // `Agent` lives in the layout, so a selection changed on one thread is
  // still "dirty" when a Chats link opens another: without this it would be
  // written into that thread before its own channels arrive. A fresh chat's
  // move to its id is not a navigation (the list does not know the id yet).
  const knownThreads = useRef(threads);
  useEffect(() => {
    knownThreads.current = threads;
  }, [threads]);
  useEffect(() => {
    if (
      routeId !== 'new' &&
      knownThreads.current?.threads?.some((p) => p.id === routeId)
    ) {
      dirty.current = false;
      touched.current = false;
    }
  }, [routeId]);

  useEffect(() => {
    if (routeId === 'new' || !state || !integrations?.length) {
      return;
    }
    if (restoredFor.current === routeId) {
      return;
    }
    restoredFor.current = routeId;
    if (!Array.isArray(state.channels)) {
      return;
    }
    const saved = state.channels;
    // Same resolution as add.edit.modal.tsx: find each saved id in the live
    // list and keep only the channels that can still post.
    setProperties(
      saved
        .map((id) => integrations.find((p: Integrations) => p.id === id))
        .filter(
          (p): p is Integrations & { refreshNeeded?: boolean } =>
            !!p && !needsAttention(p)
        )
    );
  }, [routeId, state, integrations, setProperties]);

  // Written as soon as the thread has an id (its first run created it);
  // the flush above repeats it once the title is in.
  useEffect(() => {
    if (routeId === 'new' || !dirty.current) {
      return;
    }
    dirty.current = false;
    void save({ channels: properties.map((p) => p.id) });
  }, [routeId, properties, save]);

  return {
    onChange,
    cards,
    setCardOutcome,
    media,
    setCardMedia,
    allChannels: integrations || [],
  };
};

export const Agent: FC<{ children: ReactNode }> = ({ children }) => {
  const [properties, setProperties] = useState<Integrations[]>([]);
  const routeId = useAgentRouteId();
  const {
    onChange: onChannelsChange,
    cards,
    setCardOutcome,
    media,
    setCardMedia,
    allChannels,
  } = useThreadSync(routeId, properties, setProperties);
  const t = useT();
  const user = useUser();
  const { mobile } = useViewport();
  const rowRef = useRef<HTMLDivElement>(null);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [drawerTop, setDrawerTop] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [composerSeed, setComposerSeed] = useState({ text: '', n: 0 });
  // Design: Copilot waits until the trial ends (or the person ends it early).
  // Lock-until-paid also blocks when the deferred founding fee is still owed.
  const trialLocked =
    !!user?.isTrailing || !!user?.lifetimePaymentPending;

  // A channel that was deleted, or now needs a reconnect, leaves the
  // selection the moment the live list says so, whether or not the picker
  // is open.
  useEffect(() => {
    if (!allChannels.length) return;
    const next = properties.filter((p) => {
      const row = allChannels.find((d: Integrations) => d.id === p.id);
      return row && !needsAttention(row);
    });
    if (next.length !== properties.length) {
      onChannelsChange(next);
    }
  }, [allChannels, properties, onChannelsChange]);

  // Below 760 the Chats list leaves the chat no room, so it becomes a sheet
  // opened from the chat's own bar, below the app chrome.
  const asDrawer = mobile;

  useEffect(() => {
    if (!asDrawer) {
      setChatsOpen(false);
      return;
    }
    // The drawers open *below* the app chrome rather than over it, so their top
    // is measured rather than assumed — same reason as in `rail.tsx`.
    const measure = () =>
      setDrawerTop(
        Math.max(0, rowRef.current?.getBoundingClientRect().top ?? 0)
      );
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [asDrawer]);

  useEffect(() => {
    if (!chatsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChatsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatsOpen]);

  const openChannels = useCallback(() => setPickerOpen(true), []);
  const seedComposer = useCallback(
    (text: string) => setComposerSeed((prev) => ({ text, n: prev.n + 1 })),
    []
  );

  return (
    <PropertiesContext.Provider
      value={{
        properties,
        allChannels,
        openChannels,
        onChannelsChange,
        pickerOpen,
        setPickerOpen,
        composerSeed,
        seedComposer,
        cards,
        setCardOutcome,
        media,
        setCardMedia,
      }}
    >
      <div ref={rowRef} className="relative flex min-w-0 flex-1">
        {!asDrawer && <Threads />}

        <div className="bg-pqInner relative flex flex-1 flex-col min-w-0">
          {trialLocked && (
            <TrialLockCard
              variant="overlay"
              name={t('ai_copilot', 'AI Copilot')}
              title={t(
                'ai_copilot_unlocks_after_your_trial',
                'AI Copilot unlocks after your trial'
              )}
              description={t(
                'ai_lock_sub',
                'Your channels, calendar and analytics are already live. Copilot unlocks with your first payment.'
              )}
              perks={[
                t(
                  'ai_lock_perk_chat',
                  'Copilot chat that drafts and schedules for you'
                ),
                ...(user?.tier?.image_generator
                  ? [
                      t('plan_n_ai_images', '{{count}} AI Images per month', {
                        count: user.tier.image_generation_count,
                      }),
                    ]
                  : []),
                ...(user?.tier?.generate_videos
                  ? [
                      t('plan_n_ai_videos', '{{count}} AI Videos per month', {
                        count: user.tier.generate_videos,
                      }),
                    ]
                  : []),
              ]}
            />
          )}
          <ChatBar onOpenChats={() => setChatsOpen(true)} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        </div>

        {asDrawer && chatsOpen && (
          <div
            onClick={() => setChatsOpen(false)}
            style={{ top: drawerTop }}
            className="fixed inset-x-0 bottom-0 z-[72] bg-pqPopup"
          />
        )}
        {asDrawer && (
          <AgentDrawer
            active
            open={chatsOpen}
            side="start"
            top={drawerTop}
            label={t('chats', 'Chats')}
          >
            <Threads sheet onNavigate={() => setChatsOpen(false)} />
          </AgentDrawer>
        )}
      </div>
    </PropertiesContext.Provider>
  );
};

/**
 * Off-canvas wrapper for one of the agent page's side columns. Inactive it is
 * a passthrough, so the desktop layout is byte-identical to before. Active, it
 * clips the parked drawer — a panel parked a full width outside the viewport
 * widens the page in RTL otherwise, which is the bug `rail.tsx` hit.
 */
const AgentDrawer: FC<{
  active: boolean;
  open: boolean;
  side: 'start' | 'end';
  top: number;
  label: string;
  children: ReactNode;
}> = ({ active, open, side: _side, top, label, children }) => {
  if (!active) return <>{children}</>;
  return (
    <div
      style={{ top }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[78] overflow-hidden"
    >
      <div
        {...(open ? { role: 'dialog', 'aria-modal': true } : {})}
        aria-label={label}
        aria-hidden={!open}
          className={clsx(
            'pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[min(80dvh,640px)] w-full flex-col overflow-hidden rounded-t-[16px] bg-pqInner pb-[env(safe-area-inset-bottom)] shadow-pqE3 transition-transform duration-200 ease-out',
            !open && 'translate-y-[104%]'
          )}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * Rename, delete and clear, shared by the Chats list and the chat's own
 * header. Chats belong to the workspace, so the confirmations say that a
 * delete reaches everyone. Titles are interpolated unescaped: they are the
 * person's own text and React escapes them where they are drawn.
 */
const useThreadActions = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const router = useRouter();
  const routeId = useAgentRouteId();
  const { mutate } = useCopilotThreads();

  const rename = useCallback(
    async (id: string, title: string) => {
      const name = title.trim();
      if (!name) {
        return false;
      }
      const response = await fetch(`/copilot/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: name }),
      });
      if (!response.ok) {
        toaster.show(
          t('chat_rename_failed', 'Could not rename this chat, please try again'),
          'warning'
        );
        return false;
      }
      await mutate();
      return true;
    },
    [fetch, mutate, t, toaster]
  );

  const remove = useCallback(
    async (id: string, title: string) => {
      if (
        !(await deleteDialog(
          t(
            'delete_chat_body',
            '"{{title}}" will be deleted for everyone in your workspace. Posts it scheduled and images it made stay where they are.',
            { title, interpolation: { escapeValue: false } }
          ),
          t('delete_chat_confirm', 'Delete chat'),
          t('delete_chat_title', 'Delete this chat?')
        ))
      ) {
        return;
      }
      const response = await fetch(`/copilot/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        toaster.show(
          response.status === 409
            ? t(
                'chat_still_answering',
                'This chat is still answering. Try again when it has finished.'
              )
            : t('chat_delete_failed', 'Could not delete this chat, please try again'),
          'warning'
        );
        return;
      }
      await mutate();
      toaster.show(t('chat_deleted', 'Chat deleted'), 'success');
      if (id === routeId) {
        router.push('/agents');
      }
    },
    [fetch, mutate, routeId, router, t, toaster]
  );

  const clearAll = useCallback(
    async (count: number) => {
      if (
        !(await deleteDialog(
          t(
            'clear_chats_body',
            'Every Copilot chat in your workspace will be deleted for everyone. Scheduled posts and your media library are not affected. This can\'t be undone.'
          ),
          t('clear_chats_confirm', 'Clear all chats'),
          t('clear_chats_title', 'Clear all {{count}} chats?', { count })
        ))
      ) {
        return;
      }
      const response = await fetch('/copilot', { method: 'DELETE' });
      if (!response.ok) {
        toaster.show(
          t('chats_clear_failed', 'Could not clear the chats, please try again'),
          'warning'
        );
        return;
      }
      const { running } = (await response.json()) as { running: number };
      await mutate();
      toaster.show(
        running
          ? t(
              'chats_cleared_kept_running',
              'Chats cleared. {{count}} still answering were kept.',
              { count: running }
            )
          : t('chats_cleared', 'Chats cleared'),
        'success'
      );
      if (routeId !== 'new') {
        router.push('/agents');
      }
    },
    [fetch, mutate, routeId, router, t, toaster]
  );

  return { rename, remove, clearAll };
};

type ThreadRowData = {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Today / Yesterday / Previous 7 days / Earlier, by last activity. */
const useThreadGroups = (threads: ThreadRowData[]) => {
  const t = useT();
  return useMemo(() => {
    const today = newDayjs().startOf('day');
    const groups: { key: string; label: string; rows: ThreadRowData[] }[] = [
      { key: 'today', label: t('chat_group_today', 'Today'), rows: [] },
      { key: 'yesterday', label: t('chat_group_yesterday', 'Yesterday'), rows: [] },
      { key: 'week', label: t('chat_group_week', 'Previous 7 days'), rows: [] },
      { key: 'earlier', label: t('chat_group_earlier', 'Earlier'), rows: [] },
    ];
    for (const thread of threads) {
      const at = newDayjs(thread.updatedAt || thread.createdAt);
      const index = !at.isValid()
        ? 3
        : !at.isBefore(today)
        ? 0
        : !at.isBefore(today.subtract(1, 'day'))
        ? 1
        : !at.isBefore(today.subtract(7, 'day'))
        ? 2
        : 3;
      groups[index].rows.push(thread);
    }
    return groups.filter((group) => group.rows.length);
  }, [threads, t]);
};

/** The searched part of a title, marked. */
const Highlight: FC<{ text: string; query: string }> = ({ text, query }) => {
  const q = query.trim();
  const at = q ? text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase()) : -1;
  if (at < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[3px] bg-pqBrandSoft px-[1px] text-pqFocused">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
};

const ThreadRow: FC<{
  thread: ThreadRowData;
  active: boolean;
  query: string;
  touch: boolean;
  renaming: boolean;
  setRenaming: (id: string | null) => void;
  onOpen?: () => void;
  onActions?: (thread: ThreadRowData) => void;
}> = ({ thread, active, query, touch, renaming, setRenaming, onOpen, onActions }) => {
  const t = useT();
  const { rename, remove } = useThreadActions();
  const [value, setValue] = useState(thread.title || '');
  const title = thread.title || '';

  if (renaming) {
    const save = async () => {
      if (value.trim() && value.trim() !== title) {
        await rename(thread.id, value);
      }
      setRenaming(null);
    };
    return (
      <div className="flex h-[34px] items-center gap-[2px] rounded-pqSm bg-pqPop ps-[10px] pe-[3px] shadow-[inset_0_0_0_1.5px_var(--brand)] mobile:h-[44px]">
        <input
          autoFocus
          value={value}
          maxLength={120}
          aria-label={t('chat_name', 'Chat name')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setRenaming(null);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-pqText outline-none"
        />
        <RowIconButton label={t('save_name', 'Save name')} onClick={() => void save()}>
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </RowIconButton>
        <RowIconButton label={t('cancel', 'Cancel')} onClick={() => setRenaming(null)}>
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </RowIconButton>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'group/row flex h-[34px] items-center rounded-pqSm transition-colors mobile:h-[44px]',
        active ? 'bg-pqNavOn text-pqText' : 'text-pqMuted hover:bg-pqHover hover:text-pqText'
      )}
    >
      <Link
        href={`/agents/${thread.id}`}
        onClick={onOpen}
        className={clsx(
          'min-w-0 flex-1 truncate ps-[10px] pe-[6px] text-[13.5px] leading-[34px] outline-none mobile:text-[14px] mobile:leading-[44px]',
          active && 'font-[600]'
        )}
      >
        <Highlight text={title} query={query} />
      </Link>
      {touch ? (
        <RowIconButton
          label={t('chat_actions', 'Chat actions')}
          onClick={() => onActions?.(thread)}
          size={40}
        >
          <circle cx="5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </RowIconButton>
      ) : (
        <span className="hidden shrink-0 items-center gap-[1px] pe-[3px] group-focus-within/row:flex group-hover/row:flex">
          <RowIconButton label={t('rename_chat', 'Rename')} onClick={() => setRenaming(thread.id)}>
            <path d="M12 20h9M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </RowIconButton>
          <RowIconButton
            label={t('delete_chat', 'Delete chat')}
            danger
            onClick={() => void remove(thread.id, title)}
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </RowIconButton>
        </span>
      )}
    </div>
  );
};

const RowIconButton: FC<{
  label: string;
  onClick: () => void;
  danger?: boolean;
  size?: number;
  children: ReactNode;
}> = ({ label, onClick, danger, size = 26, children }) => (
  <button
    type="button"
    aria-label={label}
    data-tooltip-id="tooltip"
    data-tooltip-content={label}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    }}
    style={{ width: size, height: size }}
    className={clsx(
      'grid shrink-0 place-items-center rounded-[7px] transition-colors hover:bg-pqHover',
      danger ? 'text-pqDanger' : 'text-pqSoft hover:text-pqText'
    )}
  >
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
      {children}
    </svg>
  </button>
);

/**
 * The Chats list: New chat, search, the chats grouped by day, and per-chat
 * rename and delete. Desktop and tablet show it beside the chat; a phone gets
 * it in a sheet (`sheet`), where rows carry a ⋯ button instead of hover
 * actions.
 */
const Threads: FC<{ sheet?: boolean; onNavigate?: () => void }> = ({
  sheet = false,
  onNavigate,
}) => {
  const t = useT();
  const user = useUser();
  // From the pathname, so the row lights up once a fresh thread's address
  // has been moved to its id.
  const id = useAgentRouteId();
  const { clearAll, remove } = useThreadActions();

  const { data, isLoading } = useCopilotThreads();
  // A thread is named after its first run finishes; until then, and for the
  // runs that failed before a reply, there is nothing to show but a blank
  // row. The chat refreshes this list until the title arrives.
  const threads = useMemo(
    () => (data?.threads || []).filter((p) => !!p.title),
    [data]
  );
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<ThreadRowData | null>(null);
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return q
      ? threads.filter((p) => (p.title || '').toLocaleLowerCase().includes(q))
      : threads;
  }, [threads, query]);
  const groups = useThreadGroups(query.trim() ? [] : matches);
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(user?.role!);

  const [collapseRail, setCollapseRail] = useCookie('agentRailCollapse', '0');
  const collapsed = !sheet && collapseRail === '1';

  if (collapsed) {
    return (
      <div
        data-pq="agent-chats"
        className="flex w-[56px] shrink-0 flex-col items-center gap-[6px] border-e border-pqLine bg-pqInner pt-[14px]"
      >
        <RailIconButton
          label={t('show_chats', 'Show chats')}
          onClick={() => setCollapseRail('0', { days: 365 })}
        >
          <rect x="3" y="4" width="18" height="16" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9 4v16" stroke="currentColor" strokeWidth="1.7" />
        </RailIconButton>
        <Link
          href="/agents"
          aria-label={t('new_chat', 'New chat')}
          data-tooltip-id="tooltip"
          data-tooltip-content={t('new_chat', 'New chat')}
          className="grid size-[34px] place-items-center rounded-[9px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
        >
          <NewChatGlyph />
        </Link>
      </div>
    );
  }

  const row = (p: ThreadRowData) => (
    <ThreadRow
      key={p.id}
      thread={p}
      active={p.id === id}
      query={query}
      touch={sheet}
      renaming={renaming === p.id}
      setRenaming={setRenaming}
      onOpen={onNavigate}
      onActions={setActionsFor}
    />
  );

  return (
    <div
      data-pq="agent-chats"
      className={clsx(
        'flex min-h-0 shrink-0 flex-col bg-pqInner',
        sheet ? 'w-full flex-1' : 'w-[272px] border-e border-pqLine'
      )}
    >
      <div className="flex shrink-0 flex-col gap-[10px] p-[14px_14px_0]">
        <div className="flex h-[30px] items-center gap-[8px]">
          <span className="font-display text-[14px] font-[700] text-pqText">
            {t('chats', 'Chats')}
          </span>
          {!!threads.length && (
            <span className="text-[12px] font-[500] text-pqSoft">
              {threads.length}
            </span>
          )}
          {!sheet && (
            <span className="ms-auto">
              <RailIconButton
                label={t('hide_chats', 'Hide chats')}
                onClick={() => setCollapseRail('1', { days: 365 })}
              >
                <rect x="3" y="4" width="18" height="16" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M9 4v16" stroke="currentColor" strokeWidth="1.7" />
              </RailIconButton>
            </span>
          )}
        </div>
        <Link
          href="/agents"
          onClick={onNavigate}
          data-pq="agent-new-chat"
          className="flex h-[36px] items-center justify-center gap-[7px] rounded-[9px] bg-pqPop text-[13px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover mobile:h-[44px]"
        >
          <NewChatGlyph />
          {t('new_chat', 'New chat')}
        </Link>
        <label className="flex h-[34px] items-center gap-[8px] rounded-[9px] bg-pqPop px-[10px] shadow-[inset_0_0_0_1px_var(--border)] focus-within:shadow-[inset_0_0_0_1.5px_var(--brand)] mobile:h-[42px]">
          <SearchGlyph />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search_chats', 'Search chats')}
            aria-label={t('search_chats', 'Search chats')}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-pqText outline-none placeholder:text-pqSoft"
          />
          {!!query && (
            <RowIconButton label={t('clear_search', 'Clear search')} onClick={() => setQuery('')} size={24}>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </RowIconButton>
          )}
        </label>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-[2px_8px_8px]">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className={clsx(
                'mt-[6px] h-[26px] rounded-pqSm',
                i % 3 === 0 ? 'w-[86%]' : i % 3 === 1 ? 'w-[68%]' : 'w-[77%]'
              )}
            />
          ))}
        {!isLoading && !threads.length && (
          <div className="flex flex-col items-center gap-[8px] px-[8px] py-[28px] text-center">
            <span className="grid size-[36px] place-items-center rounded-pqMd bg-pqSettings text-pqSoft">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path
                  d="M9 6.5h11M9 12h11M9 17.5h7M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="text-[12.5px] text-pqMuted">
              {t('no_chats_yet', 'No chats yet')}
            </div>
          </div>
        )}
        {!!query.trim() && (
          <>
            <div className="px-[10px] pb-[5px] pt-[14px] text-[11.5px] font-[600] text-pqSoft">
              {matches.length
                ? t('chat_search_results', 'Results')
                : t('no_chats_match', 'No chats match')}
            </div>
            {matches.map(row)}
          </>
        )}
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col">
            <div className="px-[10px] pb-[5px] pt-[14px] text-[11.5px] font-[600] text-pqSoft">
              {group.label}
            </div>
            {group.rows.map(row)}
          </div>
        ))}
      </div>
      <div className="flex h-[48px] shrink-0 items-center gap-[8px] border-t border-pqLine ps-[14px] pe-[10px] mobile:h-[56px]">
        <span className="flex min-w-0 items-center gap-[7px] text-[12px] text-pqSoft">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" className="shrink-0">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate">{t('chats_visible_to_team', 'Visible to your team')}</span>
        </span>
        {isAdmin && !!threads.length && (
          <button
            type="button"
            data-pq="agent-clear-chats"
            onClick={() => void clearAll(threads.length)}
            className="ms-auto flex h-[28px] shrink-0 items-center gap-[6px] rounded-[7px] px-[8px] text-[12px] font-[600] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqDanger mobile:h-[40px]"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none">
              <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('clear_all_chats_short', 'Clear all')}
          </button>
        )}
      </div>
      {sheet && (
        <MobileSheet
          open={!!actionsFor}
          onClose={() => setActionsFor(null)}
          title={actionsFor?.title || t('chat_actions', 'Chat actions')}
        >
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                setRenaming(actionsFor!.id);
                setActionsFor(null);
              }}
              className="flex h-[52px] items-center gap-[12px] px-[4px] text-[15px] font-[500] text-pqText"
            >
              {t('rename_chat', 'Rename')}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = actionsFor!;
                setActionsFor(null);
                void remove(target.id, target.title || '');
              }}
              className="flex h-[52px] items-center gap-[12px] px-[4px] text-[15px] font-[500] text-pqDanger"
            >
              {t('delete_chat', 'Delete chat')}
            </button>
          </div>
        </MobileSheet>
      )}
    </div>
  );
};

const RailIconButton: FC<{ label: string; onClick: () => void; children: ReactNode }> = ({
  label,
  onClick,
  children,
}) => (
  <button
    type="button"
    aria-label={label}
    data-tooltip-id="tooltip"
    data-tooltip-content={label}
    onClick={onClick}
    className="grid size-[30px] place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
  >
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      {children}
    </svg>
  </button>
);

const NewChatGlyph: FC = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" className="shrink-0">
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12.4 14.6l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The chat's own header: its name, renamed in place, and delete. On a phone
 * it also carries the way to the Chats sheet and to a new chat.
 */
const ChatBar: FC<{ onOpenChats?: () => void }> = ({ onOpenChats }) => {
  const t = useT();
  const routeId = useAgentRouteId();
  const { data } = useCopilotThreads();
  const { rename, remove } = useThreadActions();
  const { mobile } = useViewport();
  const thread = data?.threads?.find((p) => p.id === routeId);
  const title = thread?.title || t('new_chat', 'New chat');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const save = async () => {
    if (thread && value.trim() && value.trim() !== thread.title) {
      await rename(thread.id, value);
    }
    setEditing(false);
  };

  return (
    <div
      data-pq="agent-chat-bar"
      className="flex h-[52px] shrink-0 items-center gap-[4px] border-b border-pqLine px-[16px] mobile:h-[48px] mobile:px-[6px]"
    >
      {mobile && (
        <button
          type="button"
          data-pq="agent-threads"
          onClick={onOpenChats}
          className="flex h-[40px] shrink-0 items-center gap-[7px] rounded-[9px] px-[10px] text-[13.5px] font-[600] text-pqText"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('chats', 'Chats')}
        </button>
      )}
      {editing ? (
        <input
          autoFocus
          value={value}
          maxLength={120}
          aria-label={t('chat_name', 'Chat name')}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="h-[32px] min-w-0 max-w-[420px] flex-1 rounded-[8px] bg-pqPop px-[8px] font-display text-[14px] font-[600] text-pqText shadow-[inset_0_0_0_1.5px_var(--brand)] outline-none"
        />
      ) : (
        <span
          className={clsx(
            'min-w-0 truncate font-display text-[14px] font-[600] text-pqText',
            mobile && 'flex-1 text-center font-[500] text-pqMuted'
          )}
        >
          {title}
        </span>
      )}
      {!!thread?.title && !editing && !mobile && (
        <span className="flex shrink-0 items-center">
          <RowIconButton
            label={t('rename_chat', 'Rename')}
            onClick={() => {
              setValue(thread.title || '');
              setEditing(true);
            }}
            size={30}
          >
            <path d="M12 20h9M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </RowIconButton>
          <RowIconButton
            label={t('delete_chat', 'Delete chat')}
            danger
            onClick={() => void remove(thread.id, thread.title || '')}
            size={30}
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </RowIconButton>
        </span>
      )}
      {mobile && (
        <Link
          href="/agents"
          aria-label={t('new_chat', 'New chat')}
          className="grid size-[44px] shrink-0 place-items-center rounded-[9px] text-pqText"
        >
          <NewChatGlyph />
        </Link>
      )}
    </div>
  );
};
