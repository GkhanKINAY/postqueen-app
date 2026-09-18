'use client';

import { FC } from 'react';
import { GeneratedMediaCard } from '@gitroom/frontend/components/media/generated.media.card';
import {
  useVideoJobResult,
  VideoJobMedia,
} from '@gitroom/frontend/components/media/use.generate.video';

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
