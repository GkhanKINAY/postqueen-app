'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useFallbackUntilLoaded } from '@gitroom/react/helpers/image.with.fallback';
import {
  channelPlatformIcon,
  channelPlatformLabel,
  isUsableChannelPicture,
} from '@gitroom/frontend/components/new-launch/channel-picture';

export { channelPlatformIcon, channelPlatformLabel, isUsableChannelPicture };

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
}> = ({
  integration,
  size,
  rounded = 'lg',
  className,
  badge,
  badgeSize = 14,
}) => {
  const iconSrc = channelPlatformIcon(integration.identifier);
  const faceSrc = useFallbackUntilLoaded(
    isUsableChannelPicture(integration.picture)
      ? integration.picture
      : undefined,
    iconSrc
  );
  const showPhoto = faceSrc !== iconSrc;
  const showBadge = badge ?? showPhoto;
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
          radius
        )}
      >
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
      </span>
      {showBadge && (
        <img
          src={iconSrc}
          alt=""
          width={badgeSize}
          height={badgeSize}
          className={clsx(
            'absolute z-10 ring-2 ring-pqInner',
            rounded === 'full'
              ? '-bottom-[1px] -end-[1px]'
              : 'bottom-[2px] end-[2px]',
            integration.identifier === 'youtube'
              ? 'min-w-[14px]'
              : 'rounded-[3px]'
          )}
        />
      )}
    </span>
  );
};
