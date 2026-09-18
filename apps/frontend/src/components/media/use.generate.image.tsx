'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export type GeneratedImage = { id: string; path: string };

/**
 * Why an image did not come back; the display maps these to `t()` copy.
 * `cancelled` is the person dismissing the billing dialog: their own choice,
 * not a failure to report.
 */
export type GenerateImageFailure = {
  reason: 'credits' | 'cancelled' | 'failed';
  /** The server's own message when it sent one. */
  message?: string;
};

/**
 * One call to `/media/generate-image-with-prompt`, the way the toolbar's AI
 * Image makes it: the brief in the description/style envelope the server
 * expands into a full render prompt, the orientation beside it. Out of
 * credits comes back as a literal `false` with HTTP 200, and a dismissed
 * billing dialog as customFetch's synthetic `{ cancelled }` body. Shared by
 * the AI Image modal, the composer rail's tool and the Copilot page's card.
 */
export const useGenerateImage = () => {
  const fetch = useFetch();
  return useCallback(
    async (
      prompt: string,
      style?: string,
      orientation?: string
    ): Promise<GeneratedImage | GenerateImageFailure> => {
      const response = await fetch('/media/generate-image-with-prompt', {
        method: 'POST',
        body: JSON.stringify({
          prompt: `
<!-- description -->
${prompt}
<!-- /description -->

<!-- style -->
${style || 'Realistic'}
<!-- /style -->
`,
          ...(orientation ? { orientation } : {}),
        }),
      });
      const image: any = await response.json().catch((): null => null);
      if (response.ok && image?.id && image?.path) {
        return { id: image.id, path: image.path };
      }
      if (image === false) {
        return { reason: 'credits' };
      }
      if (image?.cancelled) {
        return { reason: 'cancelled' };
      }
      return {
        reason: 'failed',
        message: typeof image?.message === 'string' ? image.message : undefined,
      };
    },
    [fetch]
  );
};

export const isGeneratedImage = (
  result: GeneratedImage | GenerateImageFailure
): result is GeneratedImage => 'id' in result;

/** What the person reads when an image did not come back. */
export const useGenerateImageFailureCopy = () => {
  const t = useT();
  return useCallback(
    (failure: GenerateImageFailure) =>
      failure.reason === 'credits'
        ? t('ai_credits_exhausted', 'You are out of AI credits for this month.')
        : failure.reason === 'cancelled'
        ? t('ai_generation_cancelled', 'Image generation was cancelled.')
        : failure.message ||
          t('ai_generation_failed', 'AI generation failed, please try again later.'),
    [t]
  );
};
