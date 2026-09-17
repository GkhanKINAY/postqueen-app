import React, { FC, useCallback, useState } from 'react';
import {
  ModalFormActions,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import type { Integration } from '@gitroom/nestjs-libraries/database/prisma/generated/client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Slider } from '@gitroom/react/form/slider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type Translate = (key: string, fallback: string) => string;

/**
 * Stored `title` is the provider key (X `maxLength` looks up `"Verified"`).
 * Visible copy is mapped here so the channel row and Edit modal stay in sync.
 */
export function publishingOptionCopy(
  option: {
    title?: string;
    description?: string;
    type?: string;
    value?: unknown;
  },
  t: Translate
) {
  if (option.title === 'Verified') {
    const on = option.value === true;
    return {
      title: t('x_long_posts', 'Long posts'),
      hint: t(
        'x_long_posts_hint',
        'X Premium character limit: 4000 instead of 280.'
      ),
      description: t(
        'x_long_posts_description',
        'Turn on if this account has X Premium so the composer allows 4000 characters. Off keeps the classic 280-character limit. This is not the blue check.'
      ),
      status: on
        ? t('x_long_posts_enabled', '4000')
        : t('x_long_posts_disabled', '280'),
    };
  }

  const isBool = option.type === 'boolean' || option.type === 'checkbox';
  return {
    title: option.title || '',
    hint: isBool
      ? t(
          'applies_to_every_post_on_this_channel',
          'Applies to every post on this channel.'
        )
      : t(
          'default_value_used_when_publishing_here',
          'Default value used when publishing here'
        ),
    description: option.description || '',
    status:
      typeof option.value === 'boolean'
        ? option.value
          ? t('active', 'Active')
          : t('off', 'Off')
        : undefined,
  };
}

export const Element: FC<{
  setting: any;
  onChange: (value: any) => void;
}> = (props) => {
  const { setting, onChange } = props;
  const t = useT();
  const copy = publishingOptionCopy(setting, (key, fallback) =>
    t(key, fallback)
  );
  const [value, setValue] = useState(setting.value);
  return (
    <div className="flex items-start gap-[14px] rounded-[12px] bg-pqPop p-[14px] shadow-[inset_0_0_0_1px_var(--border)]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-[8px]">
          <div className="text-[14px] font-[600] text-pqText">{copy.title}</div>
          {copy.status ? (
            <span className="inline-flex h-[22px] items-center rounded-[6px] bg-pqSettings px-[8px] text-[11.5px] font-[600] tabular-nums text-pqMuted">
              {copy.status}
            </span>
          ) : null}
        </div>
        <div className="mt-[4px] text-[13px] leading-[1.5] text-pqMuted">
          {copy.description}
        </div>
      </div>
      <div className="shrink-0 pt-[2px]">
        <Slider
          value={value === true ? 'on' : 'off'}
          onChange={() => {
            setValue(!value);
            onChange(!value);
          }}
          fill={true}
        />
      </div>
    </div>
  );
};
export const SettingsModal: FC<{
  integration: Integration & {
    customer?: {
      id: string;
      name: string;
    };
  };
  onClose: () => void;
}> = (props) => {
  const fetch = useFetch();
  const t = useT();
  const { onClose, integration } = props;
  const modal = useModals();
  const [values, setValues] = useState(
    JSON.parse(integration?.additionalSettings || '[]')
  );
  const changeValue = useCallback(
    (index: number) => (value: any) => {
      const newValues = [...values];
      newValues[index].value = value;
      setValues(newValues);
    },
    [values]
  );
  const save = useCallback(async () => {
    await fetch(`/integrations/${integration.id}/settings`, {
      method: 'POST',
      body: JSON.stringify({
        additionalSettings: JSON.stringify(values),
      }),
    });
    modal.closeAll();
    onClose();
  }, [values, integration]);
  return (
    <div data-pq="publishing-options" className="flex flex-col gap-[14px]">
      {values.map((setting: any, index: number) => (
        <Element
          key={setting.title}
          setting={setting}
          onChange={changeValue(index)}
        />
      ))}
      <ModalFormActions onCancel={() => modal.closeAll()}>
        <Button
          onClick={save}
          className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
        >
          {t('save', 'Save')}
        </Button>
      </ModalFormActions>
    </div>
  );
};
