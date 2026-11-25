'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useFallbackUntilLoaded } from '@gitroom/react/helpers/image.with.fallback';
import { useThemeMode } from '@gitroom/frontend/components/layout/mode.component';
import {
  brandMarkBox,
  channelBrandMark,
  channelPlatformIcon,
  channelPlatformLabel,
  isBrandMark,
  isUsableChannelPicture,
  type ChannelBrandMark,
} from '@gitroom/frontend/components/new-launch/channel-picture';

export {
  channelPlatformIcon,
  channelPlatformLabel,
  isBrandMark,
  isUsableChannelPicture,
};

/** The official monochrome version that suits the theme behind it. */
const MonochromeMark: FC<{
  mark: ChannelBrandMark;
  alt: string;
  width: number;
  height: number;
}> = ({ mark, alt, width, height }) => {
  const { mode } = useThemeMode();
  return (
    <img
      src={mode === 'dark' ? mark.whiteSrc : mark.blackSrc}
      alt={alt}
      width={width}
      height={height}
      draggable={false}
      className="block max-w-none"
      style={{ width, height, minWidth: width, minHeight: height }}
    />
  );
};

/**
 * A platform's official mark (see `channelBrandMark`) on a solid plate, in
 * place of its square icon of `size` px. It is never dimmed: an `inactive`
 * channel gets the official monochrome version instead. With a `channel` (its
 * id or handle) it links to the channel, so pass one only where a click does
 * nothing else. Renders nothing for a platform without a brand mark.
 */
export const PlatformMark: FC<{
  identifier: string;
  size: number;
  channel?: string | null;
  inactive?: boolean;
  /** Positions the plate. */
  className?: string;
  /** The plate's solid background. */
  plateClassName?: string;
}> = ({
  identifier,
  size,
  channel,
  inactive,
  className,
  plateClassName = 'bg-pqInner',
}) => {
  const mark = channelBrandMark(identifier);
  if (!mark) {
    return null;
  }

  const { width, height } = brandMarkBox(mark, size);
  const alt = channelPlatformLabel(identifier);
  const image = inactive ? (
    <MonochromeMark mark={mark} alt={alt} width={width} height={height} />
  ) : (
    <img
      src={mark.src}
      alt={alt}
      width={width}
      height={height}
      draggable={false}
      className="block max-w-none"
      style={{ width, height, minWidth: width, minHeight: height }}
    />
  );
  const plate = clsx(
    'inline-flex shrink-0 rounded-[3px] p-[1px]',
    plateClassName,
    className
  );

  return typeof channel === 'string' ? (
    <a
      href={mark.link(channel)}
      target="_blank"
      rel="noopener noreferrer"
      className={plate}
    >
      {image}
    </a>
  ) : (
    <span className={clsx(plate, 'pointer-events-none')}>{image}</span>
  );
};

export const ChannelAvatar: FC<{
  integration: {
    picture?: string | null;
    identifier: string;
    name?: string;
  };
  size: number;
  rounded?: 'full' | 'lg';
  className?: string;
  /** Corner platform badge. Off when the face already is the platform icon. */
  badge?: boolean;
  badgeSize?: number;
  /**
   * How the avatar looks while its channel is not chosen (grayscale, opacity).
   * Set it here rather than on a wrapper: a brand mark can't be dimmed, it
   * shows its monochrome version instead.
   */
  dimClassName?: string;
  /** A brand mark links to this channel (its id or handle), see PlatformMark. */
  channel?: string | null;
}> = ({
  integration,
  size,
  rounded = 'lg',
  className,
  badge,
  badgeSize = 14,
  dimClassName,
  channel,
}) => {
  const iconSrc = channelPlatformIcon(integration.identifier);
  const faceSrc = useFallbackUntilLoaded(
    isUsableChannelPicture(integration.picture)
      ? integration.picture
      : undefined,
    iconSrc
  );
  const showPhoto = faceSrc !== iconSrc;
  const mark = channelBrandMark(integration.identifier);
  // Without a photo the face is the platform icon. A brand mark can't shrink
  // under its minimum height or be cut by the round face: where it does not
  // fit, the face stays empty and the badge carries the mark.
  const faceMark = mark && !showPhoto ? brandMarkBox(mark, size * 0.64) : null;
  const faceMarkFits =
    !!faceMark && Math.hypot(faceMark.width, faceMark.height) <= size;
  const showBadge = badge ?? (showPhoto || (!!mark && !faceMarkFits));
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-[8px]';

  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center',
        className
      )}
      style={{ width: size, height: size }}
    >
      <span
        className={clsx(
          'flex h-full w-full items-center justify-center overflow-hidden bg-pqTableHeader',
          radius,
          !(mark && !showPhoto) && dimClassName
        )}
      >
        {mark && !showPhoto ? (
          faceMarkFits && (
            <PlatformMark
              identifier={integration.identifier}
              size={size * 0.64}
              inactive={!!dimClassName}
              plateClassName=""
            />
          )
        ) : (
          <img
            src={faceSrc}
            alt={integration.name || integration.identifier}
            width={showPhoto ? size : Math.round(size * 0.64)}
            height={showPhoto ? size : Math.round(size * 0.64)}
            referrerPolicy="no-referrer"
            decoding="async"
            className={
              showPhoto
                ? 'h-full w-full object-cover'
                : 'h-[64%] w-[64%] object-contain'
            }
          />
        )}
      </span>
      {showBadge &&
        (mark ? (
          // Bigger than a square badge, so it hangs off a round avatar's
          // corner; a square one keeps it inside, where a wrapper may clip.
          <PlatformMark
            identifier={integration.identifier}
            size={badgeSize}
            channel={channel}
            inactive={!!dimClassName}
            className={clsx(
              'absolute z-10',
              rounded === 'full'
                ? '-bottom-[4px] -end-[8px]'
                : 'bottom-[2px] end-[2px]'
            )}
          />
        ) : (
          <img
            src={iconSrc}
            alt=""
            width={badgeSize}
            height={badgeSize}
            className={clsx(
              'absolute z-10 rounded-[3px] ring-2 ring-pqInner',
              rounded === 'full'
                ? '-bottom-[1px] -end-[1px]'
                : 'bottom-[2px] end-[2px]',
              dimClassName
            )}
          />
        ))}
    </span>
  );
};
