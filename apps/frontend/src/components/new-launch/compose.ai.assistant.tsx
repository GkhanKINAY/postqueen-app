'use client';

import {
  createContext,
  FC,
  FormEvent,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import clsx from 'clsx';
import NextLink from 'next/link';
import {
  CopilotChat,
  CopilotKitCSSProperties,
  InputProps,
  RenderSuggestionsListProps,
  useChatContext,
} from '@copilotkit/react-ui';
import { useCopilotAction } from '@copilotkit/react-core';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useAiAvailable, useUser } from '@gitroom/frontend/components/layout/user.context';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { TrialLockCard } from '@gitroom/frontend/components/billing/trial-lock-card';

export type StudioRail = 'preview' | 'assistant';

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

const COPILOT_INSTRUCTIONS = `
You are an assistant that helps the user write this social media post in Create Post.
You can:
- Rewrite or replace the post text with setPosts (pass the full thread as a string array)
- Generate an image and attach it to the post with generateImageForPost
- Attach existing media with attachMediaToPost when you already have an id and path

When the user asks to rephrase, shorten, expand, or change tone, apply the new text with setPosts immediately. Do not only propose it in chat. Keep the same number of thread items unless they ask otherwise.

You cannot schedule, publish, or open other pages. The user uses Schedule / Post Now for that.
After changing the post, keep replies short.
`;

const APPLY_WITH_SET_POSTS =
  'Then apply it with setPosts (the full thread as a string array).';

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

const ComposeAiSuggestionList: FC<RenderSuggestionsListProps> = ({
  suggestions,
  onSuggestionClick,
  isLoading,
}) => {
  const t = useT();
  const marks: Record<string, string> = {
    [t('rephrase', 'Rephrase')]: '🔄',
    [t('shorten', 'Shorten')]: '✂️',
    [t('expand', 'Expand')]: '➕',
    [t('more_casual', 'More Casual')]: '😊',
    [t('more_formal', 'More Formal')]: '💼',
  };
  if (!suggestions.length) {
    return null;
  }
  return (
    <div
      data-pq="composer-ai-chips"
      className="flex flex-col gap-[8px] px-[16px] pb-[10px]"
    >
      <div className="text-[11px] font-[700] uppercase tracking-[0.06em] text-pqMuted">
        {t('quick_edits', 'Quick edits')}
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            disabled={isLoading}
            onClick={() => onSuggestionClick(suggestion.message)}
            className="flex h-[28px] items-center gap-[4px] rounded-[8px] bg-pqInner px-[8px] text-[12px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {marks[suggestion.title] ? (
              <span aria-hidden="true" className="text-[12px] leading-none">
                {marks[suggestion.title]}
              </span>
            ) : null}
            {suggestion.title}
          </button>
        ))}
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
  const [text, setText] = useState('');
  if (!isVisible) {
    return null;
  }
  const send = () => {
    const next = text.trim();
    if (inProgress || !next) {
      return;
    }
    onSend(text);
    setText('');
  };
  const showStop = inProgress && !hideStopButton;
  return (
    <div className="copilotKitInputContainer">
      <div className="copilotKitInput flex items-end gap-[8px]">
        <textarea
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
            t(
              'share_with_the_world',
              'What do you want to share with the world?'
            )
          }
          rows={3}
          className="min-h-[72px] flex-1 resize-none"
        />
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

const ComposeAiBindingsInner: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const {
    current,
    appendGlobalValueMedia,
    appendInternalValueMedia,
    setLocked,
  } = useLaunchStore(
    useShallow((state) => ({
      current: state.current,
      appendGlobalValueMedia: state.appendGlobalValueMedia,
      appendInternalValueMedia: state.appendInternalValueMedia,
      setLocked: state.setLocked,
    }))
  );

  const attach = (index: number, media: { id: string; path: string }[]) => {
    if (current !== 'global') {
      appendInternalValueMedia(current, index, media);
      return;
    }
    appendGlobalValueMedia(index, media);
  };

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
      attach(typeof index === 'number' ? index : 0, [{ id, path }]);
    },
  });

  useCopilotAction({
    name: 'generateImageForPost',
    description:
      'Generate an image from a prompt and attach it to the post. Same path as AI Image in the toolbar.',
    parameters: [
      {
        name: 'prompt',
        type: 'string',
        description: 'What to draw',
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
        name: 'index',
        type: 'number',
        description: 'Thread index, default 0',
        required: false,
      },
    ],
    handler: async ({ prompt, style, index }) => {
      const trimmed = String(prompt || '').trim();
      if (!trimmed) {
        toaster.show(
          t('please_type_your_prompt', 'Please type your prompt'),
          'warning'
        );
        return 'Need a prompt to generate an image.';
      }
      setLocked(true);
      try {
        const response = await fetch('/media/generate-image-with-prompt', {
          method: 'POST',
          body: JSON.stringify({
            prompt: `
<!-- description -->
${trimmed}
<!-- /description -->

<!-- style -->
${style || 'Realistic'}
<!-- /style -->
`,
          }),
        });
        const image = await response.json();
        if (response.ok && image?.id && image?.path) {
          attach(typeof index === 'number' ? index : 0, [
            { id: image.id, path: image.path },
          ]);
          return 'Image attached to the post.';
        }
        if (image === false) {
          toaster.show(
            t(
              'ai_credits_exhausted',
              'You are out of AI credits for this month.'
            ),
            'warning'
          );
          return 'Out of AI credits.';
        }
        if (!image?.cancelled) {
          toaster.show(
            typeof image?.message === 'string'
              ? image.message
              : t(
                  'ai_generation_failed',
                  'AI generation failed, please try again later.'
                ),
            'warning'
          );
        }
        return 'Could not generate an image.';
      } catch {
        toaster.show(
          t(
            'ai_generation_failed',
            'AI generation failed, please try again later.'
          ),
          'warning'
        );
        return 'Could not generate an image.';
      } finally {
        setLocked(false);
      }
    },
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
            className="flex w-full max-w-[360px] items-center gap-[12px] rounded-[14px] bg-pqPop p-[12px_14px] text-start shadow-[inset_0_0_0_1px_var(--border)] hover:bg-pqBrandSoft hover:shadow-[inset_0_0_0_1px_var(--brand)]"
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
              <span className="text-[12px] leading-[1.45] text-pqMuted">
                {tip}
              </span>
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
          </div>
        )}
      </div>
      <ComposeAiSuggestionList
        suggestions={suggestions}
        onSuggestionClick={explain}
        isLoading={false}
      />
      <form className="copilotKitInputContainer" onSubmit={onSubmit}>
        <div className="copilotKitInput flex items-end gap-[8px]">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={t(
              'share_with_the_world',
              'What do you want to share with the world?'
            )}
            rows={3}
            className="min-h-[72px] flex-1 resize-none"
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
  const apply = APPLY_WITH_SET_POSTS;
  const suggestions = useMemo(
    () => [
      {
        title: t('rephrase', 'Rephrase'),
        message: `Rephrase this post. Keep the same meaning and facts. ${apply}`,
      },
      {
        title: t('shorten', 'Shorten'),
        message: `Shorten this post. Keep the same meaning. ${apply}`,
      },
      {
        title: t('expand', 'Expand'),
        message: `Expand this post with more useful detail, in the same voice. ${apply}`,
      },
      {
        title: t('more_casual', 'More Casual'),
        message: `Rewrite this post in a more casual, conversational voice. ${apply}`,
      },
      {
        title: t('more_formal', 'More Formal'),
        message: `Rewrite this post in a more formal, professional voice. ${apply}`,
      },
    ],
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
            <CopilotChat
              className="h-full w-full"
              instructions={COPILOT_INSTRUCTIONS}
              suggestions={suggestions}
              RenderSuggestionsList={ComposeAiSuggestionList}
              Input={ComposeAiInput}
              labels={{
                title: label,
                initial: t(
                  'assistant_initial_message',
                  'Hi! I can rewrite this post, expand it for the selected channels, or generate an image and attach it.'
                ),
                placeholder: t(
                  'share_with_the_world',
                  'What do you want to share with the world?'
                ),
              }}
            />
          </div>
        </div>
      ) : (
        <ComposeAiUnconfigured suggestions={suggestions} />
      )}
    </div>
  );
};
