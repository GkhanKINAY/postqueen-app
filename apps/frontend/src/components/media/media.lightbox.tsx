'use client';

import React, { FC, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@gitroom/frontend/components/ui/icons';

export type LightboxMedia = {
  id: string;
  path: string;
  originalName?: string | null;
  name?: string;
  meta?: string;
  fileSize?: number;
};

function mediaMetaLabel(media: LightboxMedia) {
  const name = media.originalName || media.name || media.path;
  const isVideo =
    hasExtension(media.path, 'mp4') || /\.webm$/i.test(media.path);
  let format = media.meta;
  if (!format) {
    if (isVideo) format = 'MP4';
    else {
    const ext = name.split('.').pop()?.toUpperCase();
      format = ext && ext.length <= 5 ? ext : 'Image';
    }
  }
  if (media.fileSize && media.fileSize > 0) {
    const kb = media.fileSize / 1024;
    const size =
      kb >= 1024
        ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB`
        : `${Math.max(1, Math.round(kb))} KB`;
    if (!media.meta || !/\d+\s*(KB|MB)/i.test(media.meta)) {
      const extOnly = format.split('·')[0].trim();
      return `${extOnly} · ${size}`;
    }
  }
  return format;
}

export const MediaLightbox: FC<{
  media: LightboxMedia;
  onClose: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  /** The neighbouring files; left out at either end of the list. */
  onPrev?: () => void;
  onNext?: () => void;
}> = ({ media, onClose, onDelete, onDownload, onPrev, onNext }) => {
  const t = useT();
  const mediaDirectory = useMediaDirectory();
  // Kept per file, so a broken image does not blank the next one shown.
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const imgFailed = failedPath === media.path;
  const [mounted, setMounted] = useState(false);
  const isVideo =
    hasExtension(media.path, 'mp4') || /\.webm$/i.test(media.path);
  const url = mediaDirectory.set(media.path);
  const metaLabel = mediaMetaLabel(media);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Alt/Cmd + arrow is the browser's Back, and a focused video seeks
      // with the arrows itself.
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('video, input, textarea, [contenteditable="true"]')) {
        return;
      }
      // The arrow that points at a button walks that way, so RTL swaps them.
      const rtl = document.documentElement.getAttribute('dir') === 'rtl';
      const step =
        e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') ? onNext : onPrev;
      if (!step) return;
      e.preventDefault();
      step();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [mounted, onClose, onPrev, onNext]);

  const stop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-pqMediaScrim p-[48px] tablet:p-[24px] mobile:p-[16px]"
      onClick={onClose}
      data-pq="media-lightbox"
    >
      <div
        className="flex w-full max-w-[min(880px,100%)] flex-col gap-[12px]"
        onClick={stop}
      >
        <div className="flex items-center gap-[8px]">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-[600] text-white">
              {t('media', 'Media')}
            </div>
            <div className="mt-[2px] text-[12px] text-white/60">{metaLabel}</div>
          </div>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              title={t('download', 'Download')}
              className="grid h-[32px] w-[32px] place-items-center rounded-[9px] bg-white/12 text-white hover:bg-white/24"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path
                  d="M12 4v12M7.5 11.5 12 16l4.5-4.5M4 20h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title={t('delete', 'Delete')}
              className="grid h-[32px] w-[32px] place-items-center rounded-[9px] bg-white/12 text-white hover:bg-pqDanger"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path
                  d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title={t('close', 'Close')}
            className="grid h-[32px] w-[32px] place-items-center rounded-[9px] bg-white/12 text-white hover:bg-white/24"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="relative grid max-h-[min(72vh,720px)] min-h-[200px] w-full place-items-center overflow-hidden rounded-[14px] bg-black/35 outline outline-1 outline-white/12 -outline-offset-1">
          {isVideo ? (
            <video
              key={url}
              className="relative z-[1] max-h-[min(72vh,720px)] max-w-full object-contain"
              src={url}
              controls
              autoPlay
              playsInline
            />
          ) : !imgFailed ? (
            <img
              key={url}
              src={url}
              alt={t('media', 'Media')}
              className="relative z-[1] max-h-[min(72vh,720px)] max-w-full object-contain"
              onError={() => setFailedPath(media.path)}
            />
          ) : null}
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              title={t('previous', 'Previous')}
              aria-label={t('previous', 'Previous')}
              data-pq="media-lightbox-prev"
              className="absolute start-[10px] top-1/2 z-[2] grid h-[44px] w-[44px] -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronLeftIcon size={20} className="rtl:rotate-180" />
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              title={t('next', 'Next')}
              aria-label={t('next', 'Next')}
              data-pq="media-lightbox-next"
              className="absolute end-[10px] top-1/2 z-[2] grid h-[44px] w-[44px] -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronRightIcon size={20} className="rtl:rotate-180" />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
