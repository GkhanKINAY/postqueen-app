'use client';

import React, { FC, FormEventHandler, useCallback, useState } from 'react';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  ModalFormActions,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { showMediaBox } from '@gitroom/frontend/components/media/media.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ChannelAvatar } from '@gitroom/frontend/components/new-launch/channel.avatar';
export const BotPicture: FC<{
  integration: Integrations;
  canChangeProfilePicture: boolean;
  canChangeNickName: boolean;
  mutate: () => void;
}> = (props) => {
  const t = useT();
  const modal = useModals();
  const toast = useToaster();
  const [nick, setNickname] = useState(props.integration.name);
  const [picture, setPicture] = useState(props.integration.picture || '');
  const fetch = useFetch();
  const submitForm: FormEventHandler<HTMLFormElement> = useCallback(
    async (e) => {
      e.preventDefault();
      const res = await fetch(
        `/integrations/${props.integration.id}/nickname`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: nick,
            picture,
          }),
        }
      );
      // The platform can refuse the change, and this said Updated all the same.
      if (!res.ok) {
        toast.show(t('could_not_save', 'Could not save'), 'warning');
        return;
      }
      props.mutate();
      toast.show(t('updated', 'Updated'), 'success');
      modal.closeAll();
    },
    [nick, picture, props.mutate]
  );
  const openMedia = useCallback(() => {
    showMediaBox((values) => {
      const first = values[0];
      if (first?.path) setPicture(first.path);
    });
  }, []);
  return (
    <form
      data-pq="bot-picture-form"
      onSubmit={submitForm}
      className="flex flex-col gap-[16px]"
    >
      {props.canChangeProfilePicture && (
        <div className="flex items-center gap-[14px] rounded-[12px] bg-pqPop p-[14px] shadow-[inset_0_0_0_1px_var(--border)]">
          <ChannelAvatar
            integration={{ ...props.integration, picture }}
            size={72}
            rounded="full"
            badge={false}
          />
          <div className="min-w-0 flex-1 text-[14px] font-[600] text-pqText">
            {t('profile_picture', 'Profile Picture')}
          </div>
          <Button
            type="button"
            onClick={openMedia}
            className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
          >
            {t('upload', 'Upload')}
          </Button>
        </div>
      )}
      {props.canChangeNickName && (
        <Input
          value={nick}
          onChange={(e) => setNickname(e.target.value)}
          name="Nickname"
          label={t('label_nickname', 'Nickname')}
          placeholder=""
          disableForm={true}
        />
      )}
      <ModalFormActions onCancel={() => modal.closeAll()}>
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
