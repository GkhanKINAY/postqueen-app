'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { ThreadsPreview } from '@gitroom/frontend/components/new-launch/providers/threads/threads.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { ThreadsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/threads.dto';
import { Checkbox } from '@gitroom/react/form/checkbox';
const SettingsComponent = () => {
  const t = useT();
  const { register } = useSettings();

  return (
    <>
      <Checkbox
        icon="ai"
        label={t('label_made_with_ai', 'Made with AI')}
        defaultValue={false}
        {...register('made_with_ai')}
      />

      <ThreadFinisher />
    </>
  );
};

export default withProvider({
  imageOrientation: 'square',
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: ThreadsPreview,
  dto: ThreadsDto,
  maximumCharacters: 500,
});
