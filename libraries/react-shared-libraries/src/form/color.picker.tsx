'use client';

import { FC, useCallback, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useFormContext } from 'react-hook-form';
import { clsx } from 'clsx';
import { Button } from './button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { TranslatedLabel } from '../translation/translated-label';

const COLOR_PRESETS = [
  '#7C3AED',
  '#2563EB',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#6B7280',
  '#111827',
];

export const ColorPicker: FC<{
  name: string;
  label: string;
  enabled: boolean;
  onChange?: (params: {
    target: {
      name: string;
      value: string;
    };
  }) => void;
  value?: string;
  canBeCancelled: boolean;
  translationKey?: string;
  translationParams?: Record<string, string | number>;
}> = (props) => {
  const {
    name,
    label,
    value,
    canBeCancelled,
    onChange,
    translationKey,
    translationParams,
  } = props;
  const form = useFormContext();
  const color = onChange
    ? {
        onChange,
      }
    : form.register(name);
  const watch = onChange ? value : form.watch(name);
  const [enabledState, setEnabledState] = useState(!!watch);
  const setColor = useCallback(
    (next: string) => {
      color.onChange({
        target: {
          name,
          value: next,
        },
      });
    },
    [color, name]
  );
  const enable = useCallback(async () => {
    await setColor('#FFFFFF');
    setEnabledState(true);
  }, [setColor]);
  const cancel = useCallback(async () => {
    await setColor('');
    setEnabledState(false);
  }, [setColor]);

  const t = useT();
  const current = typeof watch === 'string' ? watch : '';

  if (!enabledState) {
    return (
      <div>
        <Button onClick={enable}>
          {t('enable_color_picker', 'Enable color picker')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[12px]">
      {!!label && (
        <div className="flex items-center justify-between gap-[8px]">
          <div className="text-[13px] font-[500] text-pqMuted">
            <TranslatedLabel
              label={label}
              translationKey={translationKey}
              translationParams={translationParams}
            />
          </div>
          {canBeCancelled && (
            <Button onClick={cancel} variant="ghost" size="sm">
              {t('cancel_the_color_picker', 'Cancel the color picker')}
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-[8px]">
        {COLOR_PRESETS.map((hex) => {
          const selected = current.toLowerCase() === hex.toLowerCase();
          return (
            <button
              type="button"
              key={hex}
              aria-label={hex}
              aria-pressed={selected}
              onClick={() => setColor(hex)}
              className={clsx(
                'size-[28px] shrink-0 rounded-full transition-shadow',
                selected
                  ? 'ring-2 ring-pqBrand ring-offset-2 ring-offset-pqPop'
                  : 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_22%,transparent)] hover:shadow-[inset_0_0_0_2px_var(--brand)]'
              )}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>
      <div className="overflow-hidden rounded-[10px] [&_.react-colorful]:h-[148px] [&_.react-colorful]:w-full">
        <HexColorPicker color={current || '#FFFFFF'} onChange={setColor} />
      </div>
      <div className="flex h-[40px] items-center gap-[10px] rounded-[10px] bg-pqInner px-[10px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_20%,transparent)] focus-within:shadow-[inset_0_0_0_1px_var(--brand)]">
        <span
          className="size-[22px] shrink-0 rounded-[6px] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_18%,transparent)]"
          style={{ backgroundColor: current || '#FFFFFF' }}
        />
        <input
          value={current}
          spellCheck={false}
          aria-label={label}
          onChange={(event) => setColor(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[13px] uppercase tracking-[0.04em] text-pqText outline-none placeholder:text-pqMuted"
        />
      </div>
    </div>
  );
};
