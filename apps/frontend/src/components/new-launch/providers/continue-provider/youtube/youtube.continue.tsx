'use client';

import {
  ContinuePickerItem,
  continuePickerHandle,
  continuePickerInitial,
  joinContinuePickerMeta,
} from '../continue-picker-item';
import { withContinueProvider } from '../with-continue-provider';

interface YoutubeItem {
  id: string;
  name: string;
  username?: string;
  subscriberCount?: string;
  picture?: {
    data: {
      url: string;
    };
  };
}

interface YoutubeSelection {
  id: string;
}

export const YoutubeContinue = withContinueProvider<
  YoutubeItem,
  YoutubeSelection
>({
  endpoint: 'pages',
  swrKey: 'load-youtube-channels',
  titleKey: 'select_channel',
  titleDefault: 'Select YouTube Channel',
  emptyStateMessages: [
    {
      key: 'youtube_no_channels_found',
      text: "We couldn't find any YouTube channels connected to your account.",
    },
    {
      key: 'youtube_ensure_channel_exists',
      text: 'Please ensure you have a YouTube channel created.',
    },
    {
      key: 'youtube_try_again',
      text: 'Please close this dialog, delete the integration and try again.',
    },
  ],
  getItemId: (item) => item.id,
  getSelectionValue: (item) => ({ id: item.id }),
  transformSaveData: (selection) =>
    Array.isArray(selection) ? { pages: selection } : selection,
  isSelected: (item, selection) => selection?.id === item.id,
  renderItem: (item) => (
    <ContinuePickerItem
      pictureUrl={item.picture?.data?.url}
      name={item.name}
      meta={joinContinuePickerMeta(
        continuePickerHandle(item.username),
        item.subscriberCount
          ? `${parseInt(item.subscriberCount, 10).toLocaleString()} subscribers`
          : undefined,
      )}
      // A drawn play button would be an unofficial YouTube mark, which
      // YouTube's branding rules do not allow: the initial, as elsewhere.
      fallback={continuePickerInitial(item.name)}
    />
  ),
});
