'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export type VideoJobStart = { jobId: string };

/**
 * Why a video job did not start. `cancelled` is the person dismissing the
 * billing dialog customFetch opens on a 402: their own choice, not a failure.
 * `unavailable` is a 503: no workflow runner to hand the job to.
 */
export type VideoJobStartFailure = {
  reason: 'cancelled' | 'unavailable' | 'failed';
  message?: string;
};

export type VideoJobStatus = {
  /** `expired` is a 404: the runner no longer has the job; the video, if
   *  it finished, is in the media library. */
  status: 'pending' | 'completed' | 'failed' | 'expired';
  id?: string;
  path?: string;
  error?: string;
};

/**
 * Starts a video job on `/media/generate-video/start`, the async path the
 * MCP tools already used: the request returns at once with a job id and
 * `useVideoJob` polls it. The sync `/media/generate-video` held one request
 * open for the minutes a provider takes, which proxies cut and a reload lost.
 */
export const useStartVideo = () => {
  const fetch = useFetch();
  return useCallback(
    async (
      type: string,
      output: 'vertical' | 'horizontal',
      customParams: Record<string, unknown>
    ): Promise<VideoJobStart | VideoJobStartFailure> => {
      const response = await fetch('/media/generate-video/start', {
        method: 'POST',
        body: JSON.stringify({ type, output, customParams }),
      });
      const body: any = await response.json().catch((): null => null);
      if (response.ok && typeof body?.jobId === 'string') {
        return { jobId: body.jobId };
      }
      if (body?.cancelled) {
        return { reason: 'cancelled' };
      }
      if (response.status === 503) {
        return { reason: 'unavailable' };
      }
      return {
        reason: 'failed',
        message: typeof body?.message === 'string' ? body.message : undefined,
      };
    },
    [fetch]
  );
};

export const isVideoJobStart = (
  result: VideoJobStart | VideoJobStartFailure
): result is VideoJobStart => 'jobId' in result;

/** What the person reads when a video job did not start. */
export const useVideoStartFailureCopy = () => {
  const t = useT();
  return useCallback(
    (failure: VideoJobStartFailure) =>
      failure.reason === 'unavailable'
        ? t('video_generation_unavailable', 'Video generation is not available right now.')
        : failure.reason === 'cancelled'
        ? t('video_generation_cancelled', 'Video generation was cancelled.')
        : failure.message ||
          t('ai_generation_failed', 'AI generation failed, please try again later.'),
    [t]
  );
};

/**
 * The state of one video job, polled every few seconds while it is pending
 * and left alone once it is done. The job id is the key, so a card that is
 * drawn again for the same job (a reopened thread) reads the same answer.
 */
export const useVideoJob = (jobId?: string) => {
  const fetch = useFetch();
  const load = useCallback(async (): Promise<VideoJobStatus> => {
    const response = await fetch(`/media/generate-video/status/${jobId}`, {
      method: 'GET',
    });
    if (response.status === 404) {
      return { status: 'expired' };
    }
    const body: any = await response.json().catch((): null => null);
    if (!response.ok || !body?.status) {
      throw new Error(
        typeof body?.message === 'string' ? body.message : 'Video job lookup failed'
      );
    }
    return body as VideoJobStatus;
  }, [fetch, jobId]);
  return useSWR<VideoJobStatus>(jobId ? `video-job-${jobId}` : null, load, {
    refreshInterval: (latest) =>
      !latest || latest.status === 'pending' ? 5000 : 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // A finished job never changes; a card drawn again reads it, not refetches.
    revalidateIfStale: false,
    dedupingInterval: 4000,
  });
};
