import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { FC, useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { Textarea } from '@gitroom/react/form/textarea';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FormChoice } from '@gitroom/react/form/form.choice';

// What each model offers; `seedance.ts` refuses the rest.
const RESOLUTIONS: Record<string, string[]> = {
  mini: ['480p', '720p'],
  fast: ['480p', '720p'],
  standard: ['480p', '720p', '1080p'],
};
const SECONDS = [5, 8, 10, 12, 15];

export interface Voice {
  id: string;
  name: string;
  preview_url: string;
}

const SeedanceSettings: FC = () => {
  const { register, watch, setValue, formState, control } = useFormContext();
  const { value } = useVideo();
  const t = useT();
  const model = useWatch({ control, name: 'model' }) || 'fast';
  const resolution = useWatch({ control, name: 'resolution' }) || '720p';

  // A resolution the new model does not offer falls back to 720p, which
  // every model has.
  useEffect(() => {
    if (!RESOLUTIONS[model]?.includes(resolution)) {
      setValue('resolution', '720p', { shouldValidate: true });
    }
  }, [model, resolution, setValue]);

  // `images` is what the DTO validates and what `setValue` below writes
  // (`videos/veo3/veo3.ts` — `Veo3Params.images`). This used to register,
  // watch and read errors off `media` instead, so `value` never reflected the
  // form: pick five images and the strip showed five while the request carried
  // the three the filter below kept, and a dropped .mp4 stayed on screen after
  // being discarded.
  register('images', {
    value: [],
  });

  const mediaValue = watch('images');

  return (
    <div>
      <Textarea
        label={t('prompt', 'Prompt')}
        name="prompt"
        {...register('prompt', {
          required: true,
          minLength: 5,
          value,
        })}
        error={formState?.errors?.prompt?.message}
      />
      <div className="mb-[6px]">{t('images_max_3', 'Images (max 3)')}</div>
      <MultiMediaComponent
        allData={[]}
        dummy={true}
        // This field lives inside the video-generation form, which the
        // composer's own "Generate video" opened. Offering that button (and an
        // Integrations modal on top of this modal) again here is a loop.
        attachmentsOnly={true}
        text="Images"
        description="Images"
        name="images"
        label="Media"
        value={mediaValue}
        onChange={(val) =>
          setValue(
            'images',
            val.target.value
              .filter((f) => !hasExtension(f.path, 'mp4'))
              .slice(0, 3)
          )
        }
        error={formState?.errors?.images?.message}
      />
      <div className="mt-[16px] flex flex-col gap-[14px]">
        <FormChoice
          name="model"
          label="Model"
          translationKey="video_model"
          layout="segment"
          defaultValue="fast"
          options={[
            { label: t('seedance_model_fast', 'Fast'), value: 'fast' },
            {
              label: t('seedance_model_standard', 'Standard'),
              value: 'standard',
            },
            { label: t('seedance_model_mini', 'Mini'), value: 'mini' },
          ]}
          hint={t(
            'seedance_model_hint',
            'Mini costs the least. Standard is the sharpest and the only one in 1080p.'
          )}
        />
        <FormChoice
          name="resolution"
          label="Resolution"
          translationKey="video_resolution"
          layout="segment"
          defaultValue="720p"
          options={(RESOLUTIONS[model] || RESOLUTIONS.fast).map((p) => ({
            label: p,
            value: p,
          }))}
        />
        <FormChoice
          name="duration"
          label="Length"
          translationKey="video_length"
          layout="pills"
          defaultValue="8"
          options={SECONDS.map((p) => ({
            label: t('n_seconds', '{{count}} s', { count: p }),
            value: String(p),
          }))}
        />
      </div>
    </div>
  );
};

const SeedanceComponent = () => {
  return <SeedanceSettings />;
};

videoWrapper('seedance', SeedanceComponent, {
  priceFields: ['model', 'resolution', 'duration'],
});
