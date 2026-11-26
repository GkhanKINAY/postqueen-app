'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useFallbackUntilLoaded } from '@gitroom/react/helpers/image.with.fallback';
import { useThemeMode } from '@gitroom/frontend/components/layout/mode.component';
import { continuePickerInitial } from '@gitroom/frontend/components/new-launch/providers/continue-provider/continue-picker-meta';
import {
  brandMarkBox,
  brandMarkPlacement,
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

type MarkImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

const MarkImage: FC<MarkImageProps> = ({ src, alt, width, height }) => (
  <img
    src={src}
    alt={alt}
    width={width}
    height={height}
    draggable={false}
    className="block max-w-none"
    style={{ width, height, minWidth: width, minHeight: height }}
  />
);

/** The official monochrome version that suits the theme behind it. */
const MonochromeMark: FC<
  Omit<MarkImageProps, 'src'> & { mark: ChannelBrandMark }
> = ({ mark, ...image }) => {
  const { mode } = useThemeMode();
  return (
    <MarkImage
      src={mode === 'dark' ? mark.whiteSrc : mark.blackSrc}
      {...image}
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
    <MarkImage src={mark.src} alt={alt} width={width} height={height} />
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
  // A brand mark's own rules decide its face and badge (see
  // brandMarkPlacement): next to a small avatar it sits beside it.
  const placement = mark
    ? brandMarkPlacement(mark, size, badgeSize, showPhoto, badge)
    : null;
  const wantsBadge = placement
    ? placement.badge !== 'none'
    : (badge ?? showPhoto);
  const markBeside = placement?.badge === 'beside';
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-[8px]';

  const face =
    placement && placement.face !== 'photo' ? (
      placement.face === 'mark' ? (
        <PlatformMark
          identifier={integration.identifier}
          size={size * 0.64}
          channel={channel}
          inactive={!!dimClassName}
          plateClassName=""
        />
      ) : (
        <span
          aria-hidden="true"
          className="select-none font-[600] leading-none text-pqMuted"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {continuePickerInitial(
            integration.name || channelPlatformLabel(integration.identifier)
          )}
        </span>
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
    );

  const avatar = (
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
          placement?.face !== 'mark' && dimClassName
        )}
      >
        {face}
      </span>
      {wantsBadge &&
        !markBeside &&
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

  if (!markBeside) {
    return avatar;
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-[4px]">
      {avatar}
      <PlatformMark
        identifier={integration.identifier}
        size={badgeSize}
        channel={channel}
        inactive={!!dimClassName}
        plateClassName=""
      />
    </span>
  );
};

/**
 * The platform icon and channel photo a post card leads with, for a platform
 * with a brand mark (see channelBrandMark): the mark, never under its minimum
 * height, and the channel's photo, or its initial where the other platforms
 * fall back to their icon. The mark is centred on a row as high as the icon
 * it stands in for and reaches past it, so a card keeps its height (the week
 * view packs its hours by it). The mark being wider than the icon, a narrow
 * card hides the photo so the time next to them stays whole; the mark itself
 * always shows. `avatarClassName` takes the card's container query.
 */
export const BrandMarkLead: FC<{
  integration: {
    picture?: string | null;
    identifier: string;
    name?: string;
  };
  size: number;
  rounded?: 'full' | 'lg';
  avatarClassName?: string;
}> = ({
  integration,
  size,
  rounded = 'full',
  avatarClassName,
}) => (
  <>
    <span
      className="flex shrink-0 items-center"
      style={{ height: size }}
    >
      <PlatformMark
        identifier={integration.identifier}
        size={size}
        plateClassName=""
      />
    </span>
    <ChannelAvatar
      integration={integration}
      size={size}
      rounded={rounded}
      badge={false}
      className={avatarClassName}
    />
  </>
);
