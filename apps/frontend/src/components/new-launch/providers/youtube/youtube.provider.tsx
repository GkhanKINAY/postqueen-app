'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { MediumTags } from '@gitroom/frontend/components/new-launch/providers/medium/medium.tags';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
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
  const { register } = useSettings();
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
      <MediumTags label="Tags" {...register('tags')} />
      <MediaComponent
        type="image"
        width={1280}
        height={720}
        label="Thumbnail"
        description="Thumbnail picture (optional)"
        {...register('thumbnail')}
      />
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: YoutubeSettings,
  CustomPreviewComponent: YoutubePreview,
  dto: YoutubeSettingsDto,
  maximumCharacters: 5000,
});
