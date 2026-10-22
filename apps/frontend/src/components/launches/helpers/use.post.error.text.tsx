'use client';

import { useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { postErrorText } from '@gitroom/helpers/utils/post.error.message';

// A failed post's error as a user reads it. The publish run stores a few
// reasons as fixed strings, which post.activity and the workflows compare, so
// they stay as they are in the database and become an instruction here.
export const usePostErrorText = () => {
  const t = useT();

  return useCallback(
    (error: any) => {
      const text = postErrorText(error, '');
      switch (text) {
        case 'Refresh channel needed':
          return t(
            'post_error_reconnect_channel',
            'Reconnect this channel in Channels, then schedule the post again.'
          );
        case 'Channel disabled':
          return t(
            'post_error_channel_disabled',
            'This channel is turned off. Turn it on in Channels, then schedule the post again.'
          );
        case 'Channel setup not finished':
          return t(
            'post_error_channel_setup',
            'Finish connecting this channel in Channels, then schedule the post again.'
          );
        case 'Subscription required':
          return t(
            'post_error_subscription_required',
            'Your PostQueen subscription is not active. Renew it in Billing, then schedule the post again.'
          );
        case '':
          return t(
            'post_error_unknown',
            'An error occurred while publishing this post'
          );
        default:
          return text;
      }
    },
    [t]
  );
};
