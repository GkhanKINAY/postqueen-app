'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TwitchDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/twitch.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { FormChoice } from '@gitroom/react/form/form.choice';
import { useWatch } from 'react-hook-form';

const messageTypes = [
  {
    label: 'Chat Message',
    value: 'message',
  },
  {
    label: 'Announcement',
    value: 'announcement',
  },
];

const announcementColors = [
  {
    label: 'Primary (Default)',
    value: 'primary',
  },
  {
    label: 'Blue',
    value: 'blue',
  },
  {
    label: 'Green',
    value: 'green',
  },
  {
    label: 'Orange',
    value: 'orange',
  },
  {
    label: 'Purple',
    value: 'purple',
  },
];

const TwitchSettings: FC = () => {
  const { control } = useSettings();
  const messageType = useWatch({
    control,
    name: 'messageType',
  });

  return (
    <div className="flex flex-col gap-[16px]">
      <FormChoice
        name="messageType"
        icon="chat"
        label="Message Type"
        layout="segment"
        defaultValue="message"
        options={messageTypes}
      />
      {messageType === 'announcement' && (
        <FormChoice
          name="announcementColor"
          label="Announcement Color"
          defaultValue="primary"
          options={announcementColors}
        />
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  comments: 'no-media',
  minimumCharacters: [],
  SettingsComponent: TwitchSettings,
  CustomPreviewComponent: undefined,
  dto: TwitchDto,
  maximumCharacters: 500,
});
