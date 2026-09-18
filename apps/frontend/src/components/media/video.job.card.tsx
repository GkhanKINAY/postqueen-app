'use client';

import { FC, useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { GeneratedMediaCard } from '@gitroom/frontend/components/media/generated.media.card';
import { useVideoJob } from '@gitroom/frontend/components/media/use.generate.video';
import { useSaveVideoPoster } from '@gitroom/frontend/components/media/use.video.poster';

export type VideoJobMedia = { id: string; path: string; thumbnail?: string };

/**
 * One video job followed to its end: polls while it runs, and when the video
 * lands gives it a poster before handing it over, so whatever attaches it
 * carries a thumbnail. `onReady` fires once per job, whatever the caller
 * re-renders. The toolbar's Generate video and the chat cards share it.
 */
export const useVideoJobResult = (
  jobId: string | undefined,
  callbacks?: {
    onReady?: (media: VideoJobMedia) => void;
    /** Once per job, with the line the person reads. */
    onFailed?: (failure: string) => void;
  }
) => {
  const t = useT();
  const { data, error: lookupError } = useVideoJob(jobId);
  const savePoster = useSaveVideoPoster();
  const [media, setMedia] = useState<VideoJobMedia | null>(null);
  const settledFor = useRef<string | null>(null);
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });
  const doneId = data?.status === 'completed' ? data.id : undefined;
  const donePath = data?.status === 'completed' ? data.path : undefined;
  const failure =
    data?.status === 'failed'
      ? data.error || t('ai_generation_failed', 'AI generation failed, please try again later.')
      : data?.status === 'expired'
      ? t(
          'video_result_expired',
          'The result is no longer available here; a finished video is in the Media library.'
        )
      : lookupError
      ? String(lookupError.message || lookupError)
      : undefined;

  useEffect(() => {
    if (!jobId || settledFor.current === jobId) {
      return;
    }
    if (failure) {
      settledFor.current = jobId;
      callbacksRef.current?.onFailed?.(failure);
      return;
    }
    if (!doneId || !donePath) {
      return;
    }
    settledFor.current = jobId;
    const base = { id: doneId, path: donePath };
    savePoster(base).then((thumbnail) => {
      const done = thumbnail ? { ...base, thumbnail } : base;
      setMedia(done);
      callbacksRef.current?.onReady?.(done);
    });
  }, [jobId, doneId, donePath, failure, savePoster]);

  return { media, failure, pending: !!jobId && !media && !failure };
};

/**
 * One video job as a card, on both Copilot surfaces: the brief, a waiting
 * line that counts the minutes, then the video at its real shape with the
 * surface's own "use" button. The card polls the job itself, so the model
 * is told nothing until the person acts, and a card drawn again for a
 * finished job (a reopened thread) reads the same answer from the same key.
 */
export const VideoJobCard: FC<{
  jobId?: string;
  prompt: string;
  /** The generator's title, shown beside the orientation. */
  provider?: string;
  orientation?: string;
  /** A failure from before the job started; the card shows it and nothing polls. */
  error?: string;
  used?: 'attached' | 'added';
  useLabel: string;
  onUse?: (media: VideoJobMedia) => void;
  onUndo?: () => void;
  /** Called once when the video is ready (with its poster, when one could be made). */
  onReady?: (media: VideoJobMedia) => void;
}> = ({
  jobId,
  prompt,
  provider,
  orientation,
  error,
  used,
  useLabel,
  onUse,
  onUndo,
  onReady,
}) => {
  const { media, failure } = useVideoJobResult(error ? undefined : jobId, { onReady });
  const shown = error || failure;

  return (
    <GeneratedMediaCard
      kind="video"
      prompt={prompt}
      style={provider}
      orientation={orientation}
      status={shown ? 'failed' : media ? 'ready' : 'generating'}
      media={media || undefined}
      error={shown}
      used={used}
      useLabel={useLabel}
      onUse={media && onUse ? () => onUse(media) : undefined}
      onUndo={onUndo}
    />
  );
};
