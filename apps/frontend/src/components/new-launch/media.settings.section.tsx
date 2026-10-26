'use client';

import { FC, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { MediaSettingsIcon } from '@gitroom/frontend/components/ui/icons';
import { MediaComponentInner } from '@gitroom/frontend/components/launches/helpers/media.settings.component';

// The values the editor lets the user change: the global ones, or the ones
// of a channel that was customized
export const useMediaSettingsValues = () => {
  return useLaunchStore(
    useShallow((state) => {
      const internal = state.internal.find(
        (p) => p.integration.id === state.current
      );
      if (internal) {
        return internal.integrationValue;
      }

      return state.current === 'global' ? state.global : [];
    })
  );
};

/**
 * The per-media thumbnail and alt text, reachable from the settings below the
 * editor instead of only by clicking an attachment. Opens the same media
 * settings dialog as the attachment does.
 */
export const MediaSettingsSection: FC = () => {
  const t = useT();
  const modals = useModals();
  const mediaDirectory = useMediaDirectory();
  const values = useMediaSettingsValues();

  const openSettings = useCallback(
    (index: number, media: Record<string, any>) => {
      modals.openModal({
        title: t('media_settings', 'Media Settings'),
        askClose: false,
        closeOnEscape: true,
        children: (close) => (
          <MediaComponentInner
            media={media as any}
            onClose={close}
            onSelect={(value: any) => {
              // read at save time: the dialog outlives the render that opened it
              const state = useLaunchStore.getState();
              const internal = state.internal.find(
                (p) => p.integration.id === state.current
              );
              const list = internal ? internal.integrationValue : state.global;
              const updated = (list[index]?.media || []).map((p) =>
                p.id === media.id ? { ...p, ...value } : p
              );
              if (internal) {
                state.setInternalValueMedia(state.current, index, updated);
                return;
              }
              state.setGlobalValueMedia(index, updated);
            }}
          />
        ),
      });
    },
    [modals, t]
  );

  if (!values.some((p) => p.media?.length)) {
    return null;
  }

  return (
    <div
      data-pq="composer-media-settings"
      className="mx-[4px] flex flex-col gap-[12px] rounded-[14px] bg-pqInner p-[14px] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center gap-[6px] text-[14px] font-[600] text-pqText">
          {t('thumbnails_and_alt_text', 'Thumbnails & alt text')}
          <svg
            data-tooltip-id="tooltip"
            data-tooltip-class-name="!max-w-[400px] break-words"
            data-tooltip-content={t(
              'media_settings_section_tooltip',
              'Thumbnails apply to videos in the main post and are sent to every channel that supports them. YouTube may ignore them on videos it treats as Shorts (vertical, up to 3 minutes) without failing the publish, and requires a phone-verified channel for custom thumbnails. If YouTube rejects the thumbnail, the video is still published.'
            )}
            className="shrink-0 cursor-help text-pqSoft"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
        <div className="text-[12.5px] leading-[1.5] text-pqMuted">
          {t(
            'media_settings_section_description',
            'Click a media item to set its alt text, or its thumbnail if it is a video.'
          )}
        </div>
      </div>
      {values.map((value, index) =>
        !value.media?.length ? null : (
          <div key={value.id} className="flex flex-col gap-[6px]">
            {values.length > 1 && (
              <div className="text-[12px] font-[600] text-pqSoft">
                {index === 0
                  ? t('post', 'Post')
                  : `${t('comment', 'Comment')} ${index}`}
              </div>
            )}
            <div className="flex flex-wrap gap-[10px]">
              {value.media.map((media) => (
                <button
                  type="button"
                  key={media.id}
                  onClick={() => openSettings(index, media)}
                  aria-label={t('media_settings', 'Media Settings')}
                  className="group relative h-[48px] w-[48px] shrink-0 overflow-hidden rounded-[8px] bg-pqSettings shadow-[inset_0_0_0_1px_var(--border)] transition-[box-shadow] hover:shadow-[inset_0_0_0_1px_var(--brand)] focus-visible:shadow-[inset_0_0_0_1px_var(--brand)] focus-visible:outline-none"
                >
                  {hasExtension(media.path, 'mp4') ? (
                    <VideoFrame
                      url={mediaDirectory.set(media.path)}
                      poster={
                        media.thumbnail
                          ? mediaDirectory.set(media.thumbnail)
                          : undefined
                      }
                    />
                  ) : (
                    <img
                      className="h-full w-full object-cover"
                      src={mediaDirectory.set(media.path)}
                      alt={(media as { alt?: string }).alt || ''}
                    />
                  )}
                  <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/72 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <MediaSettingsIcon size={28} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};
