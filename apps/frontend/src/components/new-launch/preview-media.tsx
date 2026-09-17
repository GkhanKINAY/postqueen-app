'use client';

import { FC, ReactNode, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { VideoOrImage } from '@gitroom/react/helpers/video.or.image';
import { MediaLightbox } from '@gitroom/frontend/components/media/media.lightbox';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  FEED_PREVIEW_FALLBACK_WH,
  X_PAIR_MOSAIC_WH,
  clampPreviewAspect,
} from '@gitroom/frontend/components/new-launch/preview-media-aspect';

/** Open the Media lightbox over Create Post instead of a new tab. */
export const PreviewLightboxButton: FC<{
  src: string;
  className?: string;
  children: ReactNode;
}> = ({ src, className, children }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-pq="preview-media-enlarge"
        className={clsx(
          'cursor-pointer appearance-none border-0 bg-transparent p-0 text-start',
          className
        )}
        onClick={() => setOpen(true)}
        aria-label={t('enlarge_image', 'Enlarge image')}
      >
        {children}
      </button>
      {open && (
        <MediaLightbox
          media={{ id: src, path: src }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

/** One complete 4:5 card fits the preview pane; stacked cards snap into view. */
export const PREVIEW_MEDIA_MAX_HEIGHT = 'min(34vh, 300px)';

export const PreviewMediaFrame: FC<{
  src: string;
  minWH: number;
  maxWH: number;
  fallbackWH?: number;
  aspectWH?: number;
  className?: string;
  autoplay?: boolean;
  onAspect?: (ratio: number) => void;
}> = ({
  src,
  minWH,
  maxWH,
  fallbackWH = FEED_PREVIEW_FALLBACK_WH,
  aspectWH,
  className,
  autoplay = true,
  onAspect,
}) => {
  const [ratio, setRatio] = useState(fallbackWH);

  useEffect(() => {
    setRatio(fallbackWH);
  }, [src, fallbackWH]);

  const onMediaReady = useCallback(
    (width: number, height: number) => {
      const next = clampPreviewAspect(width, height, minWH, maxWH);
      if (!Number.isFinite(next)) {
        return;
      }
      setRatio(next);
      onAspect?.(next);
    },
    [minWH, maxWH, onAspect]
  );

  const displayWH = aspectWH ?? ratio;
  // Tall enough to read a 4:5, short enough that one complete card (header +
  // media + actions) fits in the preview pane instead of sitting half-cut
  // under the composer footer.
  const maxHeight = PREVIEW_MEDIA_MAX_HEIGHT;

  return (
    <div
      data-pq="preview-media"
      className={clsx(
        'relative mx-auto overflow-hidden bg-black/20',
        className
      )}
      style={{
        aspectRatio: `${displayWH} / 1`,
        maxHeight,
        width: `min(100%, calc(${maxHeight} * ${displayWH}))`,
      }}
    >
      <PreviewLightboxButton src={src} className="absolute inset-0 block">
        <VideoOrImage
          autoplay={autoplay}
          src={src}
          onMediaReady={aspectWH == null ? onMediaReady : undefined}
        />
      </PreviewLightboxButton>
    </div>
  );
};

/**
 * Timeline mosaic for 2–4 photos. X crops a pair to 7:8 each (overall 14:8)
 * and keeps that same 14:8 frame for 3-up and 4-up (`gridWH` = pair). Facebook
 * / LinkedIn sit two squares side by side (`pairWH={2}`) and a square 2×2
 * after that.
 */
export const PreviewMediaMosaic: FC<{
  srcs: string[];
  pairWH?: number;
  gridWH?: number;
  className?: string;
}> = ({ srcs, pairWH = X_PAIR_MOSAIC_WH, gridWH = 1, className }) => {
  const shown = srcs.slice(0, 4);
  const extra = srcs.length - shown.length;
  const displayWH = shown.length === 2 ? pairWH : gridWH;
  const maxHeight = PREVIEW_MEDIA_MAX_HEIGHT;

  if (shown.length < 2) {
    return null;
  }

  return (
    <div
      data-pq="preview-media-mosaic"
      className={clsx(
        'mx-auto grid gap-[2px] overflow-hidden bg-black/20',
        shown.length === 2 && 'grid-cols-2 grid-rows-1',
        shown.length >= 3 && 'grid-cols-2 grid-rows-2',
        className
      )}
      style={{
        aspectRatio: `${displayWH} / 1`,
        maxHeight,
        width: `min(100%, calc(${maxHeight} * ${displayWH}))`,
      }}
    >
      {shown.map((src, index) => (
        <PreviewLightboxButton
          key={`${src}-${index}`}
          src={src}
          className={clsx(
            'relative block h-full min-h-0 min-w-0 overflow-hidden',
            shown.length === 3 && index === 0 && 'row-span-2'
          )}
        >
          <VideoOrImage
            autoplay={true}
            src={src}
            imageClassName="absolute inset-0 h-full w-full"
            videoClassName="absolute inset-0 h-full w-full"
          />
          {extra > 0 && index === shown.length - 1 && (
            <span className="absolute inset-0 grid place-items-center bg-black/45 text-[18px] font-[700] text-white">
              +{extra}
            </span>
          )}
        </PreviewLightboxButton>
      ))}
    </div>
  );
};
