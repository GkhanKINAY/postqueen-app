'use client';

import useSWR from 'swr';
import {
  aiAvailable,
  ContextWrapper,
} from '@gitroom/frontend/components/layout/user.context';
import { ReactNode, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { CopilotKit } from '@copilotkit/react-core';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { applyUserTimezone } from '@gitroom/frontend/components/layout/set.timezone';
export const PreviewWrapper = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();
  const { backendUrl, aiEnabled, billingEnabled } = useVariables();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user } = useSWR('/user/self', load, {
    // The extension's composer runs here, in an iframe whose storage is
    // partitioned, so the zone the app stored is not there: it comes from the
    // user, before the composer renders (it waits for the user).
    onSuccess: (data) => {
      if (data?.id) {
        applyUserTimezone(data.timezoneName);
      }
    },
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });
  const chrome = (
    <MantineWrapper>
      <Toaster />
      <ToolTip />
      {children}
    </MantineWrapper>
  );
  // `user` arrives from SWR, so this is false until it lands and the provider
  // mounts a beat later. That is the right side to be wrong on: mounting
  // against a tier we have not read yet and unmounting once we have is a
  // remount, and every consumer reads the same answer through useAiAvailable,
  // so nothing below is left asking a provider that is not there.
  const aiOk = aiAvailable(user, aiEnabled, billingEnabled);

  return (
    <ContextWrapper user={user}>
      {aiOk ? (
        <CopilotKit
          credentials="include"
          runtimeUrl={backendUrl + '/copilot/chat'}
          useSingleEndpoint={true}
          showDevConsole={false}
          enableInspector={false}
        >
          {chrome}
        </CopilotKit>
      ) : (
        chrome
      )}
    </ContextWrapper>
  );
};
