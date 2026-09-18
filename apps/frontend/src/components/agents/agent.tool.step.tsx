'use client';

import React, { createContext, FC, useContext } from 'react';
import clsx from 'clsx';
import { useLazyToolRenderer } from '@copilotkit/react-core';
import { AssistantMessageProps } from '@copilotkit/react-ui';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Spinner } from '@gitroom/react/ui/spinner';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { PreviewMediaFrame } from '@gitroom/frontend/components/new-launch/preview-media';
import {
  FEED_PREVIEW_MAX_WH,
  FEED_PREVIEW_MIN_WH,
} from '@gitroom/frontend/components/new-launch/preview-media-aspect';

/**
 * The live message list of a chat, from the one `useCopilotChatInternal`
 * call each surface makes in a component that stays mounted (the hook
 * connects on mount and detaches the run on unmount).
 */
export const LiveMessagesContext = createContext<{ messages: any[] }>({
  messages: [],
});

/**
 * react-ui draws only the first tool call of a message as generative UI;
 * the Mastra bridge hangs every call of a turn on the same message, so the
 * rest (a card after a lookup, the steps around it) are drawn by the
 * surface's AssistantMessage through this, each with a message that holds
 * just that call. Without it a video card that follows the generator lookup
 * never appears.
 */
export const useExtraToolCalls = (props: AssistantMessageProps) => {
  const { messages } = useContext(LiveMessagesContext);
  const lazyRenderer = useLazyToolRenderer();
  const message = props.message as {
    toolCalls?: { id: string; function: { name: string } }[];
  };
  return (message?.toolCalls || []).slice(1).map((toolCall) => (
    <React.Fragment key={toolCall.id}>
      {lazyRenderer({ ...(props.message as any), toolCalls: [toolCall] }, messages)?.()}
    </React.Fragment>
  ));
};

/** A tool result as the runtime hands it over: an object, or JSON in a string. */
export const parseToolResult = <T,>(result: unknown): T | string | null => {
  if (result == null) {
    return null;
  }
  if (typeof result === 'object') {
    return result as T;
  }
  try {
    const parsed = JSON.parse(String(result));
    return parsed && typeof parsed === 'object' ? parsed : String(result);
  } catch {
    return String(result);
  }
};

/**
 * One quiet line per backend tool call, the way an agent product shows its
 * steps: what is happening while the reply is still coming, a check when it
 * is done. Generated images come back as a picture at their real aspect.
 * Both Copilot surfaces draw it from their catch-all renderer.
 */
export const ToolStep: FC<{
  name: string;
  status: string;
  args?: Record<string, any>;
  result?: unknown;
}> = ({ name, status, args, result }) => {
  const t = useT();
  const mediaDir = useMediaDirectory();
  const labels: Record<string, string> = {
    integrationSchema: t('copilot_step_rules', 'Checking channel rules'),
    integrationList: t('copilot_step_channels', 'Listing your channels'),
    groupList: t('copilot_step_customers', 'Listing customers'),
    triggerTool: t('copilot_step_channel_data', 'Fetching channel data'),
    postsListTool: t('copilot_step_calendar', 'Looking at your calendar'),
    postSettingsTool: t('copilot_step_settings', 'Updating post settings'),
    integrationSchedulePostTool: t('copilot_step_scheduling', 'Scheduling'),
    schedulePostTool: t('copilot_step_scheduling', 'Scheduling'),
    analyticsSummaryTool: t('copilot_step_analytics', 'Reading analytics'),
    analyticsPostsTool: t('copilot_step_analytics', 'Reading analytics'),
    analyticsPostTool: t('copilot_step_analytics', 'Reading analytics'),
    generateImageTool: t('copilot_step_image', 'Generating image'),
    generateVideoOptions: t('copilot_step_video_options', 'Checking video generators'),
    videoFunctionTool: t('copilot_step_video_options', 'Checking video generators'),
    generateVideoTool: t('copilot_step_video', 'Generating video'),
    videoStatusTool: t('copilot_step_video', 'Generating video'),
    uploadFromUrlTool: t('copilot_step_upload', 'Uploading media'),
    publishFromCard: t('copilot_step_card', 'Updating the card'),
    attachToCard: t('copilot_step_card_image', 'Updating the card media'),
  };
  const label = labels[name] || t('copilot_step_working', 'Working');
  const done = status === 'complete';
  const parsed = done ? parseToolResult<Record<string, any>>(result) : null;
  const failed =
    !!parsed &&
    typeof parsed === 'object' &&
    (('error' in parsed && !!parsed.error) || parsed.status === 'interrupted');
  const image =
    name === 'generateImageTool' && parsed && typeof parsed === 'object'
      ? (parsed as { path?: string }).path
      : undefined;
  const platform = name === 'integrationSchema' ? args?.platform : undefined;

  return (
    <div data-pq="copilot-step" data-tool={name} className="my-[4px] flex flex-col gap-[8px]">
      <div
        className={clsx(
          'flex items-center gap-[8px] text-[12.5px]',
          failed ? 'text-pqWarn' : 'text-pqSoft'
        )}
      >
        {done ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" className="shrink-0">
            {failed ? (
              <path d="M12 8v5M12 16.5v.01M4.5 19h15L12 5.5 4.5 19Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        ) : (
          <Spinner width={14} height={14} />
        )}
        <span>
          {label}
          {platform ? ` · ${platform}` : ''}
        </span>
      </div>
      {image && (
        <PreviewMediaFrame
          className="max-w-[360px] rounded-[10px]"
          src={mediaDir.set(image)}
          minWH={FEED_PREVIEW_MIN_WH}
          maxWH={FEED_PREVIEW_MAX_WH}
          fallbackWH={1}
          autoplay={false}
        />
      )}
    </div>
  );
};
