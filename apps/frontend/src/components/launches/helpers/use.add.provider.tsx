'use client';

import dynamic from 'next/dynamic';
import { useCallback } from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';

/**
 * The catalog component is ~1300 lines and drags class-validator, yup and the
 * web3 list with it. Create Post now lives in the chrome, so this hook is
 * reachable from every route — load the component only once a dialog is
 * actually asked for.
 */
const AddProviderComponent = dynamic(
  () =>
    import(
      '@gitroom/frontend/components/launches/add.provider.component'
    ).then((mod) => mod.AddProviderComponent),
  { ssr: false }
);

export const useAddProvider = (update?: () => void, invite?: boolean) => {
  const modal = useModals();
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();

  return useCallback(async () => {
    // `AddProviderComponent` takes `social` / `article` as required arrays and
    // calls `social.filter(...)` during render, so a bad body here is not a
    // degraded dialog — it is a second crash one frame later. Refuse to open
    // instead. `customFetch` resolves on 4xx/5xx but REJECTS when the backend
    // is unreachable, so this needs both guards: the `.ok` check and the catch.
    let data: any;
    try {
      const response = await fetch('/integrations');
      if (!response.ok) {
        throw new Error('Could not load the channel catalog');
      }
      data = await response.json();
    } catch (e) {
      toaster.show(
        t(
          'add_channel_failed',
          'Could not load the channel list, please try again'
        ),
        'warning'
      );
      return;
    }

    if (!Array.isArray(data?.social)) {
      toaster.show(
        t(
          'add_channel_failed',
          'Could not load the channel list, please try again'
        ),
        'warning'
      );
      return;
    }

    modal.openModal({
      title: t('add_channel', 'Add Channel'),
      withCloseButton: true,
      /**
       * `AddProviderComponent` takes `update` but never calls it, and the OAuth
       * popup path (`window.open`) leaves the parent to notice on its own —
       * nothing in the app listens for the message it posts back. With
       * `revalidateOnFocus` and `revalidateIfStale` both off on the channel
       * list, a caller that gates on "do I have channels" would keep seeing the
       * pre-connect answer: Create Post would reopen this same dialog forever.
       * Revalidating on close costs one request and closes that loop.
       */
      onClose: () => update?.(),
      children: (
        <AddProviderComponent invite={!!invite} update={update} {...data} />
      ),
    });
  }, [fetch, modal, t, update, invite, toaster]);
};
