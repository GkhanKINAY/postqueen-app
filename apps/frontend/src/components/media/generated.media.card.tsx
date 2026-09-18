'use client';

import { FC, ReactNode, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { PreviewMediaFrame } from '@gitroom/frontend/components/new-launch/preview-media';
import {
  FEED_PREVIEW_MAX_WH,
  FEED_PREVIEW_MIN_WH,
} from '@gitroom/frontend/components/new-launch/preview-media-aspect';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';

export type GeneratedMediaStatus = 'generating' | 'ready' | 'failed';

/**
 * One AI-generated image or video, the same card on both Copilot surfaces:
 * the brief it came from, the result at its real shape, and what to do with
 * it. Pure presentation; the surface decides what "use" means (attach to the
 * post in the composer, add to the Post Preview card on the Copilot page).
 */
export const GeneratedMediaCard: FC<{
  prompt: string;
  style?: string;
  orientation?: string;
  /** Sets the waiting line; a video counts minutes, an image seconds. */
  kind?: 'image' | 'video';
  status: GeneratedMediaStatus;
  media?: { id: string; path: string; thumbnail?: string };
  error?: string;
  /** What "use" did, once it happened. */
  used?: 'attached' | 'added';
  useLabel: string;
  onUse?: () => void;
  onUndo?: () => void;
  onRegenerate?: () => void;
  busy?: boolean;
  /** Extra line under the actions, e.g. a billing link when credits are out. */
  footer?: ReactNode;
}> = ({
  prompt,
  style,
  orientation,
  kind = 'image',
  status,
  media,
  error,
  used,
  useLabel,
  onUse,
  onUndo,
  onRegenerate,
  busy,
  footer,
}) => {
  const t = useT();
  const mediaDir = useMediaDirectory();
  // The clock restarts with every wait (Regenerate too): a status change
  // clears it during render, the way state is adjusted when a prop changes,
  // and each tick carries its own start, so no tick shows the previous count.
  const [clock, setClock] = useState<{ startedAt: number; now: number } | null>(null);
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    setClock(null);
  }
  useEffect(() => {
    if (status !== 'generating') {
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setClock({ startedAt, now: Date.now() }), 1000);
    return () => clearInterval(timer);
  }, [status]);
  const seconds = clock ? Math.floor((clock.now - clock.startedAt) / 1000) : 0;
  const meta = [style, orientation].filter(Boolean).join(' · ');
  const elapsed =
    kind === 'video'
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : `${seconds}s`;

  return (
    <div
      data-pq="generated-media-card"
      data-state={status}
      className="my-[6px] flex w-full flex-col gap-[10px] rounded-[12px] bg-pqPop p-[12px] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      <div className="flex flex-col gap-[2px]">
        <div className="line-clamp-2 text-[12.5px] text-pqMuted">{prompt}</div>
        {meta && (
          <div className="font-mono text-[11px] text-pqSoft">{meta}</div>
        )}
      </div>
      {status === 'generating' && (
        <div className="flex flex-col gap-[8px]">
          <Skeleton
            className={clsx(
              'w-full rounded-[10px]',
              kind === 'video' && orientation === 'vertical'
                ? 'aspect-[3/4] max-w-[240px]'
                : 'aspect-[4/3] max-w-[360px]'
            )}
          />
          <div className="text-[12px] text-pqSoft">
            {kind === 'video'
              ? t('generating_video', 'Generating video')
              : t('generating_image', 'Generating image')}{' '}
            · {elapsed}
          </div>
        </div>
      )}
      {status === 'ready' && media && (
        <PreviewMediaFrame
          className="max-w-[360px] rounded-[10px]"
          src={mediaDir.set(media.path)}
          poster={media.thumbnail ? mediaDir.set(media.thumbnail) : undefined}
          minWH={FEED_PREVIEW_MIN_WH}
          maxWH={FEED_PREVIEW_MAX_WH}
          fallbackWH={kind === 'video' && orientation === 'vertical' ? 9 / 16 : 1}
          autoplay={false}
        />
      )}
      {status === 'failed' && (
        <div className="text-[12.5px] text-pqWarn">
          {error || t('ai_generation_failed', 'AI generation failed, please try again later.')}
        </div>
      )}
      {status !== 'generating' && (
        <div className="flex flex-wrap items-center gap-[8px]">
          {status === 'ready' && used && (
            <span className="text-[12.5px] font-[600] text-pqMuted">
              {used === 'attached'
                ? t('suggestion_applied', 'Applied')
                : t('added_to_card', 'Added to card')}
            </span>
          )}
          {status === 'ready' && used && onUndo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-pq="generated-media-undo"
              disabled={busy}
              onClick={onUndo}
            >
              {t('undo', 'Undo')}
            </Button>
          )}
          {status === 'ready' && onUse && (
            <Button
              type="button"
              size="sm"
              variant={used ? 'ghost' : undefined}
              data-pq="generated-media-use"
              disabled={busy}
              onClick={onUse}
            >
              {used ? t('apply_again', 'Apply again') : useLabel}
            </Button>
          )}
          {onRegenerate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-pq="generated-media-regenerate"
              disabled={busy}
              onClick={onRegenerate}
              className={clsx(status === 'failed' && 'text-pqText')}
            >
              {t('regenerate', 'Regenerate')}
            </Button>
          )}
        </div>
      )}
      {footer}
    </div>
  );
};
