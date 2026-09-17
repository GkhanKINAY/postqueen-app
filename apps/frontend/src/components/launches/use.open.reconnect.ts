'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { channelFocusPath } from '@gitroom/frontend/components/launches/oauth-return';

/** Off the Channels page, a reconnect-needed row goes to Channels — it does
 *  not start OAuth from Analytics / Copilot / Automations. */
export const useOpenReconnectInChannels = () => {
  const router = useRouter();
  const toaster = useToaster();
  const t = useT();
  return useCallback(
    (id: string) => {
      toaster.show(
        t(
          'please_reconnect_from_channels',
          'Please reconnect this channel from Channels'
        ),
        'warning'
      );
      router.push(channelFocusPath({ focus: id }));
    },
    [router, t, toaster]
  );
};
