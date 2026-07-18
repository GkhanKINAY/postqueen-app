'use client';

import { useVariables } from '@gitroom/react/helpers/variable.context';
import { ChatbaseComponent } from '@gitroom/frontend/components/layout/chatbase.component';
export const Support = () => {
  const { isChatBase } = useVariables();
  if (isChatBase) {
    return <ChatbaseComponent />;
  }
  return null;
};
