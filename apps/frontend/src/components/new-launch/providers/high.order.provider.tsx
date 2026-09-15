'use client';

import React, {
  FC,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
import SafeImage from '@gitroom/react/helpers/safe.image';
import { formatChannelHandle } from '@gitroom/frontend/components/channels/channel-handle';

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
      setHide,
    } = useLaunchStore(
      useShallow((state) => ({
        date: state.date,
        tab: state.tab,
        global: state.global,
        dummy: state.dummy,
        internal: state.internal.find((p) => p.integration.id === props.id),
        integrations: state.selectedIntegrations,
        setHide: state.setHide,
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

    useImperativeHandle(
      ref,
      () => ({
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
            fix: () => {
              setCurrent(props.id);
              setHide(true);
            },
            preview: () => {
              setCurrent(props.id);
              setHide(true);
            },
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
      [value]
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
              'relative isolate min-w-0 overflow-hidden rounded-[16px] border border-pqBorder bg-pqInner shadow-pqE1',
              // Global mode stacks every selected channel preview; per-channel
              // tab still shows only the active id. Filter chips hide via CSS
              // data attribute when parent marks the card filtered out.
              // `relative isolate overflow-hidden` keeps TikTok/YouTube/Pinterest
              // (and any leftover absolute chrome) inside this card. Upstream
              // Postiz only renders the active channel, so their
              // `absolute left-0 top-0 w-full h-full` fills the pane on purpose.
              !current && !isGlobal && 'hidden',
              isGlobal && 'mb-[12px] last:mb-0'
            )}
            data-preview-channel={props.id}
          >
            {isGlobal && (
              <div
                data-pq="preview-channel-label"
                className="flex min-w-0 items-center gap-[8px] border-b border-pqLine bg-pqSettings px-[14px] py-[10px]"
              >
                <div className="relative shrink-0">
                  <SafeImage
                    alt={selectedIntegration?.integration.name!}
                    width={22}
                    height={22}
                    className="h-[22px] w-[22px] rounded-full"
                    src={selectedIntegration?.integration.picture}
                  />
                  <SafeImage
                    alt={selectedIntegration?.integration.identifier}
                    width={12}
                    height={12}
                    className="absolute -bottom-[2px] -end-[2px] h-[12px] w-[12px] rounded-[3px]"
                    src={`/icons/platforms/${selectedIntegration?.integration.identifier}.png`}
                  />
                </div>
                <div className="min-w-0 flex-1 truncate text-[12px] font-[600] text-pqText">
                  {selectedIntegration?.integration.name}
                  {!!formatChannelHandle(
                    selectedIntegration?.integration.display
                  ) && (
                    <span className="ms-[6px] font-[400] text-pqSoft">
                      {formatChannelHandle(
                        selectedIntegration?.integration.display
                      )}
                    </span>
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
              postHasPreview(value?.[0]) &&
              (CustomPreviewComponent ? (
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
              ))}
            {(SettingsComponent || !!data?.internalPlugs?.length) &&
              createPortal(
                <div
                  data-id={props.id}
                  className={clsx(
                    isGlobal ? 'block' : 'hidden',
                    'flex flex-col gap-[12px]'
                  )}
                >
                  {isGlobal && (
                    <style>{`#wrapper-settings {display: flex !important} #social-empty {display: block !important;}`}</style>
                  )}
                  {isGlobal && (
                    <div className="flex min-w-0 items-center gap-[8px]">
                      <img
                        src={`/icons/platforms/${selectedIntegration?.integration.identifier}.png`}
                        alt=""
                        className="h-[18px] w-[18px] shrink-0 rounded-[4px]"
                      />
                      <div className="min-w-0 truncate text-[13px] font-[600] text-pqText">
                        {selectedIntegration?.integration.name}
                        {!!formatChannelHandle(
                          selectedIntegration?.integration.display
                        ) && (
                          <span className="ms-[6px] font-[400] text-pqMuted">
                            {formatChannelHandle(
                              selectedIntegration?.integration.display
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-[12px]">
                    {SettingsComponent && <SettingsComponent />}
                    {!!data?.internalPlugs?.length && !dummy && (
                      <InternalChannels plugs={data?.internalPlugs} />
                    )}
                  </div>
                </div>,
                document.querySelector('#social-settings') ||
                  document.createElement('div')
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
