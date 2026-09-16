'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { LinkedinDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/linkedin.dto';
import { LinkedinPreview } from '@gitroom/frontend/components/new-launch/providers/linkedin/linkedin.preview';

const LinkedInSettings = () => {
  const t = useT();
  const { watch, register } = useSettings();
  const carouselRaw = watch('post_as_images_carousel');
  const isCarousel = carouselRaw === true || carouselRaw === 'true';

  return (
    <>
      <FormChoice
        name="post_as_images_carousel"
        label={t('post_as_images_carousel', 'Post as images carousel')}
        layout="segment"
        defaultValue={false}
        options={[
          { value: false, label: t('label_post_type_post', 'Post') },
          { value: true, label: 'Carousel' },
        ]}
      />
      {isCarousel && (
        <Input
          label={t('carousel_name', 'Carousel slide name')}
          placeholder="slides"
          {...register('carousel_name')}
        />
      )}
    </>
  );
};
export default withProvider<LinkedinDto>({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: LinkedInSettings,
  CustomPreviewComponent: LinkedinPreview,
  dto: LinkedinDto,
  maximumCharacters: 3000,
});
