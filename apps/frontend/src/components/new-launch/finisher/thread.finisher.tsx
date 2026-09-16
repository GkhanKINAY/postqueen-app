'use client';

import { Slider } from '@gitroom/react/form/slider';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { FormSection } from '@gitroom/react/form/form.section';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

export const ThreadFinisher = () => {
  const integration = useIntegration();
  const { register, watch, setValue } = useSettings();
  const t = useT();
  const wrap = t('that_a_wrap', {
    username:
      integration.integration?.display || integration.integration?.name,
  });

  register('active_thread_finisher', {
    value: false,
  });

  register('thread_finisher', {
    value: wrap,
  });

  const slider = watch('active_thread_finisher');
  const raw = watch('thread_finisher') || '';
  const value = stripHtmlValidation('normal', raw, true);

  return (
    <FormSection>
      <div className="flex items-center gap-[12px]">
        <div className="flex-1 text-[13px] font-[600] text-pqText">
          {t('add_a_thread_finisher', 'Add a thread finisher')}
        </div>
        <Slider
          value={slider ? 'on' : 'off'}
          onChange={(p) => {
            const on = p === 'on';
            setValue('active_thread_finisher', on);
            if (on && !value.trim()) {
              setValue('thread_finisher', wrap);
            }
          }}
          fill={true}
        />
      </div>
      {slider ? (
        <textarea
          data-pq="composer-thread-finisher"
          rows={5}
          value={value}
          onChange={(event) => setValue('thread_finisher', event.target.value)}
          placeholder={t(
            'thread_finisher_placeholder',
            'Last post in the thread'
          )}
          className="min-h-[120px] w-full resize-y rounded-[10px] bg-pqInner px-[12px] py-[10px] text-[14px] leading-[1.45] text-pqText outline-none shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_20%,transparent)] placeholder:text-pqMuted focus:shadow-[inset_0_0_0_1px_var(--brand)]"
        />
      ) : null}
    </FormSection>
  );
};
