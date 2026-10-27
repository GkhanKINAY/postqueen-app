'use client';

import 'reflect-metadata';
import { FC, useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useParams } from 'next/navigation';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import {
  fromUtc,
  newDayjs,
} from '@gitroom/frontend/components/layout/set.timezone';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
export const StandaloneModal: FC = () => {
  const fetch = useFetch();
  const params = useParams<{ platform: string }>();
  // PreviewWrapper loads the user and applies their timezone on the way in;
  // the composer's date is only made once it has.
  const user = useUser();

  const loadDate = useCallback(async () => {
    if (params.platform === 'all') {
      return newDayjs().utc().format('YYYY-MM-DDTHH:mm:ss');
    }
    return (await (await fetch('/posts/find-slot')).json()).date;
  }, []);

  const {
    isLoading,
    data: integrations,
    mutate,
  } = useIntegrationList();
  const { isLoading: isLoading2, data } = useSWR('/posts/find-slot', loadDate, {
    fallbackData: [],
  });
  if (isLoading || isLoading2 || !user?.id) {
    return null;
  }
  return (
    <AddEditModal
      dummy={params.platform === 'all'}
      customClose={() => {
        window.parent.postMessage(
          {
            action: 'closeIframe',
          },
          '*'
        );
      }}
      mutate={() => {}}
      integrations={integrations}
      reopenModal={() => {}}
      allIntegrations={integrations}
      date={fromUtc(data)}
    />
  );
};
