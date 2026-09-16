import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { useMoveToIntegrationListener } from '@gitroom/frontend/components/launches/helpers/use.move.to.integration';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import clsx from 'clsx';
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import { useStateCallback } from '@gitroom/react/helpers/use.state.callback';
import { timer } from '@gitroom/helpers/utils/timer';
import { channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { useAiAvailable } from '@gitroom/frontend/components/layout/user.context';
import { ChannelAvatar } from '@gitroom/frontend/components/new-launch/channel.avatar';

const PickPlatformCopilotBindings: FC<{
  isMain: boolean;
  integrations: Integrations[];
  handler: (args: { integrationsId: string[] }) => Promise<void>;
  deps: unknown[];
}> = ({ isMain, integrations, handler, deps }) => {
  useCopilotReadable({
    description: isMain
      ? 'All available platforms channels'
      : 'Possible platforms channels to edit',
    value: JSON.stringify(integrations),
  });
  useCopilotAction(
    {
      name: isMain ? `addOrRemovePlatform` : 'setSelectedIntegration',
      description: isMain
        ? `Add or remove channels to schedule your post to, pass all the ids as array`
        : 'Set selected integrations',
      parameters: [
        {
          name: 'integrationsId',
          type: 'string[]',
          description: 'List of integrations id to set as selected',
          required: true,
        },
      ],
      handler,
    },
    deps
  );
  return null;
};

export const PickPlatforms: FC<{
  integrations: Integrations[];
  selectedIntegrations: Integrations[];
  onChange: (integrations: Integrations[], callback: () => void) => void;
  singleSelect: boolean;
  hide?: boolean;
  isMain: boolean;
  toolTip?: boolean;
}> = (props) => {
  const { hide, isMain, integrations, selectedIntegrations, onChange } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [isLeft, setIsLeft] = useState(false);
  const [isRight, setIsRight] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useStateCallback<
    Integrations[]
  >(
    selectedIntegrations.slice(0).map((p) => ({
      ...p,
    }))
  );
  useEffect(() => {
    if (
      props.singleSelect &&
      selectedAccounts.length &&
      integrations.indexOf(selectedAccounts?.[0]) === -1
    ) {
      addPlatform(integrations[0])();
    }
  }, [integrations, selectedAccounts]);
  const checkLeftRight = (test = true) => {
    const scrollWidth = ref.current?.scrollWidth;
    const offsetWidth = +(ref.current?.offsetWidth || 0);
    const scrollOffset = ref.current?.scrollLeft || 0;
    const totalScroll = scrollOffset + offsetWidth + 100;
    setIsLeft(!!scrollOffset);
    setIsRight(!!scrollWidth && !!offsetWidth && scrollWidth > totalScroll);
  };
  const changeOffset = useCallback(
    (offset: number) => () => {
      if (ref.current) {
        ref.current.scrollLeft += offset;
        checkLeftRight();
      }
    },
    [selectedIntegrations, integrations, selectedAccounts]
  );
  useEffect(() => {
    checkLeftRight();
  }, [selectedIntegrations, integrations]);
  useMoveToIntegrationListener(
    [integrations],
    props.singleSelect,
    ({ identifier, toPreview }: { identifier: string; toPreview: boolean }) => {
      const findIntegration = integrations.find((p) => p.id === identifier);
      if (findIntegration) {
        addPlatform(findIntegration)();
      }
    }
  );
  const addPlatform = useCallback(
    (integration: Integrations) => async () => {
      const promises = [];
      if (props.singleSelect) {
        promises.push(
          new Promise((res) => {
            onChange([integration], () => {
              res('');
            });
          })
        );
        promises.push(
          new Promise((res) => {
            setSelectedAccounts([integration], () => {
              res('');
            });
          })
        );
        return;
      }
      if (selectedAccounts.some((account) => account.id === integration.id)) {
        const changedIntegrations = selectedAccounts.filter(
          ({ id }) => id !== integration.id
        );
        if (
          !props.singleSelect &&
          !(await deleteDialog(
            'Are you sure you want to remove this platform?'
          ))
        ) {
          return;
        }
        promises.push(
          new Promise((res) => {
            onChange(changedIntegrations, () => {
              res('');
            });
          })
        );
        promises.push(
          new Promise((res) => {
            setSelectedAccounts(changedIntegrations, () => {
              res('');
            });
          })
        );
      } else {
        const changedIntegrations = [...selectedAccounts, integration];
        promises.push(
          new Promise((res) => {
            onChange(changedIntegrations, () => {
              res('');
            });
          })
        );
        promises.push(
          new Promise((res) => {
            setSelectedAccounts(changedIntegrations, () => {
              res('');
            });
          })
        );
      }
      await timer(500);
      await Promise.all(promises);
    },
    [onChange, props.singleSelect, selectedAccounts, setSelectedAccounts]
  );
  const handler = async ({ integrationsId }: { integrationsId: string[] }) => {
    const selected = selectedIntegrations.map((p) => p.id);
    const notToRemove = selected.filter((p) => integrationsId.includes(p));
    const toAdd = integrationsId.filter((p) => !selected.includes(p));
    const newIntegrations = [...notToRemove, ...toAdd]
      .map((id) => integrations.find((p) => p.id === id)!)
      .filter((p) => p);
    setSelectedAccounts(newIntegrations, () => {});
    onChange(newIntegrations, () => {});
  };
  const aiOk = useAiAvailable();
  if (hide) {
    return null;
  }
  return (
    <div
      className={clsx('flex select-none', props.singleSelect && 'gap-[10px]')}
    >
      {aiOk && (
        <PickPlatformCopilotBindings
          isMain={isMain}
          integrations={integrations}
          handler={handler}
          deps={[
            addPlatform,
            selectedAccounts,
            integrations,
            onChange,
            props.singleSelect,
            setSelectedAccounts,
          ]}
        />
      )}
      {props.singleSelect && isLeft && (
        <div className="flex items-center">
          {isLeft && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              onClick={changeOffset(-200)}
            >
              <path
                d="M10.3541 12.6463C10.4006 12.6927 10.4374 12.7479 10.4626 12.8086C10.4877 12.8693 10.5007 12.9343 10.5007 13C10.5007 13.0657 10.4877 13.1308 10.4626 13.1915C10.4374 13.2522 10.4006 13.3073 10.3541 13.3538C10.3077 13.4002 10.2525 13.4371 10.1918 13.4622C10.1311 13.4874 10.0661 13.5003 10.0004 13.5003C9.9347 13.5003 9.86964 13.4874 9.80894 13.4622C9.74825 13.4371 9.6931 13.4002 9.64664 13.3538L4.64664 8.35378C4.60015 8.30735 4.56328 8.2522 4.53811 8.1915C4.51295 8.13081 4.5 8.06574 4.5 8.00003C4.5 7.93433 4.51295 7.86926 4.53811 7.80856C4.56328 7.74786 4.60015 7.69272 4.64664 7.64628L9.64664 2.64628C9.74046 2.55246 9.86771 2.49976 10.0004 2.49976C10.1331 2.49976 10.2603 2.55246 10.3541 2.64628C10.448 2.7401 10.5007 2.86735 10.5007 3.00003C10.5007 3.13272 10.448 3.25996 10.3541 3.35378L5.70727 8.00003L10.3541 12.6463Z"
                fill="currentColor"
              />
            </svg>
          )}
        </div>
      )}
      <div
        className={clsx(
          'flex-1 flex',
          props.singleSelect && 'relative h-[40px]'
        )}
      >
        <div
          className={clsx(
            props.singleSelect
              ? 'absolute w-full h-[40px] flex flex-nowrap overflow-hidden transition-all'
              : 'flex-1 flex'
          )}
          ref={ref}
        >
          <div className="innerComponent">
            <div className="flex flex-wrap gap-[12px] p-[4px]">
              {integrations
                .filter((f) => !f.inBetweenSteps)
                .map((integration) => {
                  const selected = selectedAccounts.some(
                    (account) => account.id === integration.id
                  );
                  const name = channelNameWithHandle(integration);
                  if (props.singleSelect) {
                    return (
                      <div key={integration.id}>
                        <button
                          type="button"
                          onClick={addPlatform(integration)}
                          aria-pressed={selected}
                          className={clsx(
                            'relative flex h-[40px] w-[200px] cursor-pointer items-center justify-center gap-[10px] rounded-[50px] px-[12px] text-[13px] font-[600] transition-colors',
                            selected
                              ? 'bg-pqBrandSoft text-pqText shadow-[inset_0_0_0_1px_var(--brand)]'
                              : 'bg-pqSettings text-pqMuted hover:text-pqText'
                          )}
                        >
                          <ChannelAvatar
                            integration={integration}
                            size={24}
                            rounded="full"
                            badgeSize={12}
                          />
                          <span className="min-w-0 truncate">
                            {integration.name.slice(0, 10)}
                            {integration.name.length > 10 ? '...' : ''}
                          </span>
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={integration.id}
                      className="flex items-center"
                      data-tooltip-id="tooltip"
                      data-tooltip-content={name}
                    >
                      <button
                        type="button"
                        onClick={addPlatform(integration)}
                        aria-pressed={selected}
                        aria-label={name}
                        className={clsx(
                          'relative grid size-[40px] cursor-pointer place-items-center rounded-full transition-all',
                          selected
                            ? 'ring-2 ring-pqBrand ring-offset-2 ring-offset-pqSettings'
                            : 'opacity-50 grayscale hover:opacity-80 hover:grayscale-0'
                        )}
                      >
                        <ChannelAvatar
                          integration={integration}
                          size={36}
                          rounded="full"
                        />
                        {selected && (
                          <span
                            className="absolute -end-[2px] -top-[2px] z-20 grid size-[16px] place-items-center rounded-full bg-pqBrand text-pqOnBrand ring-2 ring-pqSettings"
                            aria-hidden="true"
                          >
                            <svg
                              viewBox="0 0 12 12"
                              width="9"
                              height="9"
                              fill="none"
                            >
                              <path
                                d="M2.2 6.2 4.6 8.6 9.8 3.4"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
      {props.singleSelect && isRight && (
        <div className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={!isRight ? 'pointer-events-none invisible' : ' '}
            onClick={changeOffset(200)}
          >
            <path
              d="M5.64586 12.6463C5.5994 12.6927 5.56255 12.7479 5.53741 12.8086C5.51227 12.8693 5.49933 12.9343 5.49933 13C5.49933 13.0657 5.51227 13.1308 5.53741 13.1915C5.56255 13.2522 5.5994 13.3073 5.64586 13.3538C5.69231 13.4002 5.74746 13.4371 5.80816 13.4622C5.86886 13.4874 5.93391 13.5003 5.99961 13.5003C6.0653 13.5003 6.13036 13.4874 6.19106 13.4622C6.25175 13.4371 6.3069 13.4002 6.35336 13.3538L11.3534 8.35378C11.3998 8.30735 11.4367 8.2522 11.4619 8.1915C11.487 8.13081 11.5 8.06574 11.5 8.00003C11.5 7.93433 11.487 7.86926 11.4619 7.80856C11.4367 7.74786 11.3998 7.69272 11.3534 7.64628L6.35336 2.64628C6.25954 2.55246 6.13229 2.49976 5.99961 2.49976C5.86692 2.49976 5.73968 2.55246 5.64586 2.64628C5.55204 2.7401 5.49933 2.86735 5.49933 3.00003C5.49933 3.13272 5.55204 3.25996 5.64586 3.35378L10.2927 8.00003L5.64586 12.6463Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}
    </div>
  );
};
