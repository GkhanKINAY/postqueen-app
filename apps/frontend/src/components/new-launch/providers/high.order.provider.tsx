'use client';

import React, {
  FC,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { IsOptional } from 'class-validator';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { GeneralPreviewComponent } from '@gitroom/frontend/components/launches/general.preview.component';
import { postHasPreview } from '@gitroom/frontend/components/new-launch/preview-media-aspect';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { InternalChannels } from '@gitroom/frontend/components/launches/internal.channels';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChannelAvatar, channelPlatformLabel } from '@gitroom/frontend/components/new-launch/channel.avatar';
import { formatChannelHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { ChevronDownIcon } from '@gitroom/frontend/components/ui/icons';

class Empty {
  @IsOptional()
  empty: string;
}

export { PostComment } from '@gitroom/frontend/components/new-launch/providers/post-comment.enum';
import { PostComment } from '@gitroom/frontend/components/new-launch/providers/post-comment.enum';

interface CharacterCondition {
  format: 'no-pictures' | 'with-pictures';
  type: 'post' | 'comment';
  maximumCharacters: number;
}

export const withProvider = function <T extends object>(params: {
  comments?: boolean | 'no-media';
  postComment: PostComment;
  minimumCharacters: CharacterCondition[];
  SettingsComponent: FC<{
    values?: any;
  }> | null;
  CustomPreviewComponent?: FC<{
    maximumCharacters?: number;
  }>;
  dto?: any;
  maximumCharacters?: number | ((settings: any) => number);
}) {
  const {
    postComment,
    SettingsComponent,
    CustomPreviewComponent,
    dto,
    maximumCharacters,
  } = params;

  const Wrapped = forwardRef((props: { id: string }, ref) => {
    const t = useT();
    const fetch = useFetch();
    const {
      current,
      selectedIntegration,
      setCurrent,
      internal,
      global,
      date,
      isGlobal,
      tab,
      setTotalChars,
      justCurrent,
      allIntegrations,
      setPostComment,
      setEditor,
      dummy,
      setChars,
      setComments,
    } = useLaunchStore(
      useShallow((state) => ({
        date: state.date,
        tab: state.tab,
        global: state.global,
        dummy: state.dummy,
        internal: state.internal.find((p) => p.integration.id === props.id),
        integrations: state.selectedIntegrations,
        allIntegrations: state.integrations,
        justCurrent: state.current,
        current: state.current === props.id,
        isGlobal: state.current === 'global',
        setCurrent: state.setCurrent,
        setComments: state.setComments,
        setTotalChars: state.setTotalChars,
        setPostComment: state.setPostComment,
        setEditor: state.setEditor,
        setChars: state.setChars,
        selectedIntegration: state.selectedIntegrations.find(
          (p) => p.integration.id === props.id
        ),
      }))
    );
    const [settingsOpen, setSettingsOpen] = useState(false);
    const showSettingsBody = !isGlobal || settingsOpen;

    useEffect(() => {
      if (!setTotalChars) {
        return;
      }

      setChars(
        props.id,
        typeof maximumCharacters === 'number'
          ? maximumCharacters
          : maximumCharacters(
              JSON.parse(
                selectedIntegration.integration.additionalSettings || '[]'
              )
            )
      );

      if (isGlobal) {
        setComments(true);
        setPostComment(PostComment.ALL);
        setTotalChars(0);
        setEditor('normal');
      }

      if (current) {
        setComments(
          typeof params.comments === 'undefined' ? true : params.comments
        );
        setEditor(selectedIntegration?.integration.editor);
        setPostComment(postComment);
        setTotalChars(
          typeof maximumCharacters === 'number'
            ? maximumCharacters
            : maximumCharacters(
                JSON.parse(
                  selectedIntegration.integration.additionalSettings || '[]'
                )
              )
        );
      }
    }, [justCurrent, current, isGlobal, setTotalChars]);

    const getInternalPlugs = useCallback(async () => {
      return (
        await fetch(
          `/integrations/${selectedIntegration.integration.identifier}/internal-plugs`
        )
      ).json();
    }, [selectedIntegration.integration.identifier]);
    const { data, isLoading } = useSWR(
      `internal-${selectedIntegration.integration.identifier}`,
      getInternalPlugs,
      {
        revalidateOnReconnect: true,
        // The channel identifier is the key, so switching channel tab inside
        // the composer re-keys. Without this the internal-plugs block vanishes
        // and the settings pane reflows on every tab change.
        keepPreviousData: true,
      }
    );

    const value = useMemo(() => {
      if (internal?.integrationValue?.length) {
        return internal.integrationValue;
      }

      return global;
    }, [internal, global, isGlobal]);

    const form = useForm({
      resolver: classValidatorResolver(dto || Empty),
      ...(Object.keys(selectedIntegration.settings).length > 0
        ? { values: { ...selectedIntegration.settings } }
        : {}),
      mode: 'all',
      criteriaMode: 'all',
      reValidateMode: 'onChange',
    });

    useEffect(() => {
      if (Object.keys(form.formState.errors).length > 0) {
        setSettingsOpen(true);
      }
    }, [form.formState.errors]);

    const revealChannel = () => {
      setCurrent(props.id);
    };

    useImperativeHandle(
      ref,
      () => ({
        // manage.modal focus(id, 'fix'|'preview') reads these on the handle.
        // They used to live only on isValid()'s return, so validation toasts
        // never actually switched the editor to the failing channel.
        fix: revealChannel,
        preview: revealChannel,
        isValid: async () => {
          const settings = form.getValues();
          return {
            id: props.id,
            identifier: selectedIntegration.integration.identifier,
            integration: selectedIntegration.integration,
            valid: await form.trigger(),
            err: form.formState.errors,
            settings,
            values: value,
            maximumCharacters:
              typeof maximumCharacters === 'number'
                ? maximumCharacters
                : maximumCharacters(
                    JSON.parse(
                      selectedIntegration.integration.additionalSettings || '[]'
                    )
                  ),
            fix: revealChannel,
            preview: revealChannel,
          };
        },
        getValues: () => {
          return {
            id: props.id,
            identifier: selectedIntegration.integration.identifier,
            values: value,
            settings: form.getValues(),
          };
        },
        trigger: () => {
          return form.trigger();
        },
      }),
      [value, selectedIntegration, setCurrent]
    );

    const settingsIdentity = (
      <>
        <ChannelAvatar
          integration={selectedIntegration.integration}
          size={36}
          badgeSize={14}
          rounded="full"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-[600] text-pqText">
            {selectedIntegration?.integration.name}
          </div>
          {!!formatChannelHandle(
            selectedIntegration?.integration.display
          ) && (
            <div className="truncate text-[12px] text-pqMuted">
              {formatChannelHandle(
                selectedIntegration?.integration.display
              )}
            </div>
          )}
        </div>
      </>
    );

    return (
      <IntegrationContext.Provider
        value={{
          date,
          integration: selectedIntegration.integration,
          allIntegrations,
          value: value.map((p) => ({
            id: p.id,
            content: p.content,
            image: p.media,
          })),
        }}
      >
        <FormProvider {...form}>
          <div
            className={clsx(
              'border border-borderPreview rounded-[12px] shadow-previewShadow',
              // Global mode stacks every selected channel preview; per-channel
              // tab still shows only the active id. Filter chips hide via CSS
              // data attribute when parent marks the card filtered out.
              !current && !isGlobal && 'hidden',
              isGlobal && 'mb-[16px] last:mb-0 snap-start'
            )}
            data-preview-channel={props.id}
          >
            {(current || isGlobal) &&
              (tab === 0 ||
                (!SettingsComponent && !data?.internalPlugs?.length)) &&
              postHasPreview(value?.[0]) && (
                <div
                  data-pq="preview-channel-identity"
                  className="flex items-center gap-[10px] border-b border-pqLine px-[14px] py-[10px]"
                >
                  <div className="truncate text-[11px] font-[700] uppercase tracking-[0.06em] text-pqSoft">
                    {channelPlatformLabel(
                      selectedIntegration.integration.identifier
                    )}
                  </div>
                </div>
              )}
            {(current || isGlobal) &&
              (tab === 0 ||
                (!SettingsComponent && !data?.internalPlugs?.length)) &&
              !postHasPreview(value?.[0]) &&
              // Global stacks many channels — one empty hint lives on the parent
              // so we don't repeat "Start writing…" per selected channel.
              !isGlobal && (
                <div>
                  {t(
                    'start_writing_your_post',
                    'Start writing your post for a preview'
                  )}
                </div>
              )}
            {(current || isGlobal) &&
              (tab === 0 ||
                (!SettingsComponent && !data?.internalPlugs?.length)) &&
              postHasPreview(value?.[0]) && (
                <div
                  data-pq="preview-channel-body"
                  className="px-[12px] pb-[14px] pt-[12px]"
                >
              {CustomPreviewComponent ? (
                <CustomPreviewComponent
                  maximumCharacters={
                    typeof maximumCharacters === 'number'
                      ? maximumCharacters
                      : maximumCharacters(
                          JSON.parse(
                            selectedIntegration.integration
                              .additionalSettings || '[]'
                          )
                        )
                  }
                />
              ) : (
                <GeneralPreviewComponent
                  maximumCharacters={
                    typeof maximumCharacters === 'number'
                      ? maximumCharacters
                      : maximumCharacters(
                          JSON.parse(
                            selectedIntegration.integration
                              .additionalSettings || '[]'
                          )
                        )
                  }
                />
              )}
                </div>
              )}
            {(SettingsComponent || !!data?.internalPlugs?.length) &&
              createPortal(
                current ? (
                  // Same FormProvider as the global cards. Switching the
                  // portal target (not remounting the form) is what keeps
                  // Post Type / carousel / etc. in sync when you leave a
                  // channel and go back to Global.
                  <div
                    data-id={props.id}
                    data-pq="composer-channel-settings"
                    className="flex flex-col gap-[16px] rounded-[14px] bg-pqInner p-[14px] shadow-[inset_0_0_0_1px_var(--border)]"
                  >
                    {SettingsComponent && <SettingsComponent />}
                    {!!data?.internalPlugs?.length && !dummy && (
                      <InternalChannels plugs={data?.internalPlugs} />
                    )}
                  </div>
                ) : (
                  <div
                    data-id={props.id}
                    className={clsx(
                      isGlobal ? 'block' : 'hidden',
                      'overflow-hidden bg-pqInner'
                    )}
                  >
                    {isGlobal && (
                      <style>{`#wrapper-settings {display: flex !important} #social-empty {display: block !important;}`}</style>
                    )}
                    <button
                      type="button"
                      aria-expanded={settingsOpen}
                      onClick={() => setSettingsOpen((open) => !open)}
                      className="flex w-full items-center gap-[10px] px-[14px] py-[12px] text-start hover:bg-pqHover"
                    >
                      {settingsIdentity}
                      <ChevronDownIcon
                        rotated={settingsOpen}
                        size={16}
                        className="shrink-0 text-pqMuted"
                      />
                    </button>
                    <div
                      className={clsx(
                        'flex flex-col gap-[16px] px-[14px] pb-[16px]',
                        showSettingsBody && 'border-t border-pqLine pt-[16px]',
                        !showSettingsBody && 'hidden'
                      )}
                    >
                      {SettingsComponent && <SettingsComponent />}
                      {!!data?.internalPlugs?.length && !dummy && (
                        <InternalChannels plugs={data?.internalPlugs} />
                      )}
                    </div>
                  </div>
                ),
                document.querySelector(
                  current ? '#composer-quick-settings' : '#social-settings'
                ) || document.createElement('div')
              )}
            {current &&
              !SettingsComponent &&
              createPortal(
                <style>{`#wrapper-settings {display: none !important;} #social-empty {display: block !important;}`}</style>,
                document.querySelector('#social-settings') ||
                  document.createElement('div')
              )}
          </div>
        </FormProvider>
      </IntegrationContext.Provider>
    );
  });

  // Expose the settings configuration as static metadata so the preview /
  // mobile settings page can render <SettingsComponent /> in isolation
  // without pulling the launch store + DOM portals.
  (Wrapped as any).__settings = {
    SettingsComponent,
    CustomPreviewComponent,
    dto,
    postComment,
    maximumCharacters,
  };

  return Wrapped;
};

/** Pulls the settings metadata off a withProvider-wrapped component. */
export const getProviderSettingsMeta = (component: unknown) => {
  return (component as any)?.__settings as
    | {
        SettingsComponent: FC<{ values?: any }> | null;
        CustomPreviewComponent?: FC<{ maximumCharacters?: number }>;
        dto?: any;
        postComment: PostComment;
        maximumCharacters?: number | ((settings: any) => number);
      }
    | undefined;
};
