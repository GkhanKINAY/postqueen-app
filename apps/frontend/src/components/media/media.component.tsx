'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import EventEmitter from 'events';
import clsx from 'clsx';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import dynamic from 'next/dynamic';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { AiImage } from '@gitroom/frontend/components/launches/ai.image';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ThirdPartyMedia } from '@gitroom/frontend/components/third-parties/third-party.media';
import { ReactSortable } from 'react-sortablejs';
import { AiVideo } from '@gitroom/frontend/components/launches/ai.video';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { useFeatureSetupHint } from '@gitroom/frontend/components/media/feature.setup.hint';
import {
  InsertMediaIcon,
  DesignMediaIcon,
} from '@gitroom/frontend/components/ui/icons';
import { MediaComponentInner } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const Polonto = dynamic(
  () => import('@gitroom/frontend/components/launches/polonto')
);
const showModalEmitter = new EventEmitter();

export { Pagination } from '@gitroom/frontend/components/media/media.pagination';
import { MediaBox } from '@gitroom/frontend/components/media/media.box';
export { MediaBox };

export const ShowMediaBoxModal: FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [callBack, setCallBack] =
    useState<(params: { id: string; path: string }[]) => void | undefined>();
  const closeModal = useCallback(() => {
    setShowModal(false);
    setCallBack(undefined);
  }, []);
  useEffect(() => {
    showModalEmitter.on('show-modal', (cCallback) => {
      setShowModal(true);
      setCallBack(() => cCallback);
    });
    return () => {
      showModalEmitter.removeAllListeners('show-modal');
    };
  }, []);
  if (!showModal) return null;
  return (
    <div className="text-textColor">
      <MediaBox setMedia={callBack!} closeModal={closeModal} />
    </div>
  );
};
export const showMediaBox = (
  callback: (params: { id: string; path: string }[]) => void
) => {
  showModalEmitter.emit('show-modal', callback);
};

export const MultiMediaComponent: FC<{
  label: string;
  description: string;
  mediaNotAvailable?: boolean;
  dummy: boolean;
  // The agent composer draws the toolbar buttons as ghosts inside its frame;
  // the post composer keeps its filled pills. Same buttons, same handlers.
  ghost?: boolean;
  // Agent splits thumbs (above the textarea) from the toolbar (inside controls).
  // Post composer leaves this unset and renders both together.
  ghostPart?: 'thumbs' | 'toolbar' | 'all';
  // Attach-only fields drop Integrations and the AI generators, leaving the
  // media buttons. Set on media inputs that live *inside* a generator form —
  // the VEO3 images field would otherwise offer "Generate video" and an
  // Integrations modal stacked on the video modal it is already inside.
  // (Those fields also pass `dummy`, which makes Design Media a no-op, so what
  // remains there in practice is Insert media.)
  attachmentsOnly?: boolean;
  allData: {
    content: string;
    id?: string;
    image?: Array<{
      id: string;
      path: string;
    }>;
  }[];
  value?: Array<{
    path: string;
    id: string;
  }>;
  text: string;
  name: string;
  error?: any;
  onOpen?: () => void;
  onClose?: () => void;
  toolBar?: React.ReactNode;
  information?: React.ReactNode;
  // Quiet thread action that belongs on the same chrome row as the tools
  // and character count — not a second CTA sitting in the well below.
  trailing?: React.ReactNode;
  onChange: (event: {
    target: {
      name: string;
      value?: Array<{
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
        thumbnailTimestamp?: number;
      }>;
    };
  }) => void;
}> = (props) => {
  const {
    name,
    error,
    text,
    onChange,
    value,
    allData,
    dummy,
    ghost,
    ghostPart = 'all',
    attachmentsOnly,
    toolBar,
    information,
    trailing,
    mediaNotAvailable,
  } = props;
  const showThumbs = !ghost || ghostPart === 'all' || ghostPart === 'thumbs';
  const showToolbar = !ghost || ghostPart === 'all' || ghostPart === 'toolbar';

  // Labels hide from the *column*, not the window. Ghost sits between two
  // 264px rails (~564px at 1440px); the post composer is a 1440px card with a
  // 440px preview, so the filled toolbar is ~900px — still narrower than the
  // `iconBreak`/`maxMedia` viewports those buttons also use. Measuring the
  // tools row covers both. Cache the labelled width so compact doesn't
  // flip-flop: once the buttons shrink, re-measuring them would say there is
  // room, unhide the labels, and wrap again.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const naturalWidth = useRef(0);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const node = ghost ? toolbarRef.current : toolsRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    const measure = (available: number) => {
      const row = ghost ? node.firstElementChild : node;
      if (!row) {
        return;
      }
      setCompact((wasCompact) => {
        if (!wasCompact) {
          const kids = Array.from(row.children);
          const gap = 6;
          naturalWidth.current =
            kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) +
            gap * Math.max(0, kids.length - 1);
        }
        return available < naturalWidth.current;
      });
    };
    const observer = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ghost, showToolbar]);

  const hideLabel = compact;
  const user = useUser();
  const modals = useModals();
  const t = useT();
  const { touch } = useViewport();
  const { billingEnabled, plontoKey, aiEnabled } = useVariables();
  // Buffer-sized overlay thumbs are for Create Post. Agent (ghost) and
  // in-form attachment fields stay as small chips.
  const studioThumbs = !ghost && !attachmentsOnly;
  const hasInstagram = useLaunchStore((state) =>
    state.selectedIntegrations.some(
      (p) =>
        p.integration.identifier === 'instagram' ||
        p.integration.identifier === 'instagram-standalone'
    )
  );
  const setupHint = useFeatureSetupHint();
  // The hosted service hides what it has no key for. A self-hosted instance
  // keeps the button and explains how to switch it on (FeatureSetupHint).
  const showDesign = !billingEnabled || !!plontoKey;
  const showAiImage = !billingEnabled || aiEnabled;
  useEffect(() => {
    setCurrentMedia(value);
  }, [value]);

  const [currentMedia, setCurrentMedia] = useState(value);
  // The attachment list, readable without re-creating `changeMedia`.
  //
  // `new-modal.tsx` builds a modal's children once, at open time, so whatever
  // `changeMedia` the AI generators captured then is the one that runs when
  // their request lands — minutes later. Closing over `currentMedia` meant that
  // callback appended to the list as it was at click time: anything added with
  // Insert media while the generation ran was wiped when it finished.
  //
  // Synced in an effect rather than during render: a render React throws away
  // (transition, Offscreen, StrictMode's double invoke) would otherwise still
  // publish its list to a callback that outlives it.
  const currentMediaRef = useRef(currentMedia);
  useEffect(() => {
    currentMediaRef.current = currentMedia;
  }, [currentMedia]);

  const mediaDirectory = useMediaDirectory();
  const changeMedia = useCallback(
    (
      m:
        | {
            path: string;
            id: string;
          }
        | {
            path: string;
            id: string;
          }[]
    ) => {
      const mediaArray = Array.isArray(m) ? m : [m];
      const existing = currentMediaRef.current || [];
      const seen = new Set(existing.map((x) => x.id));
      const additions = mediaArray.filter((x) => x?.id && !seen.has(x.id));
      if (additions.length === 0) {
        return;
      }
      const newMedia = [...existing, ...additions];
      setCurrentMedia(newMedia);
      onChange({
        target: {
          name,
          value: newMedia,
        },
      });
    },
    [name, onChange]
  );
  const showModal = useCallback(() => {
    modals.openModal({
      title: t('media_library', 'Media Library'),
      askClose: false,
      closeOnEscape: true,
      size: 'min(1200px, calc(100vw - 64px))',
      maxSize: 'min(1200px, calc(100vw - 64px))',
      ...(touch ? { height: '100%' } : {}),
      children: (close) => (
        <MediaBox
          setMedia={changeMedia}
          closeModal={close}
          attachedMedia={currentMedia || []}
        />
      ),
    });
  }, [changeMedia, currentMedia, modals, t, touch]);

  const clearMedia = useCallback(
    (topIndex: number) => () => {
      const newMedia = currentMedia?.filter((f, index) => index !== topIndex);
      setCurrentMedia(newMedia);
      onChange({
        target: {
          name,
          value: newMedia,
        },
      });
    },
    [currentMedia, name, onChange]
  );

  const designMedia = useCallback(() => {
    if (!plontoKey) {
      setupHint(
        t('design_media', 'Design Media'),
        'NEXT_PUBLIC_POLOTNO',
        'https://docs.postqueen.ai/configuration/polotno'
      );
      return;
    }
    if (!!user?.tier?.ai && !dummy) {
      modals.openModal({
        askClose: false,
        title: t('design_media', 'Design Media'),
        size: '80%',
        children: (close) => (
          <Polonto setMedia={changeMedia} closeModal={close} />
        ),
      });
    }
    // `user` and `dummy` are read inside, and `changeMedia` no longer changes
    // identity with the media list, so they have to be declared here or this
    // callback keeps its first-render capture of the tier gate.
  }, [changeMedia, user, dummy, modals, t, plontoKey, setupHint]);

  const openMediaSettings = useCallback(
    (media: {
      id: string;
      path: string;
      alt?: string;
      thumbnail?: string;
      thumbnailTimestamp?: number;
    }) => {
      modals.openModal({
        title: t('change_alt_text', 'Change alt text'),
        askClose: false,
        closeOnEscape: true,
        children: (close) => (
          <MediaComponentInner
            media={media as any}
            onClose={close}
            onSelect={(next: any) => {
              const existing = currentMediaRef.current || [];
              const updated = existing.map((item) =>
                item.id === media.id ? { ...item, ...next } : item
              );
              setCurrentMedia(updated);
              onChange({
                target: {
                  name,
                  value: updated,
                },
              });
            }}
          />
        ),
      });
    },
    [modals, t, name, onChange]
  );

  const replaceMediaAt = useCallback(
    (index: number) =>
      (m: { path: string; id: string }[]) => {
        const next = m[0];
        if (!next?.id) {
          return;
        }
        const existing = currentMediaRef.current || [];
        const updated = existing.map((item, i) =>
          i === index ? { ...item, id: next.id, path: next.path } : item
        );
        setCurrentMedia(updated);
        onChange({
          target: {
            name,
            value: updated,
          },
        });
      },
    [name, onChange]
  );

  const editMedia = useCallback(
    (
      index: number,
      media: {
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
        thumbnailTimestamp?: number;
      }
    ) => {
      const isVideo = hasExtension(media?.path, 'mp4');
      const canDesign = showDesign && !!user?.tier?.ai && !dummy && !isVideo;
      if (canDesign) {
        if (!plontoKey) {
          setupHint(
            t('design_media', 'Design Media'),
            'NEXT_PUBLIC_POLOTNO',
            'https://docs.postqueen.ai/configuration/polotno'
          );
          return;
        }
        modals.openModal({
          askClose: false,
          title: t('design_media', 'Design Media'),
          size: '80%',
          children: (close) => (
            <Polonto setMedia={replaceMediaAt(index)} closeModal={close} />
          ),
        });
        return;
      }
      openMediaSettings(media);
    },
    [
      showDesign,
      user,
      dummy,
      plontoKey,
      setupHint,
      t,
      modals,
      replaceMediaAt,
      openMediaSettings,
    ]
  );

  if (ghost && ghostPart === 'thumbs' && !currentMedia?.length) {
    return null;
  }

  return (
    <>
      <div
        className={clsx(
          'b1 flex select-none w-full',
          ghost && ghostPart === 'thumbs'
            ? 'flex-wrap'
            : 'flex-col gap-[8px] rounded-bl-[8px]'
        )}
      >
        {showThumbs && (
          <div
            className={clsx(
              'flex',
              ghost
                ? 'flex-wrap gap-[7px] overflow-visible pb-[3px] pe-[6px] pt-[6px]'
                : studioThumbs
                  ? 'flex-wrap items-start gap-[10px] px-[12px] pt-[10px]'
                  : 'gap-[10px] overflow-visible px-[12px] pe-[18px] pt-[8px]'
            )}
          >
            {!!currentMedia && (
              <ReactSortable
                list={currentMedia}
                setList={(next) => {
                  setCurrentMedia(next);
                  onChange({ target: { name, value: next } });
                }}
                className={clsx(
                  'sortable-container flex',
                  ghost
                    ? 'flex-wrap gap-[7px] overflow-visible'
                    : studioThumbs
                      ? 'flex-wrap gap-[10px]'
                      : 'gap-[10px] overflow-visible'
                )}
                animation={200}
                swap={true}
                handle=".dragging"
                filter={'[data-ci-actions="1"]'}
                preventOnFilter={true}
              >
                {currentMedia.map((media, index) => (
                  <div
                    key={`${media.id}-${index}`}
                    data-pq={studioThumbs ? 'composer-media-thumb' : undefined}
                    className={clsx(
                      'group relative transition-[box-shadow]',
                      ghost
                        ? 'dragging h-[58px] w-[58px] cursor-move overflow-visible rounded-[9px] bg-pqSettings shadow-[inset_0_0_0_1px_var(--border)]'
                        : studioThumbs
                          ? 'dragging h-[120px] w-[120px] cursor-move overflow-hidden rounded-[10px] bg-pqSettings shadow-[inset_0_0_0_1px_var(--border)]'
                          : 'dragging h-[48px] w-[48px] cursor-move overflow-visible rounded-[8px] bg-pqSettings shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--brand)]'
                    )}
                  >
                    <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
                      {hasExtension(media?.path, 'mp4') ? (
                        <VideoFrame url={mediaDirectory.set(media?.path)} />
                      ) : (
                        <img
                          className="h-full w-full object-cover"
                          src={mediaDirectory.set(media?.path)}
                          alt={(media as { alt?: string }).alt || ''}
                        />
                      )}
                    </div>

                    {studioThumbs ? (
                      <>
                        <button
                          type="button"
                          data-ci-actions="1"
                          data-pq="composer-media-info"
                          data-tooltip-id="tooltip"
                          data-tooltip-content={
                            hasInstagram
                              ? t(
                                  'instagram_45_hint',
                                  'For best results on Instagram Grid and Feed, use a 4:5 image.'
                                )
                              : t(
                                  'alt_text_subtitle',
                                  'Describe the image for screen readers and platforms that support alt text.'
                                )
                          }
                          onMouseDown={(e) => e.stopPropagation()}
                          aria-label={t('help', 'Help')}
                          title={t('help', 'Help')}
                          className="absolute start-[6px] top-[6px] z-[20] grid size-[28px] cursor-pointer place-items-center rounded-full bg-[#2563EB] text-white shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M8 7.15v4.1"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                            <circle cx="8" cy="5" r="1.05" fill="currentColor" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          data-ci-actions="1"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            clearMedia(index)();
                          }}
                          aria-label={t('remove', 'Remove')}
                          title={t('remove', 'Remove')}
                          className="absolute end-[6px] top-[6px] z-[20] grid size-[28px] cursor-pointer place-items-center rounded-[8px] bg-black/72 text-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] backdrop-blur-[2px] hover:bg-pqDanger"
                        >
                          <svg
                            viewBox="0 0 12 12"
                            width="10"
                            height="10"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 3l6 6M9 3L3 9"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                        <div
                          data-ci-actions="1"
                          className="pointer-events-none absolute inset-x-0 bottom-0 z-[10] h-[56px] bg-gradient-to-t from-black/55 to-transparent"
                        />
                        <div
                          data-ci-actions="1"
                          className="absolute inset-x-0 bottom-0 z-[20] flex items-center justify-center gap-[6px] px-[8px] pb-[8px]"
                        >
                          <button
                            type="button"
                            data-ci-actions="1"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              openMediaSettings(media);
                            }}
                            aria-label={t(
                              'change_alt_text',
                              'Change alt text'
                            )}
                            title={t('change_alt_text', 'Change alt text')}
                            className="inline-flex h-[32px] cursor-pointer items-center rounded-[8px] bg-black/72 px-[8px] text-[11px] font-[700] tracking-[0.06em] text-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] backdrop-blur-[2px] hover:bg-black/85"
                          >
                            ALT
                          </button>
                          <button
                            type="button"
                            data-ci-actions="1"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              editMedia(index, media);
                            }}
                            aria-label={t('edit', 'Edit')}
                            title={t('edit', 'Edit')}
                            className="grid size-[32px] cursor-pointer place-items-center rounded-[8px] bg-black/72 text-white shadow-[0_1px_2px_rgba(0,0,0,0.35)] backdrop-blur-[2px] hover:bg-black/85"
                          >
                            <svg
                              viewBox="0 0 16 16"
                              width="14"
                              height="14"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M11.4 2.6 13.4 4.6 5.85 12.15 3.5 12.65l.5-2.35L11.4 2.6Z"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        data-ci-actions="1"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          clearMedia(index)();
                        }}
                        aria-label={t('remove', 'Remove')}
                        title={t('remove', 'Remove')}
                        className={clsx(
                          'absolute -end-[6px] -top-[6px] z-[20] grid size-[16px] cursor-pointer place-items-center rounded-full bg-pqPop text-pqMuted shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_0_0_1px_var(--border)] hover:bg-pqDanger hover:text-pqOnBrand',
                          !ghost &&
                            !touch &&
                            'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
                        )}
                      >
                        <svg
                          viewBox="0 0 12 12"
                          width="8"
                          height="8"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 3l6 6M9 3L3 9"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </ReactSortable>
            )}
            {studioThumbs && !!currentMedia?.length && (
              <button
                type="button"
                data-pq="composer-add-media"
                onClick={showModal}
                aria-label={t('insert_media', 'Insert media')}
                className="flex h-[120px] w-[120px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[8px] rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--brand)_55%,var(--border))] bg-pqInner px-[10px] text-center text-pqBrand transition-colors hover:bg-pqHover"
              >
                <InsertMediaIcon />
                <span className="text-[11.5px] font-[600] leading-[1.25]">
                  {t(
                    'drag_drop_or_select',
                    'Drag & drop or select a file'
                  )}
                </span>
              </button>
            )}
          </div>
        )}
        {studioThumbs && !!currentMedia?.length && hasInstagram && (
          <div
            data-pq="composer-media-hint"
            className="flex items-start gap-[8px] px-[12px] pb-[2px] text-[12.5px] leading-[1.4] text-pqMuted"
          >
            <span
              className="mt-[1px] grid size-[16px] shrink-0 place-items-center rounded-full bg-[#2563EB] text-white"
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                <path
                  d="M8 6.9v3.4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="8" cy="5.1" r="0.85" fill="currentColor" />
              </svg>
            </span>
            <span>
              {t(
                'instagram_45_hint',
                'For best results on Instagram Grid and Feed, use a 4:5 image.'
              )}
            </span>
          </div>
        )}
        {showToolbar && (
          <div
            ref={toolbarRef}
            data-pq="composer-toolbar"
            className={clsx(
              ghost
                ? 'flex w-full flex-wrap items-center gap-x-[10px] gap-y-[8px]'
                : 'flex w-full items-center gap-x-[8px] border-t border-pqLine px-[10px] py-[6px] text-pqText'
            )}
          >
            {!mediaNotAvailable && (
              <div
                ref={toolsRef}
                className="flex min-w-0 flex-1 flex-nowrap items-center gap-[6px] overflow-hidden"
              >
                <button
                  type="button"
                  // The media picker opens from here and nowhere else, so the
                  // screenshot tool needs a handle on it. The icons inside it had
                  // never been seen for exactly this reason.
                  data-pq="insert-media"
                  onClick={showModal}
                  // Icon-only needs the name somewhere, or the row turns into
                  // five unlabelled glyphs for a screen reader.
                  aria-label={t('insert_media', 'Insert media')}
                  title={t('insert_media', 'Insert media')}
                  className={clsx(
                    'inline-flex h-[36px] cursor-pointer items-center justify-center gap-[8px] font-[600]',
                    ghost
                      ? 'rounded-[8px] px-[10px] text-[12px] text-pqSoft hover:bg-pqHover hover:text-pqText'
                      : 'rounded-[8px] bg-pqBtnSimple px-[12px] text-[12px] text-pqText transition-colors hover:bg-pqHover'
                  )}
                >
                  <InsertMediaIcon />
                  <span className={clsx(hideLabel && 'hidden')}>
                    {t('insert_media', 'Insert media')}
                  </span>
                </button>
                {showDesign && (
                <button
                  type="button"
                  onClick={designMedia}
                  aria-label={t('design_media', 'Design Media')}
                  title={t('design_media', 'Design Media')}
                  className={clsx(
                    'inline-flex h-[36px] cursor-pointer items-center justify-center gap-[6px] font-[600]',
                    ghost
                      ? 'rounded-[8px] px-[10px] text-[12px] text-pqSoft hover:bg-pqHover hover:text-pqText'
                      : 'rounded-[8px] bg-pqBtnSimple px-[12px] text-[12px] text-pqText transition-colors hover:bg-pqHover'
                  )}
                >
                  <DesignMediaIcon />
                  <span className={clsx(hideLabel && 'hidden')}>
                    {t('design_media', 'Design Media')}
                  </span>
                </button>
                )}

                {!attachmentsOnly && (
                  <>
                    <ThirdPartyMedia
                      ghost={ghost}
                      compact={compact}
                      allData={allData}
                      onChange={changeMedia}
                    />

                    {!!user?.tier?.ai && (
                      <>
                        {showAiImage && (
                          <AiImage
                            ghost={ghost}
                            compact={compact}
                            value={text}
                            onChange={changeMedia}
                          />
                        )}
                        <AiVideo
                          ghost={ghost}
                          compact={compact}
                          value={text}
                          onChange={changeMedia}
                        />
                      </>
                    )}
                  </>
                )}
                {!mediaNotAvailable && (!!toolBar || !!information) && (
                  <div
                    className="hidden h-[22px] w-px shrink-0 self-center bg-pqLine sm:block"
                    aria-hidden="true"
                  />
                )}
                {!!toolBar && toolBar}
                {trailing}
              </div>
            )}
            {!!toolBar && mediaNotAvailable && (
              <div
                ref={toolsRef}
                className="flex min-w-0 flex-1 flex-nowrap items-center gap-[6px] overflow-hidden"
              >
                {toolBar}
                {trailing}
              </div>
            )}
            {information && (
              <div
                data-pq="composer-char-count"
                className="ms-auto flex h-[36px] shrink-0 items-center"
              >
                {information}
              </div>
            )}
          </div>
        )}
      </div>
      {showToolbar && <div className="text-[12px] text-red-400">{error}</div>}
    </>
  );
};
export const MediaComponent: FC<{
  label: string;
  description: string;
  value?: {
    path: string;
    id: string;
  };
  name: string;
  onChange: (event: {
    target: {
      name: string;
      value?: {
        id: string;
        path: string;
      };
    };
  }) => void;
  type?: 'image' | 'video';
  width?: number;
  height?: number;
}> = (props) => {
  const t = useT();
  const { touch } = useViewport();

  const { name, type, label, description, onChange, value, width, height } =
    props;
  const { billingEnabled, plontoKey } = useVariables();
  const setupHint = useFeatureSetupHint();
  // Same rule as Design Media above.
  const showDesign = !billingEnabled || !!plontoKey;
  const [currentMedia, setCurrentMedia] = useState(value);
  useEffect(() => {
    setCurrentMedia(value);
  }, [value]);
  const modals = useModals();
  const mediaDirectory = useMediaDirectory();

  const changeMedia = useCallback(
    (m: { path: string; id: string }[]) => {
      const next = m[0];
      setCurrentMedia(next);
      onChange({
        target: {
          name,
          value: next,
        },
      });
    },
    [name, onChange]
  );
  const showDesignModal = useCallback(() => {
    if (!plontoKey) {
      setupHint(
        t('media_editor', 'Media Editor'),
        'NEXT_PUBLIC_POLOTNO',
        'https://docs.postqueen.ai/configuration/polotno'
      );
      return;
    }
    modals.openModal({
      title: t('media_editor', 'Media Editor'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: 'calc(100% - 80px)',
      height: 'calc(100% - 80px)',
      children: (close) => (
        <Polonto
          width={width}
          height={height}
          setMedia={changeMedia}
          closeModal={close}
        />
      ),
    });
  }, [t, width, height, changeMedia, modals, plontoKey, setupHint]);
  const showModal = useCallback(() => {
    modals.openModal({
      title: t('media_library', 'Media Library'),
      askClose: false,
      closeOnEscape: true,
      size: 'min(1200px, calc(100vw - 64px))',
      maxSize: 'min(1200px, calc(100vw - 64px))',
      ...(touch ? { height: '100%' } : {}),
      children: (close) => (
        <MediaBox
          setMedia={changeMedia}
          closeModal={close}
          type={type}
          attachedMedia={currentMedia ? [currentMedia] : []}
        />
      ),
    });
  }, [t, changeMedia, type, currentMedia, touch]);
  const clearMedia = useCallback(() => {
    setCurrentMedia(undefined);
    onChange({
      target: {
        name,
        value: undefined,
      },
    });
  }, [name, onChange]);
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="text-[14px] text-pqMuted">{label}</div>
      <div className="text-[12px] text-pqSoft">{description}</div>
      {!!currentMedia && (
        <div className="my-[20px] cursor-pointer w-[200px] h-[200px] border-2 border-tableBorder">
          <img
            className="w-full h-full object-cover"
            src={mediaDirectory.set(currentMedia.path)}
            onClick={() => window.open(mediaDirectory.set(currentMedia.path))}
          />
        </div>
      )}
      <div className="flex gap-[5px]">
        <Button onClick={showModal}>{t('select', 'Select')}</Button>
        {showDesign && (
          <Button onClick={showDesignModal} className="!bg-customColor45">
            {t('editor', 'Editor')}
          </Button>
        )}
        <Button secondary={true} onClick={clearMedia}>
          {t('clear', 'Clear')}
        </Button>
      </div>
    </div>
  );
};
