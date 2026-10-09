'use client';

import React, { FC, FormEventHandler, useCallback, useState } from 'react';
import {
  ModalFormActions,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * A name for the channel inside PostQueen only. The provider's own name stays
 * in `originalName` and is what a reconnect or refresh keeps writing, so the
 * rename survives both. An empty name goes back to the original.
 */
export const RenameChannelModal: FC<{
  integration: { id: string; name: string; originalName?: string };
  onSaved: () => void;
}> = ({ integration, onSaved }) => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const toast = useToaster();
  const [name, setName] = useState(integration.name);
  const renamed =
    !!integration.originalName && integration.originalName !== integration.name;

  const save = useCallback(
    async (typed: string) => {
      // Typing the original name back is a reset, not a rename pinned to it:
      // a later rename on the platform would otherwise never show here.
      const next =
        typed.trim() === (integration.originalName || '').trim() ? '' : typed;
      const res = await fetch(`/integrations/${integration.id}/custom-name`, {
        method: 'PUT',
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        toast.show(t('could_not_save', 'Could not save'), 'warning');
        return;
      }
      onSaved();
      toast.show(
        next.trim()
          ? t('channel_renamed', 'Channel Renamed')
          : t('channel_name_reset', 'Channel name reset'),
        'success'
      );
      modal.closeAll();
    },
    [fetch, integration.id, integration.originalName, modal, onSaved, t, toast]
  );

  const submit: FormEventHandler<HTMLFormElement> = useCallback(
    (e) => {
      e.preventDefault();
      void save(name);
    },
    [name, save]
  );

  return (
    <form
      data-pq="channel-rename-form"
      onSubmit={submit}
      className="flex flex-col gap-[16px]"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        name="name"
        label={t('channel_name', 'Name')}
        placeholder={integration.originalName || ''}
        maxLength={100}
        disableForm={true}
      />
      <ModalFormActions onCancel={() => modal.closeAll()}>
        {renamed && (
          <Button
            type="button"
            variant="outline"
            onClick={() => save('')}
            className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
          >
            {t('reset_channel_name', 'Reset to original name')}
          </Button>
        )}
        <Button
          type="submit"
          className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
        >
          {t('save', 'Save')}
        </Button>
      </ModalFormActions>
    </form>
  );
};

/**
 * Renames a channel group (customer) for every channel in it. The server
 * refuses a name another group already has, and says so.
 */
export const RenameGroupModal: FC<{
  group: { id: string; name: string };
  close: () => void;
  resolve: (name: string) => void;
}> = ({ group, close, resolve }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();
  const [name, setName] = useState(group.name);

  const submit: FormEventHandler<HTMLFormElement> = useCallback(
    async (e) => {
      e.preventDefault();
      const res = await fetch(`/integrations/customers/${group.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const { message } = await res.json().catch(() => ({} as any));
        toast.show(
          (Array.isArray(message) ? message[0] : message) ||
            t('could_not_save_group', 'Could not save the group.'),
          'warning'
        );
        return;
      }
      resolve(name);
      close();
    },
    [close, fetch, group.id, name, resolve, t, toast]
  );

  return (
    <form
      data-pq="group-rename-form"
      onSubmit={submit}
      className="flex flex-col gap-[16px]"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        name="name"
        label={t('group_name', 'Name')}
        placeholder=""
        maxLength={100}
        disableForm={true}
      />
      <ModalFormActions onCancel={close}>
        <Button
          type="submit"
          disabled={!name.trim()}
          className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
        >
          {t('save', 'Save')}
        </Button>
      </ModalFormActions>
    </form>
  );
};
