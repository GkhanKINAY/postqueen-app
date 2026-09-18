'use client';

import { FC } from 'react';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { sanitizePreviewHtml } from '@gitroom/helpers/utils/sanitize.post.content';
import { textSlicer } from '@gitroom/helpers/utils/count.length';
import { formatChannelHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { SliderComponent } from '@gitroom/frontend/components/third-parties/slider.component';
import { PreviewMediaFrame } from '@gitroom/frontend/components/new-launch/preview-media';
import { ChannelAvatar } from '@gitroom/frontend/components/new-launch/channel.avatar';
import {
  FEED_PREVIEW_FALLBACK_WH,
  FEED_PREVIEW_MAX_WH,
  FEED_PREVIEW_MIN_WH,
} from '@gitroom/frontend/components/new-launch/preview-media-aspect';
import clsx from 'clsx';

const HeartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const CommentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const RepostIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M17 1l4 4-4 4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 11V9a4 4 0 0 1 4-4h14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 23l-4-4 4-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 13v2a4 4 0 0 1-4 4H3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ShareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 6l-4-4-4 4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 2v13"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type PreviewSlide = {
  path: string;
  id: string;
  thumbnail?: string;
};

const ThreadsMedia: FC<{ images?: PreviewSlide[] }> = ({ images }) => {
  const mediaDir = useMediaDirectory();
  if (!images?.length) {
    return null;
  }

  const frames = images.map((image, index) => (
    <PreviewMediaFrame
      key={image.id || `threads-media-${index}`}
      src={mediaDir.set(image.path)}
      poster={image.thumbnail ? mediaDir.set(image.thumbnail) : undefined}
      minWH={FEED_PREVIEW_MIN_WH}
      maxWH={FEED_PREVIEW_MAX_WH}
      fallbackWH={FEED_PREVIEW_FALLBACK_WH}
      className="rounded-[16px]"
    />
  ));

  if (frames.length === 1) {
    return <div className="mt-[12px] overflow-hidden rounded-[16px]">{frames[0]}</div>;
  }

  return (
    <SliderComponent
      className="mt-[12px] overflow-hidden rounded-[16px]"
      list={frames}
    />
  );
};

export const ThreadsPreview: FC<{
  maximumCharacters?: number;
}> = (props) => {
  const { value: topValue, integration } = useIntegration();
  const handle = formatChannelHandle(integration?.display);

  const renderContent = topValue.map((p) => {
    const newContent = stripHtmlValidation(
      'normal',
      (p.content || '').replace(
        /<span.*?data-mention-id="([.\s\S]*?)"[.\s\S]*?>([.\s\S]*?)<\/span>/gi,
        (match, match1, match2) => {
          return `[[[${match2}]]]`;
        }
      ),
      true
    );

    const { start, end } = textSlicer(
      integration?.identifier || '',
      props.maximumCharacters || 10000,
      newContent
    );

    const finalValue =
      newContent
        .slice(start, end)
        .replace(/\[\[\[([.\s\S]*?)]]]/, (match, match1) => {
          return `<span class="font-bold font-[arial]" style="color: #ae8afc">${match1}</span>`;
        }) +
      `<mark class="bg-red-500" data-tooltip-id="tooltip" data-tooltip-content="This text will be cropped">` +
      newContent.slice(end).replace(/\[\[\[([.\s\S]*?)]]]/, (match, match1) => {
        return `<span class="font-bold font-[arial]" style="color: #ae8afc">${match1}</span>`;
      }) +
      `</mark>`;

    return { text: finalValue, images: p.image };
  });

  return (
    <div
      data-pq="threads-preview"
      className="relative isolate w-full min-w-0 overflow-hidden bg-pqInner text-pqText"
    >
      {renderContent.map((item, index) => (
        <div
          key={`threads_${index}`}
          className={clsx(
            'flex gap-[10px] px-[16px]',
            index === 0 ? 'pt-[14px]' : 'pt-0',
            index === renderContent.length - 1 ? 'pb-[14px]' : 'pb-[8px]'
          )}
        >
          <div className="relative flex w-[36px] shrink-0 flex-col items-center">
            <ChannelAvatar
              integration={
                integration || {
                  identifier: 'threads',
                }
              }
              size={36}
              rounded="full"
              badge={false}
            />
            {index !== renderContent.length - 1 && (
              <div className="mt-[6px] w-[2px] flex-1 min-h-[12px] rounded-full bg-pqLine" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-[6px] text-[15px] leading-[20px]">
              <span className="truncate font-[600] text-pqText">
                {integration?.name}
              </span>
              {!!handle && (
                <span className="truncate text-[13px] font-[400] text-pqSoft">
                  {handle}
                </span>
              )}
            </div>
            {!!item.text && (
              <div
                className="mt-[4px] whitespace-pre-wrap break-words text-[15px] leading-[20px] text-pqText"
                dangerouslySetInnerHTML={{
                  __html: sanitizePreviewHtml(item.text),
                }}
              />
            )}
            <ThreadsMedia images={item.images} />
            <div className="mt-[12px] flex items-center gap-[18px] text-pqSoft">
              <HeartIcon />
              <CommentIcon />
              <RepostIcon />
              <ShareIcon />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
