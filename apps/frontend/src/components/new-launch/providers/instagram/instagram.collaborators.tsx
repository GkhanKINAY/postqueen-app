'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FC, useEffect } from 'react';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { InstagramDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/instagram.dto';
import { InstagramCollaboratorsTags } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.tags';
import { InstagramAudioSelector } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.audio';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { InstagramPreview } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.preview';

const postType = [
  { value: 'post', label: 'Post', icon: 'post' as const },
  { value: 'reel', label: 'Reel', icon: 'story' as const },
  { value: 'story', label: 'Story', icon: 'story' as const },
];

const graduationStrategies = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'SS_PERFORMANCE', label: 'Auto (based on performance)' },
];

const InstagramCollaborators: FC<{
  values?: any;
}> = () => {
  const t = useT();
  const { watch, register, setValue } = useSettings();
  const { integration } = useIntegration();
  const postCurrentType = watch('post_type');
  const isTrialReel = watch('is_trial_reel');
  // The Audio API is only available with Facebook Login, not Instagram Login
  const supportsAudio = integration?.identifier === 'instagram';
  const isReel = postCurrentType === 'reel';

  useEffect(() => {
    if (!isReel && isTrialReel) {
      setValue('is_trial_reel', false);
    }
  }, [isReel, isTrialReel, setValue]);

  return (
    <>
      <FormChoice
        name="post_type"
        label="Post Type"
        layout="segment"
        defaultValue="post"
        options={postType}
      />

      {postCurrentType !== 'story' && (
        <InstagramCollaboratorsTags
          label="Collaborators (max 3) - accounts can't be private"
          {...register('collaborators', {
            value: [],
          })}
        />
      )}

      {isReel && (
        <InstagramAudioSelector
          label={t(
            'instagram_audio_label',
            'Audio (Reels only - single video)'
          )}
          disabled={!supportsAudio}
          {...register('audio')}
        />
      )}

      {isReel && (
        <div className="flex flex-col gap-[12px]">
          <Checkbox
            {...register('is_trial_reel', {
              value: false,
            })}
            defaultValue={false}
            icon="story"
            label={t('trial_reel', 'Trial Reel (share only to non-followers first)')}
          />

          {isTrialReel && (
            <FormChoice
              name="graduation_strategy"
              icon="status"
              label="Graduation Strategy"
              defaultValue="MANUAL"
              options={graduationStrategies}
            />
          )}
        </div>
      )}
    </>
  );
};
export default withProvider<InstagramDto>({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: InstagramCollaborators,
  CustomPreviewComponent: InstagramPreview,
  dto: InstagramDto,
  maximumCharacters: 2200,
  comments: 'no-media'
});
