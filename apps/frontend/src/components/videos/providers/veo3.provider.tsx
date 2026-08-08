import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { Textarea } from '@gitroom/react/form/textarea';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';

export interface Voice {
  id: string;
  name: string;
  preview_url: string;
}

const VEO3Settings: FC = () => {
  const { register, watch, setValue, formState } = useFormContext();
  const { value } = useVideo();

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
        label="Prompt"
        name="prompt"
        {...register('prompt', {
          required: true,
          minLength: 5,
          value,
        })}
        error={formState?.errors?.prompt?.message}
      />
      <div className="mb-[6px]">Images (max 3)</div>
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
    </div>
  );
};

const VeoComponent = () => {
  return <VEO3Settings />;
};

videoWrapper('veo3', VeoComponent);
