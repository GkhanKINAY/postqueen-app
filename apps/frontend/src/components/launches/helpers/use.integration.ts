'use client';

import { createContext, useContext } from 'react';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
export type IntegrationContextType = {
  date: dayjs.Dayjs;
  integration: Integrations | undefined;
  allIntegrations: Integrations[];
  value: Array<{
    content: string;
    id?: string;
    image?: Array<{
      path: string;
      id: string;
      /** A video's poster, when it has one. */
      thumbnail?: string;
    }>;
  }>;
};
export const IntegrationContext = createContext<IntegrationContextType>({
  integration: undefined,
  value: [],
  date: newDayjs(),
  allIntegrations: [],
});
export const useIntegration = () => useContext(IntegrationContext);
