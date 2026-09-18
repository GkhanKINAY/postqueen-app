'use client';

import {
  createContext,
  FC,
  FormEvent,
  ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import clsx from 'clsx';
import NextLink from 'next/link';
import {
  AssistantMessage as CopilotAssistantMessage,
  AssistantMessageProps,
  CopilotChat,
  CopilotKitCSSProperties,
  InputProps,
  RenderSuggestionsListProps,
  UserMessageProps,
  useChatContext,
} from '@copilotkit/react-ui';
import {
  CatchAllActionRenderProps,
  CopilotKit,
  useCopilotAction,
  useCopilotChatInternal,
} from '@copilotkit/react-core';
import { GeneratedMediaCard } from '@gitroom/frontend/components/media/generated.media.card';
import {
  LiveMessagesContext,
  ToolStep,
  useExtraToolCalls,
} from '@gitroom/frontend/components/agents/agent.tool.step';
import {
  GenerateImageFailure,
  isGeneratedImage,
  useGenerateImage,
  useGenerateImageFailureCopy,
} from '@gitroom/frontend/components/media/use.generate.image';
import {
  isVideoJobStart,
  useStartVideo,
  useVideoStartFailureCopy,
  VideoJobMedia,
  VideoJobStartFailure,
} from '@gitroom/frontend/components/media/use.generate.video';
import { VideoJobCard } from '@gitroom/frontend/components/media/video.job.card';
import { v4 as uuid } from 'uuid';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import { useAiAvailable, useUser } from '@gitroom/frontend/components/layout/user.context';
import { useLaunchStore, Values } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { TrialLockCard } from '@gitroom/frontend/components/billing/trial-lock-card';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { formatChannelHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { Button } from '@gitroom/react/form/button';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import AutoResizingTextarea from '@gitroom/frontend/components/agents/agent.textarea';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { draftContentHtml } from '@gitroom/frontend/components/agents/agent.draft.card';
import {
  CopilotProperties,
  PQ_AI_THREAD_SETTING,
} from '@gitroom/helpers/utils/copilot.context';

export type StudioRail = 'preview' | 'assistant';

const ComposerThreadContext = createContext<{
  threadId: string;
  /** Whether a message was sent in this composer; the setting is written only then. */
  used: () => boolean;
  markUsed: () => void;
}>({ threadId: '', used: () => false, markUsed: () => {} });

export const useComposerThread = () => useContext(ComposerThreadContext);

/**
 * Create Post's own CopilotKit provider: the same `postqueen` agent as the
 * Copilot page, in a thread of its own per composer, with the surface and
 * the selected channels in `properties.pq` for the prompt. The layout-level
 * provider (`/copilot/chat`, no thread) used to serve every composer ever
 * opened in the session from one shared conversation.
 */
export const ComposerCopilotProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const aiOk = useAiAvailable();
  const { backendUrl } = useVariables();
  const i18n = useTranslationSettings();
  const existingData = useExistingData();
  // A post that was written with Copilot reopens on its own thread.
  const [threadId] = useState(() => {
    const saved = existingData?.settings?.[PQ_AI_THREAD_SETTING];
    return typeof saved === 'string' && saved ? saved : uuid();
  });
  const usedRef = useRef(false);
  const thread = useMemo(
    () => ({
      threadId,
      used: () => usedRef.current,
      markUsed: () => {
        usedRef.current = true;
      },
    }),
    [threadId]
  );
  const selectedIntegrations = useLaunchStore(
    (state) => state.selectedIntegrations
  );
  const properties = useMemo(
    (): { pq: CopilotProperties } => ({
      pq: {
        surface: 'composer',
        channels: selectedIntegrations.map(({ integration }) => ({
          id: integration.id,
          platform: integration.identifier,
          name: integration.name,
          handle: formatChannelHandle(integration.display) || undefined,
          format: integration.editor,
          customer: integration.customer?.name || undefined,
        })),
        timezone: getTimezone(),
        locale: i18n.resolvedLanguage || i18n.language || 'en',
      },
    }),
    [selectedIntegrations, i18n.resolvedLanguage, i18n.language]
  );
  if (!aiOk) {
    return (
      <ComposerThreadContext.Provider value={thread}>
        {children}
      </ComposerThreadContext.Provider>
    );
  }
  return (
    <ComposerThreadContext.Provider value={thread}>
      <CopilotKit
        threadId={threadId}
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/agent'}
        showDevConsole={false}
        enableInspector={false}
        agent="postqueen"
        properties={properties}
      >
        {children}
      </CopilotKit>
    </ComposerThreadContext.Provider>
  );
};

const StudioRailContext = createContext<{
  rail: StudioRail;
  setRail: (rail: StudioRail) => void;
}>({
  rail: 'preview',
  setRail: () => undefined,
});

export const StudioRailProvider: FC<{
  rail: StudioRail;
  setRail: (rail: StudioRail) => void;
  children: ReactNode;
}> = ({ rail, setRail, children }) => (
  <StudioRailContext.Provider value={{ rail, setRail }}>
    {children}
  </StudioRailContext.Provider>
);

export const useStudioRail = () => useContext(StudioRailContext);

/**
 * A quick edit is the chip's label in the user's language plus a marker the
 * server prompt keys the rewrite rules on. The label is what the person sees
 * in their bubble; the marker is stripped there (`ComposeAiUserMessage`).
 */
type QuickEditKind = 'rephrase' | 'shorten' | 'expand' | 'casual' | 'formal';
const QUICK_EDIT_MARK = /\s*\[quick-edit:[a-z]+\]/g;
const quickEditMessage = (title: string, kind: QuickEditKind) =>
  `${title} [quick-edit:${kind}]`;
const quickEditKind = (message: string) =>
  (message.match(/\[quick-edit:([a-z]+)\]/)?.[1] || '') as QuickEditKind | '';
const QUICK_EDIT_MARKS: Record<QuickEditKind, string> = {
  rephrase: '🔄',
  shorten: '✂️',
  expand: '➕',
  casual: '😊',
  formal: '💼',
};

/**
 * Replaces the thread the editor shows with `posts`, the way the old
 * `setPosts` did: new ids so TipTap remounts (it reads `content` once), the
 * media of each item kept by index. Returns what was there, for Undo.
 */
const applySuggestion = (posts: string[]): Values[] => {
  const { current, internal, global, setGlobalValue, setInternalValue } =
    useLaunchStore.getState();
  const entry = internal.find((p) => p.integration.id === current);
  const items = entry ? entry.integrationValue : global;
  const next: Values[] = posts.map((content, index) => ({
    id: makeId(10),
    delay: items[index]?.delay || 0,
    media: items[index]?.media || [],
    content: draftContentHtml(content),
  }));
  if (entry) {
    setInternalValue(current, next);
  } else {
    setGlobalValue(next);
  }
  return items;
};

const restoreSuggestion = (snapshot: Values[]) => {
  const { current, internal, setGlobalValue, setInternalValue } =
    useLaunchStore.getState();
  const entry = internal.find((p) => p.integration.id === current);
  if (entry) {
    setInternalValue(current, snapshot);
  } else {
    setGlobalValue(snapshot);
  }
};

/** Undo snapshots by key; gone with the page, which is what Undo should be. */
const undoSnapshots = new Map<string, Values[]>();

/**
 * Attaches media to one thread item, the way the toolbar's AI Image does,
 * and returns that item's media as it was, for Undo. Reads the store on the
 * spot: a card's button runs long after the tool handler that drew it.
 */
const attachMedia = (
  index: number,
  media: { id: string; path: string; thumbnail?: string }[]
): { id: string; path: string; thumbnail?: string }[] => {
  const {
    current,
    internal,
    global,
    appendGlobalValueMedia,
    appendInternalValueMedia,
  } = useLaunchStore.getState();
  const entry = internal.find((p) => p.integration.id === current);
  const before = (entry ? entry.integrationValue : global)[index]?.media || [];
  // Apply again on an image that is still on the post adds nothing twice.
  const fresh = media.filter((m) => !before.some((b) => b.id === m.id));
  if (!fresh.length) {
    return before;
  }
  if (entry) {
    appendInternalValueMedia(current, index, fresh);
  } else {
    appendGlobalValueMedia(index, fresh);
  }
  return before;
};

/**
 * Sets how long a comment waits after the item before it, the way the
 * clock button under a comment does, and returns what it was, for Undo.
 * Index 0 is the post and never waits.
 */
const setCommentDelay = (index: number, minutes: number): number => {
  const { current, internal, global, setGlobalDelay, setInternalDelay } =
    useLaunchStore.getState();
  const entry = internal.find((p) => p.integration.id === current);
  const before = (entry ? entry.integrationValue : global)[index]?.delay || 0;
  if (entry) {
    setInternalDelay(current, index, minutes);
  } else {
    setGlobalDelay(index, minutes);
  }
  return before;
};

/** Undo snapshots for delays, by key, like the media ones. */
const delayUndoSnapshots = new Map<string, { index: number; minutes: number }>();

const restoreMedia = (
  index: number,
  snapshot: { id: string; path: string; thumbnail?: string }[]
) => {
  const { current, internal, setGlobalValueMedia, setInternalValueMedia } =
    useLaunchStore.getState();
  if (internal.find((p) => p.integration.id === current)) {
    setInternalValueMedia(current, index, snapshot);
  } else {
    setGlobalValueMedia(index, snapshot);
  }
};

const mediaUndoSnapshots = new Map<
  string,
  { index: number; media: { id: string; path: string; thumbnail?: string }[] }
>();

/**
 * Video jobs this page started with apply=true and has not attached yet. An
 * image is attached inside its handler, once; a video lands minutes later in
 * the card, which is drawn again on every remount of the rail, so the
 * attach-on-arrival must remember it already happened. Gone with the page.
 */
const videoJobsToAttach = new Set<string>();

const triggerClassName = (open: boolean) =>
  clsx(
    'flex h-[36px] shrink-0 cursor-pointer items-center gap-[6px] whitespace-nowrap rounded-[8px] bg-pqBrandSoft px-[10px] text-[12.5px] font-[600] text-pqFocused transition-colors',
    open
      ? 'shadow-[inset_0_0_0_1px_var(--focused)] hover:bg-pqBrandSoft'
      : 'hover:bg-pqBoxFocused'
  );

/** Same mark as the AI Copilot empty state and nav — stroked 4-point star. */
export const CopilotMark: FC<{ size?: number; className?: string }> = ({
  size = 16,
  className,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    aria-hidden="true"
    className={clsx('shrink-0', className)}
  >
    <path
      d="M12 3l1.9 4.8 4.8 1.9-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9L12 3ZM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const railTabClass = (active: boolean) =>
  clsx(
    'flex h-[40px] min-w-[132px] shrink-0 cursor-pointer items-center justify-center gap-[8px] whitespace-nowrap rounded-[8px] px-[16px] text-[14px] font-[600] transition-colors',
    active
      ? 'bg-pqInner text-pqText shadow-pqE1'
      : 'text-pqMuted hover:text-pqText'
  );

/**
 * Empty-rail hero: Connections card plus the Copilot subtitle. CopilotKit
 * would render `labels.initial` as a chat bubble with faded controls, so this
 * sits in the message column instead — same idea as the Agents empty overlay.
 */
const ComposeAiEmptyHero: FC<{ tip: string }> = ({ tip }) => {
  const t = useT();
  return (
    <>
      <span className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-pqBrandSoft text-pqFocused">
        <CopilotMark size={22} />
      </span>
      <div>
        <div className="font-display text-[18px] font-[600] tracking-[-0.02em] text-pqText">
          {t('ai_copilot', 'AI Copilot')}
        </div>
        <p className="mx-auto mt-[8px] max-w-[360px] text-[13.5px] leading-[1.55] text-pqMuted">
          {t(
            'assistant_initial_message',
            'Hi! I can rewrite this post, expand it for the selected channels, or generate an image and attach it.'
          )}
        </p>
      </div>
      <NextLink
        href="/connections"
        className="pointer-events-auto flex w-full max-w-[360px] items-center gap-[12px] rounded-[14px] bg-pqPop p-[12px_14px] text-start shadow-[inset_0_0_0_1px_var(--border)] hover:bg-pqBrandSoft hover:shadow-[inset_0_0_0_1px_var(--brand)]"
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-pqBrandSoft text-pqFocused">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path
              d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5ZM4 15.5 12 20l8-4.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="text-[13px] font-[600] text-pqText">
            {t('connections', 'Connections')}
          </span>
          <span className="text-[12px] leading-[1.45] text-pqMuted">{tip}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          className="shrink-0 text-pqSoft rtl:-scale-x-100"
          aria-hidden="true"
        >
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </NextLink>
    </>
  );
};

/**
 * The one place the rail watches the live chat, mounted exactly as long as
 * the chat is (`useCopilotChatInternal` connects on mount and detaches the
 * run on unmount), so every tool call of a turn can be drawn.
 */
const ComposerLiveBridge: FC<{ children: ReactNode }> = ({ children }) => {
  const { messages } = useCopilotChatInternal();
  const value = useMemo(() => ({ messages }), [messages]);
  return (
    <LiveMessagesContext.Provider value={value}>
      {children}
    </LiveMessagesContext.Provider>
  );
};

/** The SDK's assistant message plus the tool calls it would not draw. */
const ComposeAiAssistantMessage: FC<AssistantMessageProps> = (props) => {
  const rest = useExtraToolCalls(props);
  return (
    <>
      <CopilotAssistantMessage {...props} />
      {rest}
    </>
  );
};

/**
 * Hidden by CSS from the first bubble on (`.agent:has(.copilotKitMessage)` in
 * global.css). CopilotKit 1.66 no longer fills `useCopilotMessagesContext`,
 * which this used to read, so it stayed up over the conversation.
 */
const ComposeAiEmptyOverlay: FC<{ tip: string }> = ({ tip }) => {
  return (
    <div
      data-copilot-empty="1"
      className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex flex-col items-center gap-[14px] px-[16px] pb-[16px] pt-[20px] text-center"
    >
      <ComposeAiEmptyHero tip={tip} />
    </div>
  );
};

const ComposeAiSuggestionList: FC<RenderSuggestionsListProps> = ({
  suggestions,
  onSuggestionClick,
  isLoading,
}) => {
  const t = useT();
  const { markUsed } = useComposerThread();
  if (!suggestions.length) {
    return null;
  }
  return (
    <div
      data-pq="composer-ai-chips"
      className="flex flex-col gap-[8px] px-[16px] pb-[12px]"
    >
      <div className="text-[11px] font-[700] uppercase tracking-[0.06em] text-pqSoft">
        {t('quick_edits', 'Quick edits')}
      </div>
      <div className="flex flex-wrap gap-[8px]">
        {suggestions.map((suggestion) => {
          // The emoji follows the edit kind in the message, not the
          // translated title, so it survives every locale.
          const kind = quickEditKind(suggestion.message);
          const mark = kind ? QUICK_EDIT_MARKS[kind] : undefined;
          return (
            <button
              key={suggestion.title}
              type="button"
              disabled={isLoading}
              onClick={() => {
                markUsed();
                onSuggestionClick(suggestion.message);
              }}
              className="flex h-[36px] items-center gap-[6px] rounded-[10px] bg-pqInner px-[12px] text-[12.5px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mark ? (
                <span aria-hidden="true" className="text-[14px] leading-none">
                  {mark}
                </span>
              ) : null}
              {suggestion.title}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ComposeAiInput: FC<InputProps> = ({
  inProgress,
  onSend,
  onStop,
  hideStopButton = false,
  isVisible = true,
}) => {
  const t = useT();
  const context = useChatContext();
  const { markUsed } = useComposerThread();
  const [text, setText] = useState('');
  if (!isVisible) {
    return null;
  }
  const send = () => {
    const next = text.trim();
    if (inProgress || !next) {
      return;
    }
    markUsed();
    onSend(text);
    setText('');
  };
  const showStop = inProgress && !hideStopButton;
  return (
    <div className="copilotKitInputContainer">
      <div className="copilotKitInput flex items-end gap-[8px]">
        <div className="min-h-[36px] flex-1 resize-none">
          <AutoResizingTextarea
            maxRows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={
              context.labels.placeholder ||
              t('write_something', 'Write something …')
            }
          />
        </div>
        <button
          type="button"
          disabled={!showStop && !text.trim()}
          onClick={showStop ? onStop : send}
          data-pq="composer-ai-send"
          className="copilotKitInputControlButton shrink-0"
        >
          {showStop ? t('stop', 'Stop') : t('send', 'Send')}
        </button>
      </div>
    </div>
  );
};

/**
 * The person's bubble in the rail: the quick-edit marker the chips append
 * is for the prompt, not for reading.
 */
const ComposeAiUserMessage: FC<UserMessageProps> = ({ message }) => {
  const content = message?.content;
  const text = (
    typeof content === 'string'
      ? content
      : Array.isArray(content)
      ? content
          .map((part: any) => (part?.type === 'text' ? part.text : ''))
          .join('')
      : ''
  ).replace(QUICK_EDIT_MARK, '');
  return (
    <div className="copilotKitMessage copilotKitUserMessage whitespace-pre-wrap">
      {text}
    </div>
  );
};

type SuggestPostResult =
  | { status: 'applied'; undoKey: string }
  | { status: 'shown' }
  | { status: 'error'; error: string };

/**
 * A proposed text for the post, in the rail. Apply replaces the editor with
 * it (and can be pressed again later, so an earlier version is one click
 * back); Undo restores what the editor held right before this card applied.
 */
const SuggestionCard: FC<{
  args?: { posts?: string[]; note?: string; apply?: boolean };
  status: string;
  result?: unknown;
}> = ({ args, status, result }) => {
  const t = useT();
  const { current, chars, totalChars } = useLaunchStore(
    useShallow((state) => ({
      current: state.current,
      chars: state.chars,
      totalChars: state.totalChars,
    }))
  );
  const parsed = useMemo<SuggestPostResult | null>(() => {
    if (result == null || status !== 'complete') {
      return null;
    }
    try {
      return typeof result === 'string' ? JSON.parse(result) : (result as SuggestPostResult);
    } catch {
      return null;
    }
  }, [result, status]);
  const [applied, setApplied] = useState<{ undoKey: string } | null>(null);
  // Undo of a quick edit the handler applied: `applied` is already null
  // there, so clearing it would not re-render and the button would stay.
  const [undone, setUndone] = useState(false);
  const undoKey =
    applied?.undoKey || (parsed?.status === 'applied' ? parsed.undoKey : undefined);
  const canUndo = !!undoKey && !undone && undoSnapshots.has(undoKey);
  const posts = Array.isArray(args?.posts) ? args.posts : [];
  const limit = current === 'global' ? totalChars : chars[current] || totalChars;
  const streaming = status !== 'complete';

  const apply = () => {
    const key = makeId(8);
    undoSnapshots.set(key, applySuggestion(posts));
    setApplied({ undoKey: key });
    setUndone(false);
  };
  const undo = () => {
    if (!undoKey) {
      return;
    }
    const snapshot = undoSnapshots.get(undoKey);
    if (snapshot) {
      restoreSuggestion(snapshot);
      undoSnapshots.delete(undoKey);
    }
    setApplied(null);
    setUndone(true);
  };

  return (
    <div
      data-pq="composer-ai-suggestion"
      className="my-[6px] flex w-full flex-col gap-[10px] rounded-[12px] bg-pqPop p-[12px] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      {args?.note && (
        <div className="text-[12.5px] text-pqMuted">{args.note}</div>
      )}
      {posts.length === 0 ? (
        <Skeleton className="h-[52px] w-full" />
      ) : (
        posts.map((post, index) => {
          // 'normal' turns each <p> into a line, so paragraphs do not run
          // into one another; 'none' strips the tags and nothing else.
          const text = stripHtmlValidation('normal', post || '', false, true);
          const over = !!limit && text.length > limit;
          return (
            <div key={index} className="flex flex-col gap-[4px]">
              <div className="whitespace-pre-wrap break-words rounded-[8px] bg-pqInner p-[10px] text-[13px] leading-[1.55] text-pqText">
                {text}
              </div>
              <div
                className={clsx(
                  'text-end font-mono text-[11px]',
                  over ? 'text-pqWarn' : 'text-pqSoft'
                )}
              >
                {limit ? `${text.length}/${limit}` : text.length}
              </div>
            </div>
          );
        })
      )}
      {!streaming && posts.length > 0 && (
        <div className="flex items-center gap-[8px]">
          {undoKey ? (
            <>
              {!undone && (
                <span className="text-[12.5px] font-[600] text-pqMuted">
                  {t('suggestion_applied', 'Applied')}
                </span>
              )}
              {canUndo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-pq="composer-ai-undo"
                  onClick={undo}
                >
                  {t('undo', 'Undo')}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-pq="composer-ai-apply-again"
                onClick={apply}
              >
                {t('apply_again', 'Apply again')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              data-pq="composer-ai-apply"
              onClick={apply}
            >
              {t('apply', 'Apply')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Post Preview | AI Copilot, in the right-rail header. This is the switch
 * the compose chat fills — not a second popup.
 */
export const StudioRailTabs: FC = () => {
  const t = useT();
  const { rail, setRail } = useStudioRail();
  return (
    <div
      data-pq="composer-rail-tabs"
      className="flex shrink-0 items-center gap-[3px] rounded-[10px] bg-pqSettings p-[3px]"
      role="tablist"
      aria-label={t('post_preview', 'Post Preview')}
    >
      <button
        type="button"
        role="tab"
        aria-selected={rail === 'preview'}
        data-pq="composer-rail-preview"
        onClick={() => setRail('preview')}
        className={railTabClass(rail === 'preview')}
      >
        {t('post_preview', 'Post Preview')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={rail === 'assistant'}
        data-pq="composer-rail-assistant"
        onClick={() => setRail('assistant')}
        className={railTabClass(rail === 'assistant')}
      >
        <CopilotMark size={18} className="text-pqFocused" />
        <span>{t('ai_copilot', 'AI Copilot')}</span>
      </button>
    </div>
  );
};

/**
 * Compose-toolbar chip. Opens the AI rail instead of a floating popup.
 */
export const ComposeAiAssistant: FC<{
  onActivate?: () => void;
  className?: string;
}> = ({ onActivate, className }) => {
  const t = useT();
  const { rail, setRail } = useStudioRail();
  const open = rail === 'assistant';
  const label = t('ai_copilot', 'AI Copilot');

  return (
    <button
      type="button"
      data-pq-compose-ai-trigger
      aria-pressed={open}
      aria-label={label}
      onClick={() => {
        if (open) {
          setRail('preview');
          return;
        }
        onActivate?.();
        setRail('assistant');
      }}
      className={clsx(triggerClassName(open), className)}
    >
      <CopilotMark className="text-pqFocused" />
      <span>{label}</span>
    </button>
  );
};

type GeneratedImageResult =
  | { status: 'attached'; media: { id: string; path: string }; undoKey: string }
  | { status: 'generated'; media: { id: string; path: string } }
  | { status: 'error'; error: string; failure?: GenerateImageFailure };

/** The model's reading of a failure; the person gets the translated copy. */
const imageFailureForModel = (failure: GenerateImageFailure) =>
  failure.reason === 'credits'
    ? 'Out of AI credits for this month.'
    : failure.reason === 'cancelled'
    ? 'The person cancelled the image generation.'
    : failure.message || 'Could not generate an image.';

/**
 * The generated image in the rail. Attached at once when the person asked
 * for that (Undo puts the item's media back), otherwise it waits for Use in
 * this post; Regenerate draws the same brief again and the card swaps, and
 * an attached image is swapped on the post too.
 */
const ComposerImageCard: FC<{
  args?: { prompt?: string; style?: string; orientation?: string; index?: number };
  status: string;
  result?: unknown;
}> = ({ args, status, result }) => {
  const t = useT();
  const generateImage = useGenerateImage();
  const failureCopy = useGenerateImageFailureCopy();
  const parsed = useMemo<GeneratedImageResult | null>(() => {
    if (result == null || status !== 'complete') {
      return null;
    }
    try {
      return typeof result === 'string' ? JSON.parse(result) : (result as GeneratedImageResult);
    } catch {
      return null;
    }
  }, [result, status]);
  // A regenerated image replaces the tool's; Use / Undo work on whichever is current.
  const [media, setMedia] = useState<{ id: string; path: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState<{ undoKey: string } | null>(null);
  const [undone, setUndone] = useState(false);
  const current =
    media || (parsed && parsed.status !== 'error' ? parsed.media : null);
  const undoKey =
    used?.undoKey || (parsed?.status === 'attached' && !undone ? parsed.undoKey : undefined);
  const index = typeof args?.index === 'number' ? args.index : 0;

  const use = () => {
    if (!current) {
      return;
    }
    const key = makeId(8);
    mediaUndoSnapshots.set(key, { index, media: attachMedia(index, [current]) });
    setUsed({ undoKey: key });
    setUndone(false);
  };
  const undo = () => {
    const snapshot = undoKey ? mediaUndoSnapshots.get(undoKey) : undefined;
    if (snapshot) {
      restoreMedia(snapshot.index, snapshot.media);
      mediaUndoSnapshots.delete(undoKey as string);
    }
    setUsed(null);
    setUndone(true);
  };
  const regenerate = async () => {
    setBusy(true);
    setFailed(null);
    // An image that is on the post stays there while the next one draws, so
    // a failure changes nothing; when the new one is ready it takes the old
    // one's place, since the person asked for the image on the post.
    const attached = !!undoKey;
    try {
      const image = await generateImage(args?.prompt || '', args?.style, args?.orientation);
      if (!isGeneratedImage(image)) {
        setFailed(failureCopy(image));
        return;
      }
      setMedia(image);
      if (attached) {
        undo();
        const key = makeId(8);
        mediaUndoSnapshots.set(key, { index, media: attachMedia(index, [image]) });
        setUsed({ undoKey: key });
        setUndone(false);
      } else {
        setUsed(null);
        setUndone(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const state = busy
    ? 'generating'
    : status !== 'complete'
    ? 'generating'
    : failed || (parsed && parsed.status === 'error')
    ? 'failed'
    : current
    ? 'ready'
    : 'failed';

  return (
    <GeneratedMediaCard
      prompt={args?.prompt || ''}
      style={args?.style}
      orientation={args?.orientation}
      status={state}
      media={current || undefined}
      error={
        failed ||
        (parsed?.status === 'error'
          ? parsed.failure
            ? failureCopy(parsed.failure)
            : parsed.error
          : undefined)
      }
      used={undoKey ? 'attached' : undefined}
      useLabel={t('use_in_this_post', 'Use in this post')}
      onUse={use}
      onUndo={undoKey ? undo : undefined}
      onRegenerate={regenerate}
      busy={busy}
    />
  );
};

type CommentDelayResult =
  | { status: 'applied'; index: number; minutes: number; undoKey: string }
  | { status: 'error'; error: string };

/** One line for a delay the model set, with Undo, like a quick edit's card. */
const CommentDelayCard: FC<{ status: string; result?: unknown }> = ({ status, result }) => {
  const t = useT();
  const parsed = useMemo<CommentDelayResult | null>(() => {
    if (result == null || status !== 'complete') {
      return null;
    }
    try {
      return typeof result === 'string' ? JSON.parse(result) : (result as CommentDelayResult);
    } catch {
      return null;
    }
  }, [result, status]);
  const [undone, setUndone] = useState(false);
  // Undo only while this page still holds the snapshot: a reopened thread
  // draws the card again with nothing to put back.
  const canUndo = !undone && !!parsed && parsed.status === 'applied' && delayUndoSnapshots.has(parsed.undoKey);
  if (!parsed) {
    return (
      <ToolStep name="setCommentDelay" status={status} result={result} />
    );
  }
  if (parsed.status === 'error') {
    return <ToolStep name="setCommentDelay" status="complete" result={parsed} />;
  }
  const undo = () => {
    const snapshot = delayUndoSnapshots.get(parsed.undoKey);
    if (snapshot) {
      setCommentDelay(snapshot.index, snapshot.minutes);
      delayUndoSnapshots.delete(parsed.undoKey);
    }
    setUndone(true);
  };
  return (
    <div
      data-pq="composer-ai-delay"
      data-state={undone ? 'undone' : 'applied'}
      className="my-[6px] flex flex-wrap items-center gap-[8px] rounded-[12px] bg-pqPop p-[10px_12px] text-[12.5px] text-pqMuted shadow-[inset_0_0_0_1px_var(--border)]"
    >
      <span className="flex-1">
        {undone
          ? t('delay_undone', 'Delay put back')
          : t('comment_delay_after', 'Comment {n}: {m} min after')
              .replace('{n}', String(parsed.index))
              .replace('{m}', String(parsed.minutes))}
      </span>
      {canUndo && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-pq="composer-ai-delay-undo"
          onClick={undo}
        >
          {t('undo', 'Undo')}
        </Button>
      )}
    </div>
  );
};

type GeneratedVideoResult =
  | { status: 'started'; jobId: string }
  | { status: 'error'; error: string; failure?: VideoJobStartFailure };

const videoFailureForModel = (failure: VideoJobStartFailure) =>
  failure.reason === 'unavailable'
    ? 'Video generation is not available on this installation.'
    : failure.reason === 'cancelled'
    ? 'The person cancelled the video generation.'
    : failure.message || 'Could not start the video.';

/** The brief inside the generator's customParams, for the card's first line. */
const videoPrompt = (customParams?: string) => {
  try {
    const params = JSON.parse(customParams || '{}');
    return typeof params?.prompt === 'string' ? params.prompt : '';
  } catch {
    return '';
  }
};

/**
 * The video job in the rail. The card polls until the video lands; when the
 * person asked for it on the post it is attached then (Undo puts the item's
 * media back), otherwise it waits for Use in this post.
 */
const ComposerVideoCard: FC<{
  args?: {
    identifier?: string;
    output?: string;
    customParams?: string;
    apply?: boolean;
    index?: number;
  };
  status: string;
  result?: unknown;
}> = ({ args, status, result }) => {
  const t = useT();
  const failureCopy = useVideoStartFailureCopy();
  const parsed = useMemo<GeneratedVideoResult | null>(() => {
    if (result == null || status !== 'complete') {
      return null;
    }
    try {
      return typeof result === 'string' ? JSON.parse(result) : (result as GeneratedVideoResult);
    } catch {
      return null;
    }
  }, [result, status]);
  const prompt = videoPrompt(args?.customParams);
  const index = typeof args?.index === 'number' ? args.index : 0;
  const jobId = parsed?.status === 'started' ? parsed.jobId : undefined;
  const [used, setUsed] = useState<{ undoKey: string } | null>(null);
  const attach = (media: VideoJobMedia) => {
    const key = makeId(8);
    mediaUndoSnapshots.set(key, { index, media: attachMedia(index, [media]) });
    setUsed({ undoKey: key });
  };
  const attachOnArrival = (media: VideoJobMedia) => {
    if (!jobId || !videoJobsToAttach.delete(jobId)) {
      return;
    }
    attach(media);
  };
  const undo = () => {
    const snapshot = used ? mediaUndoSnapshots.get(used.undoKey) : undefined;
    if (snapshot) {
      restoreMedia(snapshot.index, snapshot.media);
      mediaUndoSnapshots.delete(used?.undoKey as string);
    }
    setUsed(null);
  };
  const error =
    parsed?.status === 'error'
      ? parsed.failure
        ? failureCopy(parsed.failure)
        : parsed.error
      : undefined;

  return (
    <VideoJobCard
      jobId={jobId}
      error={error}
      prompt={prompt || args?.identifier || ''}
      provider={args?.identifier}
      orientation={args?.output}
      used={used ? 'attached' : undefined}
      useLabel={t('use_in_this_post', 'Use in this post')}
      onReady={attachOnArrival}
      onUse={attach}
      onUndo={used ? undo : undefined}
    />
  );
};

const ComposeAiBindingsInner: FC = () => {
  const toaster = useToaster();
  const generateImage = useGenerateImage();
  const failureCopy = useGenerateImageFailureCopy();
  const startVideo = useStartVideo();
  const setLocked = useLaunchStore((state) => state.setLocked);

  // The model's way of changing the post. It replaced the old `setPosts`,
  // which overwrote the editor silently with no way back: a quick edit
  // still applies at once (with Undo on its card), anything else waits for
  // Apply, and every card can be applied again later.
  useCopilotAction({
    name: 'suggestPost',
    description:
      "Propose new text for the post open in the composer. Pass the FULL thread as HTML strings, one per thread item, same count as the current post unless the user asked to add or remove items. apply=false shows a suggestion card with an Apply button. apply=true applies immediately and the card offers Undo; use it only for quick edits or when the user said to apply directly. note is one short sentence in the user's language shown on the card. Returns {status:'shown'|'applied'}. Do not repeat the text in chat.",
    parameters: [
      {
        name: 'posts',
        type: 'string[]',
        description: 'The full thread, one HTML string per item',
      },
      {
        name: 'apply',
        type: 'boolean',
        description: 'true to apply at once (quick edits), false to wait for Apply',
      },
      {
        name: 'note',
        type: 'string',
        description: 'One short sentence about what changed, in the user\'s language',
        required: false,
      },
    ],
    // The model speaks again after a suggestion (the prompt keeps it to one
    // sentence) so a request that needs two steps, such as adding a comment
    // and then setting its delay, can go on to the second tool.
    handler: async ({ posts, apply }): Promise<SuggestPostResult> => {
      const list = Array.isArray(posts)
        ? posts.filter((p) => typeof p === 'string')
        : [];
      if (!list.length) {
        return { status: 'error', error: 'posts must hold at least one item.' };
      }
      if (!apply) {
        return { status: 'shown' };
      }
      const undoKey = makeId(8);
      undoSnapshots.set(undoKey, applySuggestion(list));
      return { status: 'applied', undoKey };
    },
    render: ({ args, status, result }) => (
      <SuggestionCard
        args={args as { posts?: string[]; note?: string; apply?: boolean }}
        status={status}
        result={result}
      />
    ),
  });

  useCopilotAction({
    name: 'attachMediaToPost',
    description:
      'Attach existing media to the post by id and path. Index 0 is the root post.',
    parameters: [
      {
        name: 'id',
        type: 'string',
        description: 'Media id',
        required: true,
      },
      {
        name: 'path',
        type: 'string',
        description: 'Media URL / path',
        required: true,
      },
      {
        name: 'index',
        type: 'number',
        description: 'Thread index, default 0',
        required: false,
      },
    ],
    handler: async ({ id, path, index }) => {
      attachMedia(typeof index === 'number' ? index : 0, [{ id, path }]);
    },
  });

  useCopilotAction({
    name: 'generateImageForPost',
    description:
      "Generate ONE image from a visual brief for the post open in the composer. Returns {status:'attached', media} when apply was true (the image is on the post, the card offers Undo), {status:'generated', media} when it waits for the person to press Use in this post, or {status:'error', error}. Do not describe the image in chat; one short sentence at most.",
    parameters: [
      {
        name: 'prompt',
        type: 'string',
        description:
          'A visual brief, not a caption: subject, setting, composition, light, mood. No text in the image.',
        required: true,
      },
      {
        name: 'style',
        type: 'string',
        description:
          'Optional style: Realistic, Cartoon, Anime, Minimalist, Sketch, Watercolor',
        required: false,
      },
      {
        name: 'orientation',
        type: 'string',
        description:
          'square, portrait or landscape; pick it from the channel (portrait for Instagram, TikTok, Pinterest, Reels and Stories; landscape for X, LinkedIn, YouTube, Facebook; square otherwise)',
        required: false,
      },
      {
        name: 'apply',
        type: 'boolean',
        description:
          'true when the user asked to attach or add it to the post directly; false to show it and wait for Use in this post.',
        required: false,
      },
      {
        name: 'index',
        type: 'number',
        description: 'Thread index, default 0',
        required: false,
      },
    ],
    // The image is generated here so its result is what the model reads; the
    // card (render) shows it and owns Use / Undo / Regenerate afterwards.
    handler: async ({ prompt, style, orientation, apply, index }) => {
      const trimmed = String(prompt || '').trim();
      if (!trimmed) {
        return { status: 'error', error: 'Need a prompt to generate an image.' };
      }
      setLocked(true);
      try {
        const image = await generateImage(trimmed, style, orientation);
        if (!isGeneratedImage(image)) {
          if (image.reason === 'credits') {
            toaster.show(failureCopy(image), 'warning');
          }
          return { status: 'error', error: imageFailureForModel(image), failure: image };
        }
        if (apply) {
          const undoKey = makeId(8);
          const at = typeof index === 'number' ? index : 0;
          mediaUndoSnapshots.set(undoKey, { index: at, media: attachMedia(at, [image]) });
          return { status: 'attached', media: image, undoKey };
        }
        return { status: 'generated', media: image };
      } catch {
        return { status: 'error', error: 'Could not generate an image.' };
      } finally {
        setLocked(false);
      }
    },
    render: ({ args, status, result }) => (
      <ComposerImageCard
        args={args as { prompt?: string; style?: string; orientation?: string; index?: number }}
        status={status}
        result={result}
      />
    ),
  });

  useCopilotAction({
    name: 'generateVideoForPost',
    description:
      "Start generating ONE video for the post open in the composer, with a generator from generateVideoOptions. Returns {status:'started', jobId} (a card in the rail waits for the video; do not poll, do not call again) or {status:'error', error}. Reply with one short sentence and stop.",
    parameters: [
      {
        name: 'identifier',
        type: 'string',
        description: 'The generator identifier from generateVideoOptions',
        required: true,
      },
      {
        name: 'output',
        type: 'string',
        description:
          'vertical for Reels, Stories, TikTok and Shorts; horizontal for X, LinkedIn, YouTube and Facebook',
        required: true,
      },
      {
        name: 'customParams',
        type: 'string',
        description:
          'ONE JSON object string with the customParams the generator lists (its prompt is a visual brief of one scene: camera, subject, motion, light, atmosphere)',
        required: true,
      },
      {
        name: 'apply',
        type: 'boolean',
        description:
          'true when the user asked for the video on the post directly; false to wait for Use in this post.',
        required: false,
      },
      {
        name: 'index',
        type: 'number',
        description: 'Thread index, default 0',
        required: false,
      },
    ],
    handler: async ({ identifier, output, customParams, apply }) => {
      let params: Record<string, unknown> = {};
      try {
        params = JSON.parse(String(customParams || '{}'));
      } catch {
        return { status: 'error', error: 'customParams must be a JSON object string.' };
      }
      if (output !== 'vertical' && output !== 'horizontal') {
        return { status: 'error', error: 'output must be vertical or horizontal.' };
      }
      const started = await startVideo(String(identifier || ''), output, params);
      if (isVideoJobStart(started)) {
        if (apply) {
          videoJobsToAttach.add(started.jobId);
        }
        return { status: 'started', jobId: started.jobId };
      }
      return { status: 'error', error: videoFailureForModel(started), failure: started };
    },
    render: ({ args, status, result }) => (
      <ComposerVideoCard
        args={
          args as {
            identifier?: string;
            output?: string;
            customParams?: string;
            apply?: boolean;
            index?: number;
          }
        }
        status={status}
        result={result}
      />
    ),
  });

  useCopilotAction({
    name: 'setCommentDelay',
    description:
      "Set how many minutes a comment or thread item waits after the item before it, for the post open in the composer: the only way to change timing. index is the thread position in the current content of posts (1 is the first comment; 0 is the post and cannot wait); an item the user applied from a suggestion card counts. Applies at once; the card offers Undo. Returns {status:'applied', index, minutes} or {status:'error', error}. One short sentence after; do not restate the delay.",
    parameters: [
      {
        name: 'index',
        type: 'number',
        description: 'Thread index of the comment, 1 or more',
        required: true,
      },
      {
        name: 'minutes',
        type: 'number',
        description: 'Minutes to wait after the previous item; 0 removes the wait',
        required: true,
      },
    ],
    handler: async ({ index, minutes }): Promise<CommentDelayResult> => {
      const at = Math.round(Number(index));
      const wait = Math.max(0, Math.round(Number(minutes)));
      if (!Number.isFinite(at) || at < 1) {
        return { status: 'error', error: 'index must be 1 or more; the post itself cannot wait.' };
      }
      const { current, internal, global } = useLaunchStore.getState();
      const entry = internal.find((p) => p.integration.id === current);
      if (!(entry ? entry.integrationValue : global)[at]) {
        return { status: 'error', error: `There is no thread item ${at}; add the comment first with suggestPost.` };
      }
      const undoKey = makeId(8);
      delayUndoSnapshots.set(undoKey, { index: at, minutes: setCommentDelay(at, wait) });
      return { status: 'applied', index: at, minutes: wait, undoKey };
    },
    render: ({ status, result }) => <CommentDelayCard status={status} result={result} />,
  });

  // Backend tools the composer surface has (integrationSchema, uploadFromUrlTool,
  // generateVideoOptions, videoFunctionTool) show as the same quiet step
  // lines the Copilot page draws.
  useCopilotAction({
    name: '*',
    render: ({ name, status, args, result }: CatchAllActionRenderProps<any>) => (
      <ToolStep name={name} status={status} args={args} result={result} />
    ),
  });

  return null;
};

export const ComposeAiBindings: FC = () => {
  const aiOk = useAiAvailable();
  return aiOk ? <ComposeAiBindingsInner /> : null;
};

const ComposeAiUnconfigured: FC<{
  suggestions: { title: string; message: string }[];
}> = ({ suggestions }) => {
  const t = useT();
  const toaster = useToaster();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<{ id: string; content: string }[]>(
    []
  );
  const tip = t(
    'compose_ai_unconfigured_tip',
    'AI Copilot needs OpenAI configured. Discover Claude, ChatGPT, and MCP agents in Connections.'
  );

  const explain = () => {
    toaster.show(tip, 'warning');
  };

  const send = () => {
    const content = text.trim();
    if (content) {
      setMessages((prev) => [...prev, { id: makeId(10), content }]);
      setText('');
    }
    explain();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };

  return (
    <div data-pq="composer-ai-chat" className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {messages.length > 0 ? (
          <div className="copilotKitMessagesContainer flex flex-col">
            {messages.map((message) => (
              <div
                key={message.id}
                className="copilotKitMessage copilotKitUserMessage whitespace-pre-wrap"
              >
                {message.content}
              </div>
            ))}
          </div>
        ) : (
          <div
            data-copilot-empty="1"
            className="flex flex-col items-center gap-[14px] px-[16px] pb-[16px] pt-[20px] text-center"
          >
            <ComposeAiEmptyHero tip={tip} />
          </div>
        )}
      </div>
      <ComposeAiSuggestionList
        suggestions={suggestions}
        onSuggestionClick={explain}
        isLoading={false}
      />
      <form className="copilotKitInputContainer" onSubmit={onSubmit}>
        <div className="copilotKitInput flex items-center gap-[8px]">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={t('write_something', 'Write something …')}
            rows={1}
            className="min-h-[36px] flex-1 resize-none"
          />
          <button
            type="submit"
            data-pq="composer-ai-send"
            className="copilotKitInputControlButton shrink-0"
          >
            {t('send', 'Send')}
          </button>
        </div>
      </form>
    </div>
  );
};

/**
 * Copilot chat that fills the Post Preview rail. Chat history lives on the
 * layout CopilotKit provider, so switching back to Preview does not drop it.
 */
export const ComposeAiRail: FC<{ docked?: boolean }> = ({ docked = false }) => {
  const t = useT();
  const user = useUser();
  const aiOk = useAiAvailable();
  const trialLocked =
    !!user?.isTrailing || !!user?.lifetimePaymentPending;
  const label = t('ai_copilot', 'AI Copilot');
  // The label goes as the message, in the person's language, plus the
  // marker the server prompt keys the rewrite rules on (shorten keeps the
  // hook and the CTA, formal drops emojis, every kind keeps the language,
  // facts, links and item count). Nothing about tools rides in the message.
  const suggestions = useMemo(
    () =>
      (
        [
          ['rephrase', t('rephrase', 'Rephrase')],
          ['shorten', t('shorten', 'Shorten')],
          ['expand', t('expand', 'Expand')],
          ['casual', t('more_casual', 'More Casual')],
          ['formal', t('more_formal', 'More Formal')],
        ] as [QuickEditKind, string][]
      ).map(([kind, title]) => ({
        title,
        message: quickEditMessage(title, kind),
      })),
    [t]
  );

  return (
    <div
      data-pq={docked ? 'composer-ai-dock' : 'composer-ai-rail'}
      style={
        {
          '--copilot-kit-primary-color': 'var(--brand)',
          '--copilot-kit-contrast-color': 'var(--onBrand)',
          '--copilot-kit-secondary-contrast-color': 'var(--text)',
          '--copilot-kit-background-color': 'transparent',
          '--copilot-kit-input-background-color': 'var(--inner)',
          '--copilot-kit-separator-color': 'var(--line)',
          '--copilot-kit-muted-color': 'var(--muted)',
        } as CopilotKitCSSProperties
      }
      className={clsx(
        'trz agent relative flex h-full min-h-0 flex-col bg-pqInner',
        docked && 'border-t border-pqLine'
      )}
    >
      {trialLocked && (
        <TrialLockCard
          variant="overlay"
          name={label}
          title={t(
            'ai_copilot_unlocks_after_your_trial',
            'AI Copilot unlocks after your trial'
          )}
          description={t(
            'ai_lock_sub',
            'Your channels, calendar and analytics are already live. Copilot is the one thing that waits for your first payment.'
          )}
          perks={[
            t(
              'ai_lock_perk_chat',
              'Copilot chat that drafts and schedules for you'
            ),
            t('ai_lock_perk_images', '300 AI images a month'),
            t('ai_lock_perk_videos', '30 AI videos a month'),
          ]}
        />
      )}
      {aiOk ? (
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <ComposerLiveBridge>
              <CopilotChat
                className="h-full w-full"
                suggestions={suggestions}
                RenderSuggestionsList={ComposeAiSuggestionList}
                Input={ComposeAiInput}
                UserMessage={ComposeAiUserMessage}
                AssistantMessage={ComposeAiAssistantMessage}
                labels={{
                  title: label,
                  placeholder: t('write_something', 'Write something …'),
                }}
              />
            </ComposerLiveBridge>
          </div>
          <ComposeAiEmptyOverlay
            tip={t(
              'connections_sub',
              'Work with PostQueen across your favorite tools.'
            )}
          />
        </div>
      ) : (
        <ComposeAiUnconfigured suggestions={suggestions} />
      )}
    </div>
  );
};
