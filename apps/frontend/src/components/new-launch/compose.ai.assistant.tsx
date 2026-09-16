'use client';

import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useMemo,
} from 'react';
import clsx from 'clsx';
import NextLink from 'next/link';
import {
  CopilotChat,
  CopilotKitCSSProperties,
  RenderSuggestionsListProps,
} from '@copilotkit/react-ui';
import { useCopilotAction } from '@copilotkit/react-core';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useAiAvailable } from '@gitroom/frontend/components/layout/user.context';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';

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

const SparkleIcon: FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="currentColor"
    aria-hidden="true"
    className="shrink-0 text-pqFocused"
  >
    <path d="M12 1.8 15.2 8.8 22.2 12 15.2 15.2 12 22.2 8.8 15.2 1.8 12 8.8 8.8Z" />
    <path d="M18.55 2.45 19.75 6.25 23.55 7.45 19.75 8.65 18.55 12.45 17.35 8.65 13.55 7.45 17.35 6.25Z" />
  </svg>
);

const railTabClass = (active: boolean) =>
  clsx(
    'flex h-[32px] cursor-pointer items-center gap-[6px] rounded-[8px] px-[10px] text-[12.5px] font-[600] transition-colors',
    active
      ? 'bg-pqInner text-pqText shadow-pqE1'
      : 'text-pqSoft hover:bg-pqHover hover:text-pqText'
  );

const ComposeAiSuggestionList: FC<RenderSuggestionsListProps> = ({
  suggestions,
  onSuggestionClick,
  isLoading,
}) => {
  if (!suggestions.length) {
    return null;
  }
  return (
    <div
      data-pq="composer-ai-chips"
      className="flex flex-wrap gap-[8px] px-[16px] pb-[8px]"
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.title}
          type="button"
          disabled={isLoading}
          onClick={() => onSuggestionClick(suggestion.message)}
          className="flex h-[36px] items-center rounded-[10px] bg-pqInner px-[12px] text-[12.5px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {suggestion.title}
        </button>
      ))}
    </div>
  );
};

/**
 * Post Preview | AI Assistant, in the right-rail header. This is the switch
 * the compose chat fills — not a second popup.
 */
export const StudioRailTabs: FC = () => {
  const t = useT();
  const { rail, setRail } = useStudioRail();
  return (
    <div
      data-pq="composer-rail-tabs"
      className="flex min-w-0 flex-1 items-center gap-[4px] rounded-pqSm bg-pqSettings p-[2px]"
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
        <SparkleIcon />
        <span>{t('your_assistant', 'AI assistant')}</span>
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
  const label = t('your_assistant', 'AI assistant');

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
      <SparkleIcon />
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
          'Optional style: Realistic, Cartoon, Anime, Fantasy, Abstract, Pixel Art, Sketch, Watercolor, Minimalist, Cyberpunk',
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

const ComposeAiUnconfigured: FC = () => {
  const t = useT();
  return (
    <div className="flex h-full min-h-0 flex-col items-start justify-center gap-[12px] px-[20px]">
      <SparkleIcon />
      <div className="font-display text-[18px] font-[600] -tracking-[0.015em] text-pqText">
        {t('your_assistant', 'AI assistant')}
      </div>
      <p className="text-[13.5px] leading-[1.55] text-pqMuted">
        {t(
          'compose_ai_unconfigured_tip',
          'AI assistant needs OpenAI configured. Discover Claude, ChatGPT, and MCP agents in Connections.'
        )}
      </p>
      <NextLink
        href="/connections"
        className="inline-flex h-[36px] items-center rounded-[8px] bg-pqBrandSoft px-[12px] text-[12.5px] font-[600] text-pqFocused hover:bg-pqBoxFocused"
      >
        {t('connections', 'Connections')}
      </NextLink>
    </div>
  );
};

/**
 * Copilot chat that fills the Post Preview rail. Chat history lives on the
 * layout CopilotKit provider, so switching back to Preview does not drop it.
 */
export const ComposeAiRail: FC = () => {
  const t = useT();
  const aiOk = useAiAvailable();
  const label = t('your_assistant', 'AI assistant');
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
      data-pq="composer-ai-rail"
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
      className="absolute inset-0 flex min-h-0 flex-col bg-pqBg"
    >
      {aiOk ? (
        <CopilotChat
          className="flex h-full min-h-0 w-full flex-col"
          instructions={COPILOT_INSTRUCTIONS}
          suggestions={suggestions}
          RenderSuggestionsList={ComposeAiSuggestionList}
          labels={{
            title: label,
            initial: t(
              'assistant_initial_message',
              'Hi! I can rewrite this post, expand it for the selected channels, or generate an image and attach it.'
            ),
            placeholder: t('write_something', 'Write something …'),
          }}
        />
      ) : (
        <ComposeAiUnconfigured />
      )}
    </div>
  );
};
