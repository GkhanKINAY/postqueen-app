'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import ShortlinkPreferenceComponent from '@gitroom/frontend/components/settings/shortlink-preference.component';

const WorkspaceNameComponent = dynamic(
  () => import('@gitroom/frontend/components/settings/workspace-name.component'),
  {
    ssr: false,
  }
);

const MetricComponent = dynamic(
  () => import('@gitroom/frontend/components/settings/metric.component'),
  {
    ssr: false,
  }
);

const DateFormatComponent = dynamic(
  () => import('@gitroom/frontend/components/settings/date.format.component'),
  {
    ssr: false,
  }
);

/** Workspace defaults only — email prefs live under Settings → Notifications. */
export const GlobalSettings = () => {
  // No shortener configured: every choice there would do the same nothing.
  const { shortLinkEnabled } = useVariables();
  return (
    <div className="mt-[18px] flex flex-col gap-[10px]">
      <WorkspaceNameComponent />
      <MetricComponent />
      <DateFormatComponent />
      {shortLinkEnabled && <ShortlinkPreferenceComponent />}
    </div>
  );
};
