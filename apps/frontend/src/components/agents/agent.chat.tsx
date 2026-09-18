'use client';

import React, {
  FC,
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
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  CopilotKit,
  useCopilotAction,
  useCopilotChatInternal,
} from '@copilotkit/react-core';
import {
  MediaPortal,
  PropertiesContext,
  useAgentRouteId,
  useCopilotThreads,
} from '@gitroom/frontend/components/agents/agent';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useAiAvailable } from '@gitroom/frontend/components/layout/user.context';
import { v4 as uuid } from 'uuid';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import {
  AgentDraftCard,
  AgentDraftItem,
  AgentDraftOutcome,
} from '@gitroom/frontend/components/agents/agent.draft.card';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
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
  // Read by the backend as `forwardedProps.pq` on every run and connect.
  const properties = useMemo(() => ({ pq: { surface: 'agent' } }), []);

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
      agent="postqueen"
      properties={properties}
    >
      <Hooks />
      <AgentLiveBridge threadId={threadId} fresh={routeId === 'new'} />
      <div
        style={
          {
            // The SDK is themed through its own custom properties, bound to
            // the token layer where the chat mounts. Background stays
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
                ? `Video: ${m.path}`
                : `Image: ${m.path}`
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
 * The design puts a 26px "PQ" tile beside assistant messages. The SDK's own
 * AssistantMessage keeps rendering the content and the regenerate / copy /
 * thumbs controls — it is only wrapped, never replaced.
 */
const AssistantMessage: FC<AssistantMessageProps> = (props) => {
  if (!props.message?.content) {
    return <CopilotAssistantMessage {...props} />;
  }
  return (
    <div className="flex items-start gap-[10px]">
      <span className="mt-[10px] flex h-[26px] w-[26px] shrink-0 select-none items-center justify-center rounded-[8px] bg-pqBrandSoft text-[10.5px] font-[700] text-pqFocused">
        PQ
      </span>
      <div className="min-w-0 flex-1">
        <CopilotAssistantMessage {...props} />
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
const AgentLiveBridge: FC<{ threadId: string; fresh: boolean }> = ({
  threadId,
  fresh,
}) => {
  const { isLoading, messages } = useCopilotChatInternal();
  const { mutate } = useCopilotThreads();
  const wasLoading = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const finished = wasLoading.current && !isLoading && messages.length > 0;
    wasLoading.current = isLoading;
    if (!finished) {
      return;
    }
    if (fresh) {
      // Moves the address only; the page tree (and this chat) stays mounted.
      window.history.replaceState(null, '', `/agents/${threadId}`);
    }
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = [1500, 5000, 12000].map((ms) =>
      setTimeout(() => {
        void mutate();
      }, ms)
    );
  }, [isLoading, messages.length, fresh, threadId, mutate]);

  useEffect(
    () => () => timers.current.forEach((timer) => clearTimeout(timer)),
    []
  );

  return null;
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
      .replace(/Video: (http.*mp4\n)/g, (match: string, p1: string) => {
        return `<video controls class="h-[150px] w-[150px] rounded-[8px] mb-[10px]"><source src="${p1.trim()}" type="video/mp4">Your browser does not support the video tag.</video>`;
      })
      .replace(/Image: (http.*\n)/g, (match: string, p1: string) => {
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
const NewInput: FC<InputProps> = (props) => {
  const [media, setMedia] = useState([] as { path: string; id: string }[]);
  const [value, setValue] = useState('');
  const { properties } = useContext(PropertiesContext);
  const copilotIntegrations = useMemo(
    () => selectableIntegrations(properties),
    [properties]
  );
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
                        ? `Video: ${m.path}`
                        : `Image: ${m.path}`
                    )
                    .join('\n') +
                  '\n[--Media--]'
                : '') +
              `
${
  copilotIntegrations.length
    ? `[--integrations--]
Use the following social media platforms: ${JSON.stringify(
        copilotIntegrations.map((p) => ({
          id: p.id,
          platform: p.identifier,
          profilePicture: p.picture,
          additionalSettings: p.additionalSettings,
        }))
      )}
[--integrations--]`
    : ``
}`
          );
          setValue('');
          setMedia([]);
          return send;
        }}
      />
    </>
  );
};

export const Hooks: FC = () => {
  useCopilotAction({
    name: 'manualPosting',
    description:
      'Show a Post Preview card in chat for a brand-new draft (channels, UTC dates, HTML posts, attachments, settings). Always call this before schedulePostTool. Wait for the user: they will schedule from the card or open Create Post. Do not use this to edit an existing post.',
    parameters: [
      {
        name: 'list',
        type: 'object[]',
        description:
          'list of posts to schedule to different social media (integration ids)',
        attributes: [
          {
            name: 'integrationId',
            type: 'string',
            description: 'The integration id',
          },
          {
            name: 'date',
            type: 'string',
            description: 'UTC date of the scheduled post',
          },
          {
            name: 'settings',
            type: 'object',
            description: 'Settings for the integration [input:settings]',
          },
          {
            name: 'posts',
            type: 'object[]',
            description: 'list of posts / comments (one under another)',
            attributes: [
              {
                name: 'content',
                type: 'string',
                description: 'the content of the post',
              },
              {
                name: 'attachments',
                type: 'object[]',
                description: 'list of attachments',
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
            ],
          },
        ],
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      if (
        status === 'inProgress' ||
        status === 'executing' ||
        status === 'complete'
      ) {
        return (
          <DraftPreview
            args={args}
            respond={respond}
            waiting={status === 'executing'}
          />
        );
      }

      return null;
    },
  });
  return null;
};

const DraftPreview: FC<{
  respond: (value: any) => void;
  waiting: boolean;
  args?: {
    list?: AgentDraftItem[];
  };
}> = ({ args, respond, waiting }) => {
  const modals = useModals();
  const { properties } = useContext(PropertiesContext);
  const usableProperties = useMemo(
    () => selectableIntegrations(properties),
    [properties]
  );
  const [outcome, setOutcome] = useState<AgentDraftOutcome>('idle');
  const responded = useRef(false);

  const finish = useCallback(
    (message: string) => {
      if (responded.current) {
        return;
      }
      responded.current = true;
      respond(message);
    },
    [respond]
  );

  const openComposer = useCallback(() => {
    setOutcome('composer');
    // Free the run first. The result means "the user took over in Create
    // Post", whichever way the composer closes afterwards. Waiting for a save
    // here left the card, and with it the chat input, stuck when the composer
    // was closed unsaved.
    finish(
      'User opened the Create Post composer with this draft. They will edit and schedule there. Do not call schedulePostTool for this draft.'
    );
    const rows = (args?.list || []).flatMap((integration) => {
      const channel = usableProperties.find(
        (p) => p.id === integration.integrationId
      );
      // Skip reconnect / in-between channels — same guard as Select Channels.
      return channel ? [{ integration, channel }] : [];
    });

    // One composer per row, the next opening as the previous one closes.
    // The composer closes itself with `closeAll()`, which never reaches the
    // modal's `onClose`, so it is `customClose` (user close) and `mutate`
    // (saved) that hand over. A save calls `mutate`, then `closeAll()`, then
    // `customClose` two seconds later: the hand-over runs once, and the next
    // composer opens after that `closeAll()` has cleared the stack.
    const openRow = (index: number) => {
      const row = rows[index];
      if (!row) {
        return;
      }
      let advanced = false;
      const next = () => {
        if (advanced) {
          return;
        }
        advanced = true;
        setTimeout(() => openRow(index + 1), 0);
      };
      const { integration, channel } = row;
      modals.openModal({
        id: 'add-edit-modal',
        closeOnClickOutside: false,
        removeLayout: true,
        closeOnEscape: false,
        withCloseButton: false,
        askClose: true,
        size: '80%',
        title: ``,
        classNames: {
          modal: 'w-[100%] max-w-[1400px] text-textColor',
        },
        children: (
          // A brand-new post seeded the way a saved Set is: the channel with
          // its settings, and the thread as the global value. Not an
          // `ExistingDataContextProvider` — that is the edit path, and it
          // showed Delete Post for a post the server had never seen.
          <AddEditModal
            date={dayjs.utc(integration.date).local()}
            allIntegrations={usableProperties}
            integrations={usableProperties}
            set={{
              posts: [
                {
                  integration: { id: channel.id },
                  settings: integration.settings || {},
                  // Never an empty thread: the composer renders nothing (and
                  // has no close button) until it has one item to edit.
                  value: (integration.posts?.length
                    ? integration.posts
                    : [{ content: '', attachments: [] }]
                  ).map((p) => ({
                    content: p.content || '',
                    media: (p.attachments || []).map((a) => ({
                      id: a.id,
                      path: a.path,
                    })),
                  })),
                },
              ],
            }}
            reopenModal={() => {}}
            mutate={next}
            customClose={() => {
              // The user closed it unsaved: the composer leaves closing to
              // us when `customClose` is set. After a save this fires late
              // and must not touch the composer that is open by then.
              if (advanced) {
                return;
              }
              modals.closeAll();
              next();
            }}
          />
        ),
      });
    };
    openRow(0);
  }, [args, finish, usableProperties, modals]);

  const schedule = useCallback(() => {
    setOutcome('schedule');
    finish(
      'User confirmed. Schedule these posts now with schedulePostTool using the same channels, dates, HTML content, attachments and settings. Do not call manualPosting again.'
    );
  }, [finish]);

  return (
    <AgentDraftCard
      list={args?.list}
      outcome={outcome}
      waiting={waiting}
      onSchedule={schedule}
      onOpenComposer={openComposer}
    />
  );
};
