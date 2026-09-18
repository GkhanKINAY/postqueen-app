'use client';

import { FC } from 'react';
export const VideoFrame: FC<{
  url: string;
  autoplay?: boolean;
  /** The saved thumbnail; the tile stays grey until playback without one. */
  poster?: string | null;
}> = (props) => {
  const { url, poster } = props;
  return (
    <video
      className="w-full h-full object-cover rounded-[4px]"
      src={url + '#t=0.1'}
      poster={poster || undefined}
      preload="metadata"
      muted
      playsInline
      autoPlay={!!props?.autoplay}
    />
  );
};
