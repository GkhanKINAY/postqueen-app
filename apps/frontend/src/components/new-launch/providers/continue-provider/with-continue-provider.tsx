'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';

const SWR_OPTIONS = {
  refreshWhenHidden: false,
  refreshWhenOffline: false,
  revalidateOnFocus: false,
  revalidateIfStale: false,
  revalidateOnMount: true,
  revalidateOnReconnect: false,
  refreshInterval: 0,
};

export interface ContinueProviderProps {
  onSave: (data: any) => Promise<void>;
  existingId: string[];
  initialData?: any[];
  isSaving?: boolean;
}

export interface EmptyStateMessage {
  key: string;
  text: string;
}

export interface ContinueProviderConfig<TItem, TSelection> {
  endpoint: string;
  swrKey: string;
  titleKey: string;
  titleDefault: string;
  emptyStateMessages: EmptyStateMessage[];
  getSelectionValue: (item: TItem) => TSelection;
  transformSaveData: (selection: TSelection) => any;
  renderItem: (item: TItem, isSelected: boolean) => ReactNode;
  isSelected: (item: TItem, selection: TSelection | null) => boolean;
  getItemId: (item: TItem) => string;
}

export function withContinueProvider<TItem, TSelection>(
  config: ContinueProviderConfig<TItem, TSelection>
): FC<ContinueProviderProps> {
  const {
    endpoint,
    swrKey,
    titleKey,
    titleDefault,
    emptyStateMessages,
    getSelectionValue,
    transformSaveData,
    renderItem,
    isSelected,
    getItemId,
  } = config;

  return function ContinueProviderComponent(props: ContinueProviderProps) {
    const { onSave, existingId, initialData, isSaving } = props;
    const call = useCustomProviderFunction();
    const t = useT();
    const [selection, setSelection] = useState<TSelection | null>(null);

    const loadData = useCallback(async () => {
      // Skip fetch if initial data was provided
      if (initialData) {
        return initialData;
      }
      // Deliberately not caught. Swallowing the error resolved the fetcher to
      // `undefined`, which SWR reports as a *successful* empty result — so a
      // provider that failed to load its options looked exactly like a provider
      // with no options to offer, and `isLoading` went false either way. Letting
      // it throw is what gives SWR an `error` to distinguish the two, the same
      // rule CLAUDE.md sets out under "Loading and empty states".
      return await call.get(endpoint);
    }, [initialData]);

    const { data, isLoading, error, mutate } = useSWR(
      initialData ? null : swrKey,
      loadData,
      SWR_OPTIONS
    );

    const resolvedData = initialData || data;

    const filteredData = useMemo(() => {
      return (
        (resolvedData as TItem[])?.filter(
          (item) => !existingId.includes(getItemId(item))
        ) || []
      );
    }, [resolvedData, existingId]);

    // One channel and a disabled Save looks like a selected card that does
    // nothing. Pre-select the only option so Save is actually armed.
    useEffect(() => {
      if (selection || filteredData.length !== 1) {
        return;
      }
      setSelection(getSelectionValue(filteredData[0]));
    }, [filteredData, selection]);

    const handleSelect = useCallback(
      (item: TItem) => () => {
        setSelection(getSelectionValue(item));
      },
      []
    );

    const handleSave = useCallback(async () => {
      const chosen =
        selection ??
        (filteredData.length === 1
          ? getSelectionValue(filteredData[0])
          : null);
      if (!chosen) {
        return;
      }
      await onSave(transformSaveData(chosen));
    }, [onSave, selection, filteredData]);

    // A failed load is not an empty account. Both used to render the same
    // "nothing here" copy, which told someone whose options exist that they
    // have none — and offered no way to find out otherwise.
    if (!isLoading && error) {
      return (
        <div className="flex h-[240px] flex-col items-center justify-center gap-[12px] text-center text-[15px] leading-[24px] text-pqMuted">
          <span>
            {t(
              'provider_options_failed',
              'We could not load the options for this channel.'
            )}
          </span>
          <button
            type="button"
            onClick={() => mutate()}
            className="cursor-pointer text-[13.5px] font-[600] text-pqFocused underline hover:no-underline"
          >
            {t('try_again', 'Try again')}
          </button>
        </div>
      );
    }

    if (!isLoading && !resolvedData?.length) {
      return (
        <div className="flex h-[240px] flex-col items-center justify-center text-center text-[15px] leading-[24px] text-pqMuted">
          {emptyStateMessages.map((msg, index) => (
            <span key={msg.key}>
              {t(msg.key, msg.text)}
              {index < emptyStateMessages.length - 1 && (
                <>
                  <br />
                  <br />
                </>
              )}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-[16px]">
        <div className="text-[12px] font-[600] uppercase tracking-[0.06em] text-pqMuted">
          {t(titleKey, titleDefault)}
        </div>
        <div className="flex flex-col gap-[8px]">
          {filteredData.map((item) => {
            const selected = isSelected(item, selection);
            return (
              <button
                type="button"
                key={getItemId(item)}
                aria-pressed={selected}
                className={clsx(
                  'flex w-full cursor-pointer items-center gap-[12px] rounded-pqMd px-[14px] py-[12px] text-start transition-colors',
                  '[&_img]:size-[44px] [&_img]:max-w-none [&_img]:shrink-0 [&_img]:rounded-full [&_img]:object-cover',
                  selected
                    ? 'bg-pqNavActive shadow-[inset_0_0_0_1.5px_var(--brand)]'
                    : 'shadow-[inset_0_0_0_1px_var(--border)] hover:bg-pqHover'
                )}
                onClick={handleSelect(item)}
              >
                {renderItem(item, selected)}
              </button>
            );
          })}
        </div>
        <div>
          <Button
            disabled={!selection || isSaving}
            loading={isSaving}
            onClick={handleSave}
          >
            {t('save', 'Save')}
          </Button>
        </div>
      </div>
    );
  };
}
