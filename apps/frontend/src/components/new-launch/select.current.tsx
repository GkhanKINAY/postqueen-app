'use client';

import { FC } from 'react';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import clsx from 'clsx';
import { ChannelAvatar } from '@gitroom/frontend/components/new-launch/channel.avatar';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';

export const SelectCurrent: FC = () => {
  const {
    selectedIntegrations,
    current,
    setCurrent,
    locked,
    setHide,
    hasOwnVersion,
  } = useLaunchStore(
    useShallow((state) => ({
      selectedIntegrations: state.selectedIntegrations,
      current: state.current,
      setCurrent: state.setCurrent,
      locked: state.locked,
      setHide: state.setHide,
      hasOwnVersion: !!state.internal.find(
        (p) => p.integration.id === state.current
      ),
    }))
  );

  const t = useT();
  const isGlobal = current === 'global';
  const currentChannel = selectedIntegrations.find(
    (p) => p.integration.id === current
  )?.integration;

  // Which version is being edited, named: the shared post, or one channel's
  // own. Picking a channel only switches the view (`setCurrent`); writing a
  // separate version for it is the editor's "Write a version" step.
  const tabClass = (active: boolean) =>
    clsx(
      'flex h-[34px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[9px] ps-[7px] pe-[12px] text-[13px] transition-colors disabled:cursor-not-allowed mobile:h-[44px]',
      active
        ? 'bg-pqInner font-[600] text-pqText shadow-pqE1'
        : 'text-pqMuted hover:text-pqText'
    );

  return (
    <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px] pb-[2px] select-none">
      <div
        role="tablist"
        aria-label={t('which_version_editing', 'Which version you are editing')}
        className={clsx(
          'flex max-w-full gap-[2px] overflow-x-auto rounded-[12px] bg-pqSettings p-[3px]',
          locked && 'pointer-events-none opacity-50'
        )}
      >
        <button
          type="button"
          role="tab"
          aria-selected={isGlobal}
          disabled={locked}
          onClick={() => {
            setHide(true);
            setCurrent('global');
          }}
          className={tabClass(isGlobal)}
        >
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-pqBrandSoft text-pqFocused">
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M12 3a13.5 13.5 0 0 0 0 18 13.5 13.5 0 0 0 0-18M3 12h18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          {t('all_channels', 'All channels')}
        </button>
        {selectedIntegrations.map(({ integration }) => {
          const isActive = current === integration.id;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={locked}
              key={integration.id}
              onClick={() => {
                setHide(true);
                setCurrent(integration.id);
              }}
              data-tooltip-id="tooltip"
              data-tooltip-content={channelNameWithHandle(integration)}
              className={tabClass(isActive)}
            >
              <ChannelAvatar
                integration={integration}
                size={22}
                rounded="full"
              />
              <span className="max-w-[140px] truncate">{integration.name}</span>
              <IsGlobal id={integration.id} />
            </button>
          );
        })}
      </div>
      {/* A channel still on the shared post gets no line here: the card
          over its editor says so, with the way to write its own. */}
      {(isGlobal || hasOwnVersion) && (
        <span className="min-w-0 text-[12.5px] text-pqMuted">
          {isGlobal
            ? t(
                'editing_shared_post_hint',
                'Edits here reach every channel without its own version'
              )
            : t(
                'editing_channel_version_hint',
                'Only {{name}} gets this version',
                {
                  name: currentChannel?.name || '',
                  interpolation: { escapeValue: false },
                }
              )}
        </span>
      )}
    </div>
  );
};

/** The mark on a channel's tab once it has a version of its own. */
export const IsGlobal: FC<{ id: string }> = ({ id }) => {
  const t = useT();
  const { isInternal } = useLaunchStore(
    useShallow((state) => ({
      isInternal: !!state.internal.find((p) => p.integration.id === id),
    }))
  );

  if (!isInternal) {
    return null;
  }

  return (
    <span className="shrink-0 rounded-full bg-pqBrandSoft px-[6px] py-[1px] text-[10.5px] font-[700] text-pqFocused">
      {t('own_version', 'Own version')}
    </span>
  );
};
