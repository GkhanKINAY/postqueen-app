'use client';

import { FC, useContext, useMemo } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { formatChannelHandle, channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Button } from '@gitroom/react/form/button';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import {
  PreviewMediaFrame,
  PreviewMediaMosaic,
} from '@gitroom/frontend/components/new-launch/preview-media';
import {
  FEED_PREVIEW_FALLBACK_WH,
  FEED_PREVIEW_MAX_WH,
  FEED_PREVIEW_MIN_WH,
  X_PAIR_MOSAIC_WH,
} from '@gitroom/frontend/components/new-launch/preview-media-aspect';

dayjs.extend(utc);

export type AgentDraftItem = {
  integrationId: string;
  date: string;
  settings?: Record<string, any>;
  posts: {
    content: string;
    attachments: { id: string; path: string }[];
  }[];
};

type AgentChannel = Integrations & {
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
};

export type AgentDraftOutcome = 'idle' | 'composer' | 'schedule';

const previewText = (html: string | undefined) =>
  stripHtmlValidation('none', html || '', false, true, false).trim();

/**
 * The same frame Post Preview draws: the real aspect ratio, clamped to the
 * feed range, one lightbox-able tile or a 2–4 mosaic. A fixed square crop
 * here showed a 9:16 reel and a 16:9 video as the same thumbnail.
 */
const DraftMedia: FC<{ paths: string[] }> = ({ paths }) => {
  const mediaDir = useMediaDirectory();
  const srcs = paths.map((path) => mediaDir.set(path));
  if (srcs.length === 1) {
    return (
      <PreviewMediaFrame
        className="rounded-[10px]"
        src={srcs[0]}
        minWH={FEED_PREVIEW_MIN_WH}
        maxWH={FEED_PREVIEW_MAX_WH}
        fallbackWH={FEED_PREVIEW_FALLBACK_WH}
        // A chat can hold several cards; a looping video in each is noise.
        autoplay={false}
      />
    );
  }
  return (
    <PreviewMediaMosaic
      className="rounded-[10px]"
      pairWH={X_PAIR_MOSAIC_WH}
      gridWH={X_PAIR_MOSAIC_WH}
      srcs={srcs}
    />
  );
};

const ChannelMark: FC<{ channel: AgentChannel }> = ({ channel }) => (
  <span
    title={channelNameWithHandle(channel)}
    className="flex min-w-0 items-center gap-[8px]"
  >
    <span className="relative h-[22px] w-[22px] shrink-0">
      <ImageWithFallback
        fallbackSrc={`/icons/platforms/${channel.identifier}.png`}
        src={channel.picture}
        className="rounded-[6px]"
        alt={channel.identifier}
        width={22}
        height={22}
      />
      <span className="absolute -bottom-[4px] -end-[4px] flex h-[15px] w-[15px] items-center justify-center rounded-full bg-pqBadgeRing">
        <SafeImage
          src={`/icons/platforms/${channel.identifier}.png`}
          className="rounded-full"
          alt={channel.identifier}
          width={11}
          height={11}
        />
      </span>
    </span>
    <span className="min-w-0 truncate text-[13px] font-[600] text-pqText">
      {channel.name}
      {!!formatChannelHandle(channel.display) && (
        <span className="ms-[6px] font-[500] text-pqMuted">
          {formatChannelHandle(channel.display)}
        </span>
      )}
    </span>
  </span>
);

const DraftRow: FC<{
  item: AgentDraftItem;
  channel?: AgentChannel;
}> = ({ item, channel }) => {
  const t = useT();
  const { formatDateTime } = useDateFormat();
  const when = item.date
    ? formatDateTime(dayjs.utc(item.date).local())
    : '';
  const post = item.posts?.[0];
  const comments = (item.posts || []).slice(1);
  const text = previewText(post?.content);
  const media = (post?.attachments || []).filter((a) => a?.path);

  return (
    <article className="flex flex-col gap-[10px] border-t border-pqLine pt-[12px] first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-[8px]">
        {channel ? (
          <ChannelMark channel={channel} />
        ) : (
          <span className="text-[13px] font-[600] text-pqMuted">
            {item.integrationId}
          </span>
        )}
        {when && (
          <span className="text-[12px] font-[500] text-pqSoft">{when}</span>
        )}
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap break-words text-start text-[13.5px] leading-[1.5] text-pqText">
        {text || t('no_content', 'no content')}
      </p>
      {media.length > 0 && <DraftMedia paths={media.map((a) => a.path)} />}
      {comments.length > 0 && (
        <div className="flex flex-col gap-[6px] rounded-[10px] bg-pqSettings p-[10px_12px]">
          <span className="text-[11px] font-[600] uppercase tracking-[0.04em] text-pqSoft">
            {t('comments', 'Comments')} · {comments.length}
          </span>
          <p className="line-clamp-2 text-[12.5px] leading-[1.45] text-pqMuted">
            {previewText(comments[0]?.content)}
          </p>
        </div>
      )}
    </article>
  );
};

export const AgentDraftCard: FC<{
  list: AgentDraftItem[] | undefined;
  outcome: AgentDraftOutcome;
  waiting: boolean;
  onSchedule?: () => void;
  onOpenComposer?: () => void;
}> = ({ list, outcome, waiting, onSchedule, onOpenComposer }) => {
  const t = useT();
  const { properties } = useContext(PropertiesContext);
  const channels = useMemo(
    () => (Array.isArray(properties) ? properties : []) as AgentChannel[],
    [properties]
  );
  const rows = (Array.isArray(list) ? list : []).filter(
    (item) => item?.integrationId
  );
  const showActions = waiting && outcome === 'idle' && rows.length > 0;

  return (
    <div
      data-pq="agent-draft-card"
      className="my-[8px] flex w-full max-w-[560px] flex-col gap-[14px] rounded-[14px] bg-pqPop p-[14px_16px] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      <div className="text-[13px] font-[600] text-pqText">
        {t('post_preview', 'Post Preview')}
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col gap-[10px]" data-pq="agent-draft-loading">
          <Skeleton className="h-[18px] w-[40%]" />
          <Skeleton className="h-[52px] w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-[12px]">
          {rows.map((item, index) => (
            <DraftRow
              key={`${item.integrationId}-${item.date}-${index}`}
              item={item}
              channel={channels.find((p) => p.id === item.integrationId)}
            />
          ))}
        </div>
      )}
      {showActions && (
        <div className="flex flex-wrap gap-[8px]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-pq="agent-draft-open"
            onClick={onOpenComposer}
          >
            {t('open_composer', 'Open composer')}
          </Button>
          <Button
            type="button"
            size="sm"
            data-pq="agent-draft-schedule"
            onClick={onSchedule}
          >
            {t('schedule', 'Schedule')}
          </Button>
        </div>
      )}
      {outcome === 'composer' && (
        <div className="text-[12.5px] text-pqMuted">
          {t('opening_composer', 'Opening the composer…')}
        </div>
      )}
      {outcome === 'schedule' && (
        <div className="text-[12.5px] text-pqMuted">
          {t(
            'copilot_will_schedule',
            'Copilot will schedule this. It will not open Create Post.'
          )}
        </div>
      )}
    </div>
  );
};
