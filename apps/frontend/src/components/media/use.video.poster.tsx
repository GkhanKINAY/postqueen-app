'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { captureVideoPoster } from '@gitroom/react/helpers/video.poster';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';

export type PosterMedia = {
  id: string;
  path: string;
  thumbnail?: string | null;
  alt?: string | null;
};

/**
 * Gives a video its poster the way the thumbnail picker saves one by hand:
 * a frame captured in the browser, uploaded without a media row of its own
 * (`preventSave`), then written to the video's row through
 * `/media/information`. Resolves to the poster url, or nothing when the
 * frame could not be read or the row refused it, and the caller keeps
 * going without one. A video that already has a thumbnail is left alone.
 */
export const useSaveVideoPoster = () => {
  const fetch = useFetch();
  const mediaDirectory = useMediaDirectory();
  return useCallback(
    async (media: PosterMedia): Promise<string | undefined> => {
      // Only what a browser decodes: mp4 and webm, the same two the media
      // grid treats as video. A mov is stored as one but cannot be drawn.
      if (media.thumbnail || !/\.(mp4|webm)(\?|#|$)/i.test(media.path)) {
        return media.thumbnail || undefined;
      }
      const blob = await captureVideoPoster(mediaDirectory.set(media.path));
      if (!blob) {
        return undefined;
      }
      try {
        const formData = new FormData();
        formData.append('file', blob, 'poster.jpg');
        formData.append('preventSave', 'true');
        const uploaded = await (
          await fetch('/media/upload-simple', { method: 'POST', body: formData })
        ).json();
        if (typeof uploaded?.path !== 'string') {
          return undefined;
        }
        const saved = await fetch('/media/information', {
          method: 'POST',
          body: JSON.stringify({
            id: media.id,
            alt: media.alt || '',
            thumbnail: uploaded.path,
          }),
        });
        return saved.ok ? uploaded.path : undefined;
      } catch {
        return undefined;
      }
    },
    [fetch, mediaDirectory]
  );
};
