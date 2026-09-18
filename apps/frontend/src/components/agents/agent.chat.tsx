'use client';

import React, {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AssistantMessage as CopilotAssistantMessage,
  CopilotChat,
  CopilotKitCSSProperties,
} from '@copilotkit/react-ui';
import {
  AssistantMessageProps,
  InputProps,
  UserMessageProps,
} from '@copilotkit/react-ui';
import Link from 'next/link';
import { Input } from '@gitroom/frontend/components/agents/agent.input';
import AutoResizingTextarea from '@gitroom/frontend/components/agents/agent.textarea';
import {
  CatchAllActionRenderProps,
  CopilotKit,
  useCopilotAction,
  useCopilotChatInternal,
  useCopilotReadable,
} from '@copilotkit/react-core';
import {
  MediaPortal,
  PropertiesContext,
  threadTitleWait,
  useAgentRouteId,
  useCopilotThreads,
} from '@gitroom/frontend/components/agents/agent';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useAiAvailable } from '@gitroom/frontend/components/layout/user.context';
import { v4 as uuid } from 'uuid';
import {
  COPILOT_READABLE,
  CopilotProperties,
} from '@gitroom/helpers/utils/copilot.context';
import {
  AgentDraftAction,
  AgentDraftCard,
  AgentDraftCardState,
  AgentDraftGroup,
  AgentDraftItem,
  AgentDraftOutcome,
  AgentExistingPost,
  groupDraftItems,
} from '@gitroom/frontend/components/agents/agent.draft.card';
import {
  DraftValidationError,
  useDraftActions,
} from '@gitroom/frontend/components/agents/agent.draft.actions';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { GeneratedMediaCard } from '@gitroom/frontend/components/media/generated.media.card';
import { useAiImageModal } from '@gitroom/frontend/components/launches/ai.image';
import { imageOrientationForPlatforms } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import {
  isGeneratedImage,
  useGenerateImage,
  useGenerateImageFailureCopy,
} from '@gitroom/frontend/components/media/use.generate.image';
import {
  LiveMessagesContext,
  ToolStep,
  parseToolResult,
  useExtraToolCalls,
} from '@gitroom/frontend/components/agents/agent.tool.step';
import { VideoJobCard } from '@gitroom/frontend/components/media/video.job.card';
import { VideoJobMedia } from '@gitroom/frontend/components/media/use.generate.video';
import { formatChannelHandle, channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';

type AgentIntegration = Integrations & {
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
};

const needsAttention = (
  integration: Pick<AgentIntegration, 'refreshNeeded' | 'inBetweenSteps'>
) => !!(integration.refreshNeeded || integration.inBetweenSteps);

const selectableIntegrations = (
  integrations: AgentIntegration[] | null | undefined
): AgentIntegration[] =>
  Array.isArray(integrations)
    ? integrations.filter((p) => !needsAttention(p))
    : [];

/**
 * The thread the chat runs in. `/agents/new` mints its own id so the chat
 * always has an explicit thread: the runtime replays a thread's history on
 * connect and the app keeps per-thread state, both keyed by this id. Landing
 * on `new` again (New chat) mints a fresh one.
 */
const useChatThreadId = (routeId: string) => {
  const [minted, setMinted] = useState(() => uuid());
  const previous = useRef(routeId);
  useEffect(() => {
    if (routeId === 'new' && previous.current !== 'new') {
      setMinted(uuid());
    }
    previous.current = routeId;
  }, [routeId]);
  return routeId === 'new' ? minted : routeId;
};

export const AgentChat: FC = () => {
  const { backendUrl } = useVariables();
  const aiOk = useAiAvailable();
  const routeId = useAgentRouteId();
  const threadId = useChatThreadId(routeId);
  const t = useT();
  const { properties: selected } = useContext(PropertiesContext);
  const i18n = useTranslationSettings();
  // Read by the backend as `forwardedProps.pq` on every run and connect,
  // and printed into the prompt's "Current state": the channels the person
  // has selected right now, their timezone and the app language. This is
  // what the `[--integrations--]` block glued onto every message used to be.
  const properties = useMemo(
    (): { pq: CopilotProperties } => ({
      pq: {
        surface: 'agent',
        channels: selectableIntegrations(selected).map((p) => ({
          id: p.id,
          platform: p.identifier,
          name: p.name,
          handle: formatChannelHandle(p.display) || undefined,
          format: p.editor,
          customer: p.customer?.name || undefined,
        })),
        timezone: getTimezone(),
        locale: i18n.resolvedLanguage || i18n.language || 'en',
      },
    }),
    [selected, i18n.resolvedLanguage, i18n.language]
  );

  // Without an OpenAI key, or on a tier without AI, do not mount CopilotKit —
  // that remounts against a `/copilot/agent` that answers 503 or 402 and brings
  // back the Next CombinedError overlay. `/copilot/agent` has always carried
  // the AI policy, so the tier half of this was already reachable. Show the
  // same empty chrome as a static shell instead of a blocking takeover.
  if (!aiOk) {
    return <UnconfiguredAgentShell />;
  }

  return (
    <CopilotKit
      threadId={threadId}
      credentials="include"
      runtimeUrl={backendUrl + '/copilot/agent'}
      showDevConsole={false}
      // Separate switch from the console in 1.66, on by default on
      // localhost: a floating CopilotKit button with its own announcements.
      enableInspector={false}
      agent="postqueen"
      properties={properties}
    >
      <AgentLiveBridge threadId={threadId} fresh={routeId === 'new'}>
        <Hooks>
          <div
            style={
              {
                // The SDK is themed through its own custom properties, bound
                // to the token layer where the chat mounts. Background stays
                // transparent so the page's own surfaces show through.
                '--copilot-kit-primary-color': 'var(--brand)',
                '--copilot-kit-contrast-color': 'var(--onBrand)',
                '--copilot-kit-secondary-contrast-color': 'var(--text)',
                '--copilot-kit-background-color': 'transparent',
                '--copilot-kit-input-background-color': 'transparent',
                '--copilot-kit-separator-color': 'var(--line)',
                '--copilot-kit-muted-color': 'var(--muted)',
              } as CopilotKitCSSProperties
            }
            className="trz agent bg-pqInner flex min-h-0 flex-col transition-all flex-1 relative min-w-0"
          >
            <div className="absolute start-0 w-full h-full">
              <CopilotChat
                className="w-full h-full"
                labels={{
                  title: t('ai_copilot', 'AI Copilot'),
                  placeholder: t(
                    'agent_placeholder',
                    'Ask Copilot to draft, schedule or generate…'
                  ),
                }}
                AssistantMessage={AssistantMessage}
                UserMessage={Message}
                Input={NewInput}
              />
            </div>
            <EmptyState fresh={routeId === 'new'} />
          </div>
        </Hooks>
      </AgentLiveBridge>
    </CopilotKit>
  );
};

/**
 * Presentational empty-thread hero (title / sub / MCP card). Safe outside
 * CopilotKit — no message-context hooks — so the unconfigured shell can reuse
 * the same LOOK as a live empty thread.
 */
const EmptyStateHero: FC = () => {
  const t = useT();
  return (
    <>
      <span className="flex h-[54px] w-[54px] items-center justify-center rounded-[16px] bg-pqBrandSoft text-pqFocused">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
          <path
            d="M12 3l1.9 4.8 4.8 1.9-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9L12 3ZM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div>
        <div className="font-display text-[24px] font-[600] tracking-[-0.02em]">
          {t('agent_empty_title', 'What are we posting today?')}
        </div>
        <div className="mx-auto mt-[8px] max-w-[440px] text-[14.5px] leading-[1.6] text-pqMuted">
          {t(
            'agent_empty_sub',
            'Describe the idea. Copilot writes it per channel, makes the images and puts it on your calendar.'
          )}
        </div>
      </div>
      <Link
        href="/connections"
        className="pointer-events-auto flex w-full max-w-[640px] items-center gap-[12px] rounded-[14px] bg-pqPop p-[14px_18px] text-start shadow-[inset_0_0_0_1px_var(--border)] hover:bg-pqBrandSoft hover:shadow-[inset_0_0_0_1px_var(--brand)]"
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
            {t('agent_mcp_card_title', 'Prefer your own AI tool?')}
          </span>
          <span className="text-[12px] leading-[1.45] text-pqMuted">
            {t(
              'agent_mcp_card_sub',
              'Drive PostQueen from Claude, ChatGPT or Cursor over MCP — or automate with n8n.'
            )}
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          className="shrink-0 text-pqSoft rtl:-scale-x-100"
        >
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </>
  );
};

/**
 * The design's empty-thread hero, rendered instead of the old five-paragraph
 * `labels.initial` greeting (owner-approved copy change). CopilotKit would
 * render `initial` as a message, so the label is gone and this overlays the
 * top of the (empty) message column until the first message lands. Hiding it
 * is CSS (`.agent:has(.copilotKitMessage)` in global.css): CopilotKit 1.66
 * no longer fills `useCopilotMessagesContext`, so the messages the chat shows
 * only exist in the DOM as far as this component is concerned.
 */
const EmptyState: FC<{ fresh: boolean }> = ({ fresh }) => {
  // Existing threads start empty while their history connects — without the
  // route gate the hero flashes over every old conversation.
  if (!fresh) {
    return null;
  }
  return (
    // z-[2]: the SDK's message scroller carries z-index 1 and would otherwise
    // swallow the suggestion card's clicks.
    <div
      data-copilot-empty="1"
      className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex flex-col items-center gap-[18px] px-[16px] pt-[24px] pb-[30px] text-center sm:px-[40px] sm:pt-[56px]"
    >
      <EmptyStateHero />
    </div>
  );
};

/**
 * Agents chat column when AI is off: same LOOK as a live thread (hero +
 * working composer + user bubbles) without mounting CopilotKit. Typing and
 * send append to a local list only — no `/copilot/agent` call, no assistant
 * reply, no CombinedError overlay.
 */
const UnconfiguredAgentShell: FC = () => {
  const t = useT();
  const { properties, openChannels } = useContext(PropertiesContext);
  const [messages, setMessages] = useState<{ id: string; content: string }[]>(
    []
  );
  const [text, setText] = useState('');
  const [media, setMedia] = useState<{ path: string; id: string }[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const canSend = text.trim().length > 0 || media.length > 0;

  const setMediaFromEvent = useCallback(
    (e: {
      target: {
        name: string;
        value?: { id: string; path: string }[];
      };
    }) => setMedia(e.target.value || []),
    []
  );

  const send = useCallback(() => {
    const content =
      text.trim() +
      (media.length > 0
        ? '\n[--Media--]' +
          media
            .map((m) =>
              hasExtension(m.path, 'mp4')
                ? `Video: ${m.path} [id:${m.id}]`
                : `Image: ${m.path} [id:${m.id}]`
            )
            .join('\n') +
          '\n[--Media--]'
        : '');
    if (!content.trim()) {
      return;
    }
    setMessages((prev) => [...prev, { id: makeId(10), content }]);
    setText('');
    setMedia([]);
    textareaRef.current?.focus();
  }, [text, media]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleComposerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    if (target.tagName === 'TEXTAREA') return;
    textareaRef.current?.focus();
  };

  return (
    <div className="trz agent bg-pqInner flex flex-col transition-all flex-1 relative min-w-0">
      <div className="absolute inset-0 flex flex-col">
        <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto">
          {!messages.length ? (
            <div
              data-copilot-empty="1"
              className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex flex-col items-center gap-[18px] px-[16px] pt-[24px] pb-[30px] text-center sm:px-[40px] sm:pt-[56px]"
            >
              <EmptyStateHero />
            </div>
          ) : (
            <div className="copilotKitMessagesContainer flex flex-col">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="copilotKitMessage copilotKitUserMessage whitespace-pre-wrap"
                >
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="copilotKitInputContainer">
          <div className="mx-auto flex w-full max-w-[840px] flex-col gap-[8px]">
            <div className="flex flex-wrap items-center gap-[6px] p-[0_2px_2px]">
              {properties.length === 0 ? (
                <button
                  type="button"
                  onClick={openChannels}
                  className="flex h-[26px] items-center gap-[6px] rounded-full bg-pqSettings px-[9px] text-[11.5px] font-[600] text-pqSoft shadow-[inset_0_0_0_1px_var(--border)] hover:bg-pqHover hover:text-pqText"
                >
                  <span>
                    {t('no_channels_selected', 'No channels selected')}
                  </span>
                  <span className="text-pqMuted" aria-hidden="true">
                    ·
                  </span>
                  <span>{t('select_channels', 'Select channels')}</span>
                </button>
              ) : (
                <>
                  <span className="text-[11.5px] text-pqSoft">
                    {t('agent_posting_to', 'Posting to')}
                  </span>
                  {properties.map((p: AgentIntegration) => (
                    <span
                      key={p.id}
                      title={channelNameWithHandle(p)}
                      className="flex h-[26px] items-center gap-[6px] rounded-full bg-pqSettings ps-[4px] pe-[9px] text-[11.5px] font-[600] text-pqText"
                    >
                      <span className="relative h-[18px] w-[18px] shrink-0">
                        <ImageWithFallback
                          fallbackSrc={`/icons/platforms/${p.identifier}.png`}
                          src={p.picture}
                          className="rounded-[5px]"
                          alt={p.identifier}
                          width={18}
                          height={18}
                        />
                        <span className="absolute -bottom-[4px] -end-[4px] flex h-[15px] w-[15px] items-center justify-center rounded-full bg-pqBadgeRing">
                          <SafeImage
                            src={`/icons/platforms/${p.identifier}.png`}
                            className="rounded-full"
                            alt={p.identifier}
                            width={11}
                            height={11}
                          />
                        </span>
                      </span>
                      {p.name}
                      {!!formatChannelHandle(p.display) && (
                        <span className="font-[500] text-pqMuted">
                          {formatChannelHandle(p.display)}
                        </span>
                      )}
                    </span>
                  ))}
                </>
              )}
            </div>
            <div
              className="copilotKitInput flex cursor-text flex-col gap-[7px]"
              onClick={handleComposerClick}
            >
              <MediaPortal
                part="thumbs"
                value={text}
                media={media}
                setMedia={setMediaFromEvent}
              />
              <AutoResizingTextarea
                ref={textareaRef}
                placeholder={t(
                  'agent_placeholder',
                  'Ask Copilot to draft, schedule or generate…'
                )}
                autoFocus={false}
                maxRows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !isComposing
                  ) {
                    event.preventDefault();
                    if (canSend) {
                      send();
                    }
                  }
                }}
              />
              <div className="copilotKitInputControls flex items-end gap-[4px] pb-[2px]">
                <div className="min-w-0 flex-1">
                  <MediaPortal
                    part="toolbar"
                    value={text}
                    media={media}
                    setMedia={setMediaFromEvent}
                  />
                </div>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={send}
                  data-test-id="copilot-chat-ready"
                  data-pq-agent-send="1"
                  className="copilotKitInputControlButton shrink-0"
                  aria-label={t('send_message', 'Send message')}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                    <path
                      d="M12 19V5M6 11l6-6 6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * What the live chat knows, for the components that must not subscribe to
 * it themselves: the messages (tool results for the extra tool calls), and
 * how many turns the person has taken, which `publishFromCard` uses to tell
 * a spoken confirmation from the model acting on its own.
 */
const LiveChatContext = createContext<{
  messages: any[];
  userTurns: number;
}>({ messages: [], userTurns: 0 });

/**
 * The design puts a 26px "PQ" tile beside assistant messages. The SDK's own
 * AssistantMessage keeps rendering the content and the regenerate / copy /
 * thumbs controls — it is only wrapped, never replaced.
 */
const AssistantMessage: FC<AssistantMessageProps> = (props) => {
  const message = props.message as { content?: unknown };
  const rest = useExtraToolCalls(props);
  if (!message?.content) {
    return (
      <>
        <CopilotAssistantMessage {...props} />
        {rest}
      </>
    );
  }
  return (
    <div className="flex items-start gap-[10px]">
      <span className="mt-[10px] flex h-[26px] w-[26px] shrink-0 select-none items-center justify-center rounded-[8px] bg-pqBrandSoft text-[10.5px] font-[700] text-pqFocused">
        PQ
      </span>
      <div className="min-w-0 flex-1">
        <CopilotAssistantMessage {...props} />
        {rest}
      </div>
    </div>
  );
};

/**
 * The one place that watches the live chat. History no longer needs loading
 * here: the runtime replays a reopened thread from Mastra memory on connect
 * (chat/mastra.thread.runner.ts). What is left is bookkeeping after a run:
 * a fresh thread's URL becomes its id, and the Chats rail is refreshed until
 * Mastra has named the thread (the title is generated after the run).
 *
 * `useCopilotChatInternal` connects on mount and detaches the live run on
 * unmount, so this stays mounted for the chat's whole life and is never
 * rendered conditionally.
 */
const AgentLiveBridge: FC<{
  threadId: string;
  fresh: boolean;
  children: ReactNode;
}> = ({ threadId, fresh, children }) => {
  const { isLoading, messages } = useCopilotChatInternal();
  const userTurns = useMemo(
    () => messages.filter((m: any) => m.role === 'user').length,
    [messages]
  );
  const [awaitTitle, setAwaitTitle] = useState<
    ReturnType<typeof threadTitleWait> | undefined
  >();
  useCopilotThreads(awaitTitle);
  const wasLoading = useRef(false);
  // User turns on screen when the previous run ended. A history replay on
  // connect also flips `isLoading`; it must not move the address or refetch
  // the rail, so a run counts as this page's own only when it left more user
  // turns than the last one did. A fresh thread has no history, so its first
  // run is its own. (Reading the last message's role at the rising edge was
  // not reliable: the message and the loading flag do not land in one render.)
  const settledTurns = useRef<number | null>(null);

  useEffect(() => {
    const ended = wasLoading.current && !isLoading;
    wasLoading.current = isLoading;
    if (!ended) {
      return;
    }
    const own =
      settledTurns.current === null
        ? fresh && userTurns > 0
        : userTurns > settledTurns.current;
    settledTurns.current = userTurns;
    if (!own) {
      return;
    }
    if (fresh) {
      // Moves the address only; the page tree (and this chat) stays mounted.
      window.history.replaceState(null, '', `/agents/${threadId}`);
    }
    setAwaitTitle(threadTitleWait(threadId));
  }, [isLoading, userTurns, fresh, threadId]);

  const value = useMemo(() => ({ messages, userTurns }), [messages, userTurns]);

  return (
    <LiveMessagesContext.Provider value={value}>
      <LiveChatContext.Provider value={value}>{children}</LiveChatContext.Provider>
    </LiveMessagesContext.Provider>
  );
};

/**
 * CopilotKit 1.66 widened message content from a plain string to a list of
 * typed parts — text, image, audio and more. Everything this app puts on the
 * wire is still text, and the markers below (`Video:`, `Image:`,
 * `[--Media--]`) are its own conventions inside that text, so the parts are
 * folded back into one string. A non-text part contributes nothing rather than
 * stringifying into `[object Object]`.
 */
const contentToText = (
  content: UserMessageProps['message']['content']
): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('');
};

const Message: FC<UserMessageProps> = (props) => {
  const convertContentToImagesAndVideo = useMemo(() => {
    return contentToText(props.message?.content)
      // `[id:<media id>]` after the url is for the model (attachments need
      // the id); the bubble shows the file.
      .replace(/Video: (http\S*mp4)(?: \[id:[^\]]*\])?\n/g, (match: string, p1: string) => {
        return `<video controls class="h-[150px] w-[150px] rounded-[8px] mb-[10px]"><source src="${p1.trim()}" type="video/mp4">Your browser does not support the video tag.</video>`;
      })
      .replace(/Image: (http\S*)(?: \[id:[^\]]*\])?\n/g, (match: string, p1: string) => {
        return `<img src="${p1.trim()}" class="h-[150px] w-[150px] max-w-full rounded-[8px]" />`;
      })
      .replace(/\[\-\-Media\-\-\](.*)\[\-\-Media\-\-\]/g, (match: string, p1: string) => {
        return `<div class="flex justify-center mt-[20px]">${p1}</div>`;
      })
      .replace(
        /(\[--integrations--\][\s\S]*?\[--integrations--\])/g,
        (match: string, p1: string) => {
          return ``;
        }
      );
  }, [props.message?.content]);
  return (
    <div
      className="copilotKitMessage copilotKitUserMessage"
      dangerouslySetInnerHTML={{ __html: convertContentToImagesAndVideo }}
    />
  );
};
/**
 * The chat composer. Attached media rides inside the message as
 * `[--Media--]` lines (the model needs the URLs); the selected channels no
 * longer do: they reach the prompt as `properties.pq.channels` (see
 * AgentChat), which keeps the transcript, and the thread titles, clean.
 */
const NewInput: FC<InputProps> = (props) => {
  const [media, setMedia] = useState([] as { path: string; id: string }[]);
  const [value, setValue] = useState('');
  const setMediaFromEvent = useCallback(
    (e: {
      target: {
        name: string;
        value?: { id: string; path: string }[];
      };
    }) => setMedia(e.target.value || []),
    []
  );
  return (
    <>
      <Input
        {...props}
        attachments={
          <MediaPortal
            part="thumbs"
            value={value}
            media={media}
            setMedia={setMediaFromEvent}
          />
        }
        toolbar={
          <MediaPortal
            part="toolbar"
            value={value}
            media={media}
            setMedia={setMediaFromEvent}
          />
        }
        onChange={setValue}
        onSend={(text) => {
          const send = props.onSend(
            text +
              (media.length > 0
                ? '\n[--Media--]' +
                  media
                    .map((m) =>
                      hasExtension(m.path, 'mp4')
                        ? `Video: ${m.path} [id:${m.id}]`
                        : `Image: ${m.path} [id:${m.id}]`
                    )
                    .join('\n') +
                  '\n[--Media--]'
                : '')
          );
          setValue('');
          setMedia([]);
          return send;
        }}
      />
    </>
  );
};

/** What the `manualPosting` handler hands back to the model. */
type ManualPostingResult =
  | {
      status: 'shown';
      cardId: string;
      /** By root post id: the server's state of each post the card updates. */
      existing?: Record<string, AgentExistingPost>;
      /** showPostCard: the rows the card draws, since its arguments hold only an id. */
      list?: AgentDraftItem[];
    }
  | {
      status: 'invalid';
      cardId: string;
      errors: DraftValidationError[];
      /** Set on the last try the card takes; the model must stop and ask. */
      stop?: string;
    };

/** Invalid drafts the card accepts for one request before it tells the model to stop. */
const MAX_INVALID_DRAFTS = 3;

/**
 * Cards the model can act on by name. Filled by every rendered card (so a
 * reopened thread's cards are here too) and read by `publishFromCard`.
 */
const CardsContext = createContext<{
  register: (cardId: string, groups: AgentDraftGroup[], userTurn: number) => void;
  registry: React.MutableRefObject<
    Record<string, { groups: AgentDraftGroup[]; userTurn: number; order: number }>
  >;
  /** Bumps on every registration, so a card can react to a later one. */
  registered: number;
}>({ register: () => {}, registry: { current: {} }, registered: 0 });

const parseResult = (result: unknown) => parseToolResult<ManualPostingResult>(result);

/** The rows a showPostCard result carries, or nothing while it runs. */
const fromResult = (result: unknown) => {
  const parsed = parseResult(result);
  return parsed && typeof parsed === 'object' && parsed.status === 'shown' ? parsed : undefined;
};

export const Hooks: FC<{ children?: ReactNode }> = ({ children }) => {
  const { validate, execute, readExisting } = useDraftActions();
  const { cards, setCardOutcome, setCardMedia } = useContext(PropertiesContext);
  const { userTurns } = useContext(LiveChatContext);
  const registry = useRef<
    Record<string, { groups: AgentDraftGroup[]; userTurn: number; order: number }>
  >({});
  const order = useRef(0);
  const [registered, setRegistered] = useState(0);
  const register = useCallback(
    (cardId: string, groups: AgentDraftGroup[], userTurn: number) => {
      const known = registry.current[cardId];
      if (known) {
        // The card re-registers when its attachments change, so a typed
        // "post it now" publishes what the card shows, not the first draft.
        known.groups = groups;
        return;
      }
      registry.current[cardId] = { groups, userTurn, order: order.current++ };
      setRegistered((n) => n + 1);
    },
    []
  );
  // Invalid drafts in a row for the current request. A model that keeps
  // sending the same broken settings would otherwise call this forever.
  const invalidStreak = useRef({ turn: -1, count: 0 });
  // Handlers are registered once and read the live values through refs.
  const latestUserTurn = useRef(userTurns);
  const latestCards = useRef(cards);
  useEffect(() => {
    latestUserTurn.current = userTurns;
    latestCards.current = cards;
  }, [userTurns, cards]);

  // What happened to each card, for the prompt's "Current state": the model
  // must not recreate a post that was scheduled from the card, and must know
  // which card "post it now" refers to. Memoized: the SDK re-adds a changed
  // value on every render.
  const cardsSummary = useMemo(
    () =>
      Object.entries(cards).map(([cardId, groups]) => ({
        cardId,
        posts: Object.entries(groups).map(([group, outcome]) => ({
          group,
          ...(outcome as object),
        })),
      })),
    [cards]
  );
  useCopilotReadable({
    description: COPILOT_READABLE.cards,
    value: cardsSummary,
  });

  useCopilotAction({
    name: 'manualPosting',
    description:
      "Show a Post Preview card for one or more posts. Nothing is written by this call. For a BRAND-NEW post pass the complete draft, one row per channel. To change a post the server already has (from postsListTool / postReadTool) pass ONE row with existing set to its root post id and the full updated thread; the card comes up as Update post. The app validates every row against the platform rules. Returns {status:'shown', cardId} once the card is on screen, or {status:'invalid', errors:[{integrationId, channel, error}]}: fix those and call again. After 'shown' answer with one short sentence and stop; the user schedules, posts, saves, updates or edits from the card. To revise a draft, call again with the full updated draft.",
    parameters: [
      {
        name: 'list',
        type: 'object[]',
        description:
          'The posts to preview, one row per channel (integration id)',
        attributes: [
          {
            name: 'integrationId',
            type: 'string',
            description: 'The integration id',
          },
          {
            name: 'existing',
            type: 'string',
            description:
              'The root post id when this row changes a post the server already has (from postReadTool). Omit for a new post.',
            required: false,
          },
          {
            name: 'date',
            type: 'string',
            description:
              'Publish time in UTC, YYYY-MM-DDTHH:mm:ss. Omit for the next free slot.',
            required: false,
          },
          {
            // A string on purpose: an open `object` parameter arrives at the
            // model as `additionalProperties: false` after the runtime's
            // schema round trip, and the model can then only send {} or null.
            name: 'settings',
            type: 'string',
            description:
              'The platform settings for this channel as ONE JSON object string, e.g. {"who_can_reply_post":"everyone"}: every key integrationSchema marks required or gives a default for, with the values it allows. Omit only when integrationSchema says no settings are needed.',
            required: false,
          },
          {
            name: 'posts',
            type: 'object[]',
            description:
              'The post, then its comments or thread items, one under another',
            attributes: [
              {
                name: 'content',
                type: 'string',
                description: 'The content of the post, HTML',
              },
              {
                name: 'attachments',
                type: 'object[]',
                description: 'Attachments already in the media library',
                required: false,
                attributes: [
                  {
                    name: 'id',
                    type: 'string',
                    description: 'id of the attachment',
                  },
                  {
                    name: 'path',
                    type: 'string',
                    description: 'url of the attachment',
                  },
                ],
              },
              {
                name: 'delay',
                type: 'number',
                description:
                  'Minutes to wait after the previous item before this comment or thread item goes out; 0 or omitted for right after. Never on the first item.',
                required: false,
              },
            ],
          },
        ],
      },
    ],
    handler: async ({ list }): Promise<ManualPostingResult> => {
      const cardId = makeId(8);
      const groups = groupDraftItems(list as AgentDraftItem[]);
      register(cardId, groups, latestUserTurn.current);
      // Returned, never thrown: a thrown handler ends the run and the model
      // gets no chance to fix the draft.
      try {
        const errors = groups.length
          ? await validate(groups)
          : [{ error: 'The list is empty.' }];
        // A row that updates a server post must name one that exists; the
        // card shows that post's state beside the channel.
        const existing: Record<string, AgentExistingPost> = {};
        for (const group of groups) {
          if (!group.existing) {
            continue;
          }
          const current = await readExisting(group.existing);
          if (!current) {
            errors.push({
              integrationId: group.integrationIds[0],
              error: `No post with id ${group.existing}. Find it with postsListTool first.`,
            });
            continue;
          }
          if (current.integrationId && current.integrationId !== group.integrationIds[0]) {
            errors.push({
              integrationId: group.integrationIds[0],
              error: 'This post belongs to another channel; keep its integrationId.',
            });
            continue;
          }
          existing[group.existing] = { state: current.state, publishDate: current.publishDate };
        }
        if (!errors.length) {
          invalidStreak.current = { turn: latestUserTurn.current, count: 0 };
          return {
            status: 'shown',
            cardId,
            ...(Object.keys(existing).length ? { existing } : {}),
          };
        }
        const streak =
          invalidStreak.current.turn === latestUserTurn.current
            ? invalidStreak.current.count + 1
            : 1;
        invalidStreak.current = { turn: latestUserTurn.current, count: streak };
        return streak >= MAX_INVALID_DRAFTS
          ? {
              status: 'invalid',
              cardId,
              errors,
              stop: 'Do not call manualPosting again for this request. Tell the user in one sentence which setting is missing or invalid and ask them for it.',
            }
          : { status: 'invalid', cardId, errors };
      } catch (e: any) {
        return {
          status: 'invalid',
          cardId,
          errors: [{ error: e?.message || 'The post could not be validated.' }],
        };
      }
    },
    render: ({ args, status, result }) => (
      <DraftPreview
        args={args as { list?: AgentDraftItem[] }}
        status={status}
        result={result}
      />
    ),
  });

  useCopilotAction({
    name: 'publishFromCard',
    description:
      "Carry out the user's spoken decision about a Post Preview or Update post card shown earlier. Call ONLY when the user's latest message explicitly asks to schedule, post now, save as a draft or save the changes. Never call it in the same turn as manualPosting. cardId defaults to the latest open card; date (UTC) only with 'schedule', to move the post to that time. 'update' saves an existing post's changes and keeps its date and queue. Returns {status:'scheduled'|'posted'|'draft'|'updated', count} or {status:'error', error}; on error explain it in one sentence. Deleting is never done here.",
    parameters: [
      {
        name: 'action',
        type: 'string',
        description: "'schedule', 'now', 'draft' or 'update'",
      },
      {
        name: 'cardId',
        type: 'string',
        description: 'The cardId manualPosting returned. Defaults to the latest open card.',
        required: false,
      },
      {
        name: 'date',
        type: 'string',
        description: 'Publish time in UTC, YYYY-MM-DDTHH:mm:ss, only to override the card',
        required: false,
      },
    ],
    handler: async ({ action, cardId, date }) => {
      const kind = ['schedule', 'now', 'draft', 'update'].includes(String(action))
        ? (action as AgentDraftAction)
        : null;
      if (!kind) {
        return { status: 'error', error: "action must be 'schedule', 'now', 'draft' or 'update'." };
      }
      const pendingOf = (id: string) =>
        (registry.current[id]?.groups || []).filter((group) => {
          const outcome = latestCards.current[id]?.[group.key] as
            | { status?: string }
            | undefined;
          return !outcome || outcome.status === 'error';
        });
      const id =
        cardId && registry.current[cardId]
          ? cardId
          : Object.entries(registry.current)
              .sort((a, b) => b[1].order - a[1].order)
              .find(([key]) => pendingOf(key).length)?.[0];
      if (!id) {
        return { status: 'error', error: 'There is no open Post Preview card to act on.' };
      }
      // A confirmation is something the person typed after seeing the card.
      if (registry.current[id].userTurn >= latestUserTurn.current) {
        return {
          status: 'error',
          error: 'The user has not replied since this card was shown. Wait for them to decide from the card or in chat.',
        };
      }
      const pending = pendingOf(id);
      if (!pending.length) {
        return { status: 'error', error: 'Every post on this card is already done.' };
      }
      let count = 0;
      let failure: string | undefined;
      for (const group of pending) {
        const outcome = await execute(group, kind, date || undefined);
        if (!outcome) {
          // The person closed the confirmation the action asked for.
          failure = 'The user did not confirm.';
          continue;
        }
        setCardOutcome(id, group.key, outcome);
        if (outcome.status === 'error') {
          failure = outcome.error;
        } else {
          count += 1;
        }
      }
      if (failure && !count) {
        return { status: 'error', error: failure };
      }
      return {
        status:
          kind === 'now'
            ? 'posted'
            : kind === 'draft'
            ? 'draft'
            : kind === 'update'
            ? 'updated'
            : 'scheduled',
        count,
        ...(failure ? { error: failure } : {}),
      };
    },
  });

  // An existing post as a card, so the person can reschedule or delete it
  // from there. Deleting has no tool: the only way is the card's own button,
  // behind its confirmation.
  useCopilotAction({
    name: 'showPostCard',
    description:
      "Show an existing post (from postsListTool) as an Update post card, with its state and date, so the user can save changes, schedule it again or delete it from the card. Returns {status:'shown', cardId} or {status:'error', error}. After 'shown' reply with one short sentence and stop; never say you deleted anything.",
    parameters: [
      {
        name: 'id',
        type: 'string',
        description: 'The root post id from postsListTool',
      },
    ],
    handler: async ({ id }): Promise<ManualPostingResult | { status: 'error'; error: string }> => {
      if (typeof id !== 'string' || !id) {
        return { status: 'error', error: 'id is the root post id from postsListTool.' };
      }
      const current = await readExisting(id);
      if (!current?.integrationId) {
        return { status: 'error', error: `No post with id ${id}. Find it with postsListTool first.` };
      }
      const list: AgentDraftItem[] = [
        {
          integrationId: current.integrationId,
          existing: id,
          date: current.publishDate,
          settings: current.settings,
          posts: current.posts.map((post, index) => ({
            content: post.content,
            attachments: (current.media[index] || []).map((m) => ({
              id: m.id,
              path: m.path,
              ...(typeof m.thumbnail === 'string' ? { thumbnail: m.thumbnail } : {}),
            })),
            delay: post.delay,
          })),
        },
      ];
      const cardId = makeId(8);
      register(cardId, groupDraftItems(list), latestUserTurn.current);
      return {
        status: 'shown',
        cardId,
        list,
        existing: { [id]: { state: current.state, publishDate: current.publishDate } },
      };
    },
    render: ({ status, result }) => {
      const shown = fromResult(result);
      // A failed lookup is one step line, not an empty card.
      if (status === 'complete' && !shown) {
        return <ToolStep name="showPostCard" status="complete" result={result} />;
      }
      return <DraftPreview args={{ list: shown?.list }} status={status} result={result} />;
    },
  });

  /**
   * Puts attachments on a card's groups, in place: the thread state keeps
   * them (`media`), the card re-renders its preview from them, and the
   * registry is rewritten so a later typed action publishes them. Shared by
   * the `attachToCard` tool, the image card's "Add to card" and the menu.
   */
  const attachToCard = useCallback(
    (
      cardId: string | undefined,
      groupIndex: number | undefined,
      attachments: { id: string; path: string; thumbnail?: string }[],
      replace: boolean
    ): { status: 'attached'; cardId: string; count: number } | { status: 'error'; error: string } => {
      const id =
        cardId && registry.current[cardId]
          ? cardId
          : Object.entries(registry.current)
              .sort((a, b) => b[1].order - a[1].order)
              .find(([key]) => registry.current[key].groups.length)?.[0];
      if (!id) {
        return { status: 'error', error: 'There is no Post Preview card to attach to.' };
      }
      const groups = registry.current[id].groups.filter(
        (_, index) => groupIndex === undefined || index === groupIndex
      );
      if (!groups.length) {
        return { status: 'error', error: 'That card has no such post.' };
      }
      for (const group of groups) {
        const current = group.posts[0]?.attachments || [];
        setCardMedia(id, group.key, replace ? attachments : [...current, ...attachments]);
      }
      return { status: 'attached', cardId: id, count: groups.length };
    },
    [setCardMedia]
  );

  useCopilotAction({
    name: 'attachToCard',
    description:
      "Put media (an image from generateImageTool or the media library) on a Post Preview card shown earlier, in place: the card's preview updates and a later schedule uses it. Use this to change or add a card's image instead of calling manualPosting again. cardId defaults to the latest card; groupIndex to every post on the card. Returns {status:'attached', cardId, count} or {status:'error', error}.",
    parameters: [
      {
        name: 'attachments',
        type: 'string',
        description:
          'ONE JSON array string of {id, path} media library items, e.g. [{"id":"...","path":"https://..."}]',
      },
      {
        name: 'cardId',
        type: 'string',
        description: 'The cardId manualPosting returned. Defaults to the latest card.',
        required: false,
      },
      {
        name: 'groupIndex',
        type: 'number',
        description: 'Which post on the card (0-based). Omit for all of them.',
        required: false,
      },
      {
        name: 'replace',
        type: 'boolean',
        description: 'true replaces the current attachments (default); false adds to them.',
        required: false,
      },
    ],
    handler: async ({ attachments, cardId, groupIndex, replace }) => {
      let list: { id: string; path: string }[] = [];
      try {
        const parsed = JSON.parse(String(attachments || '[]'));
        list = (Array.isArray(parsed) ? parsed : []).filter(
          (a) => a && typeof a.id === 'string' && typeof a.path === 'string'
        );
      } catch {
        return { status: 'error', error: 'attachments must be a JSON array of {id, path}.' };
      }
      if (!list.length) {
        return { status: 'error', error: 'attachments is empty; pass {id, path} items from the media library.' };
      }
      return attachToCard(
        cardId || undefined,
        typeof groupIndex === 'number' ? groupIndex : undefined,
        list,
        replace !== false
      );
    },
  });

  // Every backend tool the agent calls, as a step line; a generated image
  // or a started video job as a card the person can put on the Post Preview.
  useCopilotAction({
    name: '*',
    render: ({ name, status, args, result }: CatchAllActionRenderProps<any>) =>
      name === 'generateImageTool' ? (
        <AgentImageCard
          args={args}
          status={status}
          result={result}
          onAdd={(media) => attachToCard(undefined, undefined, [media], true)}
        />
      ) : name === 'generateVideoTool' ? (
        <AgentVideoCard
          args={args}
          status={status}
          result={result}
          onAdd={(media) => attachToCard(undefined, undefined, [media], true)}
        />
      ) : (
        <ToolStep name={name} status={status} args={args} result={result} />
      ),
  });

  return (
    <CardsContext.Provider value={{ register, registry, registered }}>
      {children}
    </CardsContext.Provider>
  );
};

/**
 * Whether a media item is on a Post Preview already, whether the model
 * attached it (manualPosting's arguments, attachToCard) or the person did:
 * the same "Added to card" either way.
 */
const useOnCard = (mediaId?: string) => {
  const { media: cardMedia } = useContext(PropertiesContext);
  const { registry } = useContext(CardsContext);
  return (
    !!mediaId &&
    (Object.values(cardMedia).some((groups) =>
      Object.values(groups).some((list) => list.some((m) => m.id === mediaId))
    ) ||
      Object.values(registry.current).some((card) =>
        card.groups.some((group) =>
          group.posts.some((post) => post.attachments.some((a) => a.id === mediaId))
        )
      ))
  );
};

/**
 * The image generateImageTool made, on the Copilot page: at its real shape,
 * with Add to card (the latest Post Preview) and Regenerate. The model gets
 * the same {id, path} and usually attaches it itself; this is the person's
 * hand on the same lever.
 */
const AgentImageCard: FC<{
  args?: { prompt?: string; style?: string; orientation?: string };
  status: string;
  result?: unknown;
  onAdd: (media: { id: string; path: string }) => { status: string; error?: string };
}> = ({ args, status, result, onAdd }) => {
  const t = useT();
  const generateImage = useGenerateImage();
  const failureCopy = useGenerateImageFailureCopy();
  const toaster = useToaster();
  const parsed = status === 'complete' ? parseResult(result) : null;
  const fromTool =
    parsed && typeof parsed === 'object' && 'path' in parsed && (parsed as any).path
      ? { id: String((parsed as any).id || ''), path: String((parsed as any).path) }
      : null;
  const [media, setMedia] = useState<{ id: string; path: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const current = media || fromTool;
  const onCard = useOnCard(current?.id);
  const error =
    failed ||
    (parsed && typeof parsed === 'object' && 'error' in parsed
      ? String((parsed as any).error)
      : undefined);
  const regenerate = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const image = await generateImage(args?.prompt || '', args?.style, args?.orientation);
      if (isGeneratedImage(image)) {
        setMedia(image);
        setAdded(false);
      } else {
        setFailed(failureCopy(image));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <GeneratedMediaCard
      prompt={args?.prompt || ''}
      style={args?.style}
      orientation={args?.orientation}
      status={
        busy || status !== 'complete'
          ? 'generating'
          : error || !current
          ? 'failed'
          : 'ready'
      }
      media={current || undefined}
      error={error}
      used={added || onCard ? 'added' : undefined}
      useLabel={t('add_to_card', 'Add to card')}
      onUse={() => {
        if (!current) {
          return;
        }
        const outcome = onAdd(current);
        if (outcome.status === 'attached') {
          setAdded(true);
        } else {
          toaster.show(outcome.error || t('ai_generation_failed', 'AI generation failed, please try again later.'), 'warning');
        }
      }}
      onRegenerate={regenerate}
      busy={busy}
    />
  );
};

/**
 * The video generateVideoTool started, on the Copilot page: the job card
 * polls until the video lands, then Add to card puts it on the latest Post
 * Preview. The model only learns the job id; the card is the person's side.
 */
const AgentVideoCard: FC<{
  args?: {
    identifier?: string;
    output?: string;
    customParams?: { key: string; value: unknown }[];
  };
  status: string;
  result?: unknown;
  onAdd: (media: VideoJobMedia) => { status: string; error?: string };
}> = ({ args, status, result, onAdd }) => {
  const t = useT();
  const toaster = useToaster();
  const parsed = status === 'complete' ? parseResult(result) : null;
  const jobId =
    parsed && typeof parsed === 'object' && typeof (parsed as any).jobId === 'string'
      ? String((parsed as any).jobId)
      : undefined;
  const error =
    parsed && typeof parsed === 'object' && (parsed as any).error
      ? String((parsed as any).error)
      : undefined;
  const params = Array.isArray(args?.customParams) ? args.customParams : [];
  const prompt = params.find((p) => p?.key === 'prompt')?.value;
  const [media, setMedia] = useState<VideoJobMedia | null>(null);
  const [added, setAdded] = useState(false);
  const onCard = useOnCard(media?.id);
  return (
    <VideoJobCard
      jobId={jobId}
      error={error}
      prompt={typeof prompt === 'string' ? prompt : args?.identifier || ''}
      provider={args?.identifier}
      orientation={args?.output}
      used={added || onCard ? 'added' : undefined}
      useLabel={t('add_to_card', 'Add to card')}
      onReady={setMedia}
      onUse={(video) => {
        const outcome = onAdd(video);
        if (outcome.status === 'attached') {
          setAdded(true);
        } else {
          toaster.show(
            outcome.error || t('ai_generation_failed', 'AI generation failed, please try again later.'),
            'warning'
          );
        }
      }}
    />
  );
};

/**
 * The Post Preview card in the chat. Reads the draft off the tool call's
 * arguments (streamed while the model is still typing them), the validation
 * off its result, and what happened to each group off the thread's state, so
 * a reopened thread shows the same card with the same outcomes.
 */
const DraftPreview: FC<{
  args?: { list?: AgentDraftItem[] };
  status: string;
  result?: unknown;
}> = ({ args, status, result }) => {
  const t = useT();
  const { cards, setCardOutcome, media, setCardMedia, allChannels } =
    useContext(PropertiesContext);
  const { userTurns } = useContext(LiveChatContext);
  // The context value changes on every registration, so this re-renders
  // when a later card for the same request appears (the registry is a ref).
  const { register, registry } = useContext(CardsContext);
  const { execute, openComposer } = useDraftActions();
  const openImageModal = useAiImageModal();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const parsed = status === 'complete' ? parseResult(result) : null;
  const legacy = typeof parsed === 'string';
  const cardId =
    parsed && typeof parsed === 'object' && 'cardId' in parsed
      ? parsed.cardId
      : undefined;
  // Attachments put on the card after it was drawn ride over the tool
  // call's arguments, per group key: applied after grouping, because the
  // key hashes the arguments and a saved outcome hangs on it.
  const overlay = cardId ? media[cardId] : undefined;
  const groups = useMemo(() => {
    const drawn = groupDraftItems(args?.list, status === 'inProgress');
    if (!overlay) {
      return drawn;
    }
    return drawn.map((group) =>
      overlay[group.key]
        ? {
            ...group,
            posts: group.posts.map((post, index) =>
              index === 0 ? { ...post, attachments: overlay[group.key] } : post
            ),
          }
        : group
    );
  }, [args?.list, status, overlay]);
  const state: AgentDraftCardState = legacy
    ? 'legacy'
    : status === 'inProgress'
    ? 'streaming'
    : status === 'executing'
    ? 'checking'
    : parsed && typeof parsed === 'object' && parsed.status === 'invalid'
    ? 'invalid'
    : cardId
    ? 'ready'
    : 'legacy';

  // `register` ignores an id it already knows, so a card registers once.
  useEffect(() => {
    if (cardId && groups.length) {
      register(cardId, groups, userTurns);
    }
  }, [cardId, groups, register, userTurns]);

  const outcomes = useMemo(
    () => (cardId ? (cards[cardId] || {}) : {}) as Record<string, AgentDraftOutcome | undefined>,
    [cards, cardId]
  );
  const existing =
    parsed && typeof parsed === 'object' && parsed.status === 'shown'
      ? parsed.existing
      : undefined;
  // An invalid draft the model already redid: a later card exists for the
  // same request. It folds to one line, like a backend step, instead of
  // stacking a full card per attempt.
  const mine = cardId ? registry.current[cardId] : undefined;
  const superseded =
    state === 'invalid' &&
    !!mine &&
    Object.values(registry.current).some(
      (card) => card.userTurn === mine.userTurn && card.order > mine.order
    );

  const run = useCallback(
    async (group: AgentDraftGroup, work: () => Promise<AgentDraftOutcome | null>) => {
      if (!cardId) {
        return;
      }
      setBusy((prev) => ({ ...prev, [group.key]: true }));
      try {
        const outcome = await work();
        if (outcome) {
          setCardOutcome(cardId, group.key, outcome);
        }
      } finally {
        setBusy((prev) => ({ ...prev, [group.key]: false }));
      }
    },
    [cardId, setCardOutcome]
  );

  const invalid =
    parsed && typeof parsed === 'object' && parsed.status === 'invalid'
      ? parsed
      : null;

  if (superseded) {
    return (
      <div
        data-pq="copilot-step"
        data-tool="manualPosting"
        className="my-[4px] flex items-center gap-[8px] text-[12.5px] text-pqSoft"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" className="shrink-0">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="truncate">
          {t('draft_redone', 'Redid the draft after a channel rule failed')}
          {invalid?.errors?.[0]?.error ? ` · ${invalid.errors[0].error}` : ''}
        </span>
      </div>
    );
  }

  return (
    <AgentDraftCard
      groups={groups}
      state={state}
      errors={invalid?.errors}
      stopped={!!invalid?.stop}
      outcomes={outcomes}
      busy={busy}
      existing={existing}
      onAction={(group, action) => void run(group, () => execute(group, action))}
      onOpenComposer={(group) =>
        void run(group, async () =>
          (await openComposer(group))
            ? { status: 'composer', at: new Date().toISOString() }
            : null
        )
      }
      onChangeImage={
        cardId
          ? (group) =>
              openImageModal((image) => setCardMedia(cardId, group.key, [image]), {
                orientation: imageOrientationForPlatforms(
                  group.integrationIds
                    .map((id) => allChannels.find((c) => c.id === id)?.identifier)
                    .filter((p): p is string => !!p)
                ),
              })
          : undefined
      }
      onRemoveImage={
        cardId ? (group) => setCardMedia(cardId, group.key, []) : undefined
      }
    />
  );
};
