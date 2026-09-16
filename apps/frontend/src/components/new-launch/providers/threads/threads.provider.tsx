'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { ThreadsPreview } from '@gitroom/frontend/components/new-launch/providers/threads/threads.preview';
const SettingsComponent = () => {
  return <ThreadFinisher />;
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: ThreadsPreview,
  dto: undefined,
  maximumCharacters: 500,
});
