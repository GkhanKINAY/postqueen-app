'use client';

import { FC } from 'react';
import { useWatch } from 'react-hook-form';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { YoutubeTags } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.tags';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { YoutubePreview } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.preview';
const type = [
  {
    label: 'Public',
    value: 'public',
    icon: 'globe' as const,
  },
  {
    label: 'Private',
    value: 'private',
    icon: 'lock' as const,
  },
  {
    label: 'Unlisted',
    value: 'unlisted',
    icon: 'visibility' as const,
  },
];

const madeForKids = [
  {
    label: 'No',
    value: 'no',
  },
  {
    label: 'Yes',
    value: 'yes',
  },
];
const YoutubeSettings: FC = () => {
  const t = useT();
  const { register, control, setValue } = useSettings();
  // The thumbnail is set from the media settings now. An older post may still
  // carry one here, and it wins over the media thumbnail
  const thumbnail = useWatch({ control, name: 'thumbnail' });
  return (
    <div className="flex flex-col gap-[16px]">
      <Input
        label="Title"
        placeholder="Video title"
        {...register('title')}
        maxLength={100}
      />
      <FormChoice
        name="type"
        icon="visibility"
        label="Type"
        layout="segment"
        defaultValue="public"
        options={type}
      />
      <FormChoice
        name="selfDeclaredMadeForKids"
        icon="kids"
        label="Made for kids"
        layout="segment"
        defaultValue="no"
        options={madeForKids}
      />
      <YoutubeTags label="Tags" {...register('tags')} />
      {!!thumbnail?.path && (
        <div className="flex items-center gap-[10px] text-[12.5px] leading-[1.5] text-pqMuted">
          <div className="flex-1">
            {t(
              'youtube_thumbnail_overrides_media',
              'This post has a YouTube-specific thumbnail, which overrides the thumbnail set in the media settings.'
            )}
          </div>
          <button
            type="button"
            onClick={() =>
              setValue('thumbnail', undefined, { shouldDirty: true })
            }
            className="shrink-0 cursor-pointer font-[600] text-pqDanger hover:underline"
          >
            {t('remove', 'Remove')}
          </button>
        </div>
      )}
    </div>
  );
};
export default withProvider({
  imageOrientation: 'landscape',
  postComment: PostComment.COMMENT,
  // YouTube comments are text only
  comments: 'no-media',
  minimumCharacters: [],
  SettingsComponent: YoutubeSettings,
  CustomPreviewComponent: YoutubePreview,
  dto: YoutubeSettingsDto,
  maximumCharacters: 5000,
});
