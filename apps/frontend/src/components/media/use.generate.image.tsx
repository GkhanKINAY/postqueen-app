'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
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
 * expands into a full render prompt, the orientation and quality beside it.
 * A balance too short for the image comes back as a 402, and a dismissed
 * billing dialog as customFetch's synthetic `{ cancelled }` body. The balance
 * is read again afterwards, whatever happened: a charge taken, or handed
 * back. Shared by the AI Image modal, the composer rail's tool and the
 * Copilot page's card.
 */
export const useGenerateImage = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  return useCallback(
    async (
      prompt: string,
      style?: string,
      orientation?: string,
      quality?: string
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
          ...(quality ? { quality } : {}),
        }),
      });
      mutate('credits-balance');
      const image: any = await response.json().catch((): null => null);
      if (response.ok && image?.id && image?.path) {
        return { id: image.id, path: image.path };
      }
      if (image?.cancelled) {
        return { reason: 'cancelled' };
      }
      if (response.status === 402) {
        return { reason: 'credits' };
      }
      return {
        reason: 'failed',
        message: typeof image?.message === 'string' ? image.message : undefined,
      };
    },
    [fetch, mutate]
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
        ? t(
            'not_enough_credits',
            "You don't have enough credits for this. You can get more in Billing."
          )
        : failure.reason === 'cancelled'
        ? t('ai_generation_cancelled', 'Image generation was cancelled.')
        : failure.message ||
          t('ai_generation_failed', 'AI generation failed, please try again later.'),
    [t]
  );
};
