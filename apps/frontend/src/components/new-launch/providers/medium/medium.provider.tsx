'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { MediumPublications } from '@gitroom/frontend/components/new-launch/providers/medium/medium.publications';
import { MediumTags } from '@gitroom/frontend/components/new-launch/providers/medium/medium.tags';
import { MediumSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/medium.settings.dto';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Canonical } from '@gitroom/react/form/canonical';

const MediumSettings: FC = () => {
  const form = useSettings();
  const { date } = useIntegration();
  return (
    <>
      <Input label="Title" {...form.register('title')} />
      {/* No Subtitle field: Medium's publishing API takes title, contentFormat,
          content, tags, canonicalUrl and publishStatus, and nothing else.
          Medium derives the subtitle from the content itself. The control used
          to be here and was required, so every post forced the user to write a
          subtitle that was then dropped before the request was built. */}
      <Canonical
        date={date}
        label="Canonical Link"
        {...form.register('canonical')}
      />
      <div>
        <MediumPublications {...form.register('publication')} />
      </div>
      <div>
        <MediumTags label="Topics" {...form.register('tags')} />
      </div>
    </>
  );
};
export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: MediumSettings,
  CustomPreviewComponent: undefined, //MediumPreview,
  dto: MediumSettingsDto,
  maximumCharacters: 100000,
});
