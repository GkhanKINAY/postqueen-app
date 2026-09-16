'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { FC } from 'react';
import { MeweDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/mewe.dto';
import { MeweGroupSelect } from '@gitroom/frontend/components/new-launch/providers/mewe/mewe.group.select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { useWatch } from 'react-hook-form';

const MeweComponent: FC = () => {
  const form = useSettings();
  const postType = useWatch({ control: form.control, name: 'postType' });

  return (
    <div className="flex flex-col gap-[16px]">
      <FormChoice
        name="postType"
        icon="group"
        label="Post To"
        layout="segment"
        defaultValue="timeline"
        options={[
          { value: 'timeline', label: 'My Timeline', icon: 'post' },
          { value: 'group', label: 'Group', icon: 'group' },
        ]}
      />
      {postType === 'group' && (
        <MeweGroupSelect {...form.register('group')} />
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: MeweComponent,
  CustomPreviewComponent: undefined,
  dto: MeweDto,
  maximumCharacters: 63206,
});
