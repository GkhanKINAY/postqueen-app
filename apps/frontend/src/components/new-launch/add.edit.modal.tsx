'use client';
import 'reflect-metadata';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import dayjs from 'dayjs';
import { FC, useEffect } from 'react';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { ChannelsPageEmpty } from '@gitroom/frontend/components/ui/no-channels-art';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export interface AddEditModalProps {
  dummy?: boolean;
  date: dayjs.Dayjs;
  integrations: Integrations[];
  allIntegrations?: Integrations[];
  selectedChannels?: string[];
  set?: any;
  focusedChannel?: string;
  addEditSets?: (data: any) => void;
  reopenModal: () => void;
  mutate: () => void;
  padding?: string;
  customClose?: () => void;
  onlyValues?: Array<{
    content: string;
    id?: string;
    image?: Array<{
      id: string;
      path: string;
    }>;
  }>;
}

export const AddEditModal: FC<AddEditModalProps> = (props) => {
  const { setAllIntegrations, setDate, setIsCreateSet, setDummy } =
    useLaunchStore(
      useShallow((state) => ({
        setAllIntegrations: state.setAllIntegrations,
        setDate: state.setDate,
        setIsCreateSet: state.setIsCreateSet,
        setDummy: state.setDummy,
      }))
    );
  const modal = useModals();
  const t = useT();

  const integrations = useLaunchStore((state) => state.integrations);
  useEffect(() => {
    setDummy(!!props.dummy);
    setDate(props.date || newDayjs());
    setAllIntegrations(props.allIntegrations || []);
    setIsCreateSet(!!props.addEditSets);
  }, []);

  if (!integrations.length) {
    // The store is hydrated by the effect above, so the first render is always
    // empty. Keep rendering nothing for that frame when channels *are* coming.
    // Test `allIntegrations` specifically — it is the only prop the effect
    // feeds the store, so an empty one means the store stays empty for good.
    if (props.allIntegrations?.length) {
      return null;
    }

    // Genuinely no channels. Callers should route to Add Channel before
    // reaching here, but this modal opens with `removeLayout` + no close
    // button, so it must never render a dead full-screen overlay.
    // `closeAll` (not `closeCurrent`) — the `removeLayout` branch of the modal
    // shell does not provide `CurrentModalContext`, so `closeCurrent` no-ops.
    return (
      <div className="flex flex-1 items-center justify-center bg-pqInner">
        <ChannelsPageEmpty
          action={
            <button
              type="button"
              onClick={() =>
                props.customClose ? props.customClose() : modal.closeAll()
              }
              className="mt-[4px] h-[34px] rounded-pqSm bg-pqBrand px-[14px] text-[13px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover"
            >
              {t('close', 'Close')}
            </button>
          }
        />
      </div>
    );
  }

  return <AddEditModalInner {...props} />;
};

export const AddEditModalInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const modal = useModals();
  const t = useT();
  const { addOrRemoveSelectedIntegration, selectedIntegrations, integrations } =
    useLaunchStore(
      useShallow((state) => ({
        integrations: state.integrations,
        selectedIntegrations: state.selectedIntegrations,
        addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      }))
    );

  // Seed and gate off the PROP, not the store. React runs child effects before
  // parent ones, so on the first commit `state.integrations` still holds
  // whatever the previous composer left there — the store is only cleared by
  // `AddEditModalInnerInner`'s unmount, which never runs if we bail out above.
  // Reading the prop makes both the seeding below and the "channel is gone"
  // check independent of hydration order.
  const sourceIntegrations = props.allIntegrations?.length
    ? props.allIntegrations
    : integrations;

  useEffect(() => {
    // A saved set, or a scheduled post, can reference a channel that has since
    // been deleted — `find` then returns undefined and the store seeds
    // `{ integration: undefined }`, which throws in select.current.tsx the
    // moment the composer renders. Guard both, exactly as the
    // `selectedChannels` loop below already does.
    if (props?.set?.posts?.length) {
      for (const post of props?.set?.posts) {
        if (post.integration) {
          const integration = sourceIntegrations.find(
            (i) => i.id === post.integration.id
          );
          if (integration) {
            addOrRemoveSelectedIntegration(integration, post.settings);
          }
        }
      }
    }

    if (existingData.integration) {
      const integration = sourceIntegrations.find(
        (i) => i.id === existingData.integration
      );
      if (integration) {
        addOrRemoveSelectedIntegration(integration, existingData.settings);
      }
    }

    if (props?.selectedChannels?.length) {
      for (const channel of props.selectedChannels) {
        const integration = sourceIntegrations.find((i) => i.id === channel);
        if (integration) {
          addOrRemoveSelectedIntegration(integration, {});
        }
      }
    }
  }, []);

  // The channel this post was written for no longer exists. Checked against the
  // prop for the reason above, so a stale store cannot make a live channel look
  // deleted. Without this the guarded effect leaves `selectedIntegrations` empty
  // and the `return null` below paints a dead full-screen overlay with no close
  // button.
  if (
    existingData.integration &&
    !sourceIntegrations.some((i) => i.id === existingData.integration)
  ) {
    return (
      <div className="flex flex-1 items-center justify-center bg-pqInner">
        <ChannelsPageEmpty
          title={t('post_channel_missing', 'This channel is gone')}
          description={t(
            'post_channel_missing_description',
            'The channel this post was written for has been removed, so it can no longer be edited here.'
          )}
          action={
            <button
              type="button"
              onClick={() =>
                props.customClose ? props.customClose() : modal.closeAll()
              }
              className="mt-[4px] h-[34px] rounded-pqSm bg-pqBrand px-[14px] text-[13px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover"
            >
              {t('close', 'Close')}
            </button>
          }
        />
      </div>
    );
  }

  // Still the one frame before the effect above seeds the selection.
  if (existingData.integration && selectedIntegrations.length === 0) {
    return null;
  }

  return <AddEditModalInnerInner {...props} />;
};

export const AddEditModalInnerInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const {
    reset,
    addGlobalValue,
    addInternalValue,
    global,
    setCurrent,
    internal,
    setTags,
    setEditor,
    setRepeater,
  } = useLaunchStore(
    useShallow((state) => ({
      reset: state.reset,
      addGlobalValue: state.addGlobalValue,
      addInternalValue: state.addInternalValue,
      setCurrent: state.setCurrent,
      global: state.global,
      internal: state.internal,
      setTags: state.setTags,
      setEditor: state.setEditor,
      setRepeater: state.setRepeater,
    }))
  );

  useEffect(() => {
    if (existingData.integration) {
      if (existingData?.posts?.[0]?.intervalInDays) {
        setRepeater(existingData.posts[0].intervalInDays);
      }
      setTags(
        // @ts-ignore
        existingData?.posts?.[0]?.tags?.map((p: any) => ({
          label: p.tag.name,
          value: p.tag.name,
        })) || []
      );
      addInternalValue(
        0,
        existingData.integration,
        existingData.posts.map((post) => ({
          delay: post.delay,
          content:
            post.content.indexOf('<p>') > -1
              ? post.content
              : post.content
                  .split('\n')
                  .map((line: string) => `<p>${line}</p>`)
                  .join(''),
          id: post.id,
          // @ts-ignore
          media: post.image as any[],
        }))
      );
      setCurrent(existingData.integration);
    } else {
      setEditor('normal');
    }

    if (props.focusedChannel) {
      setCurrent(props.focusedChannel);
    }

    addGlobalValue(
      0,
      props.onlyValues?.length
        ? props.onlyValues.map((p) => ({
            content:
              p.content.indexOf('<p>') > -1
                ? p.content
                : p.content
                    .split('\n')
                    .map((line: string) => `<p>${line}</p>`)
                    .join(''),
            id: makeId(10),
            media: p.image || [],
          }))
        : props.set?.posts?.length
        ? props.set.posts[0].value.map((p: any) => ({
            id: makeId(10),
            content:
              p.content.indexOf('<p>') > -1
                ? p.content
                : p.content
                    .split('\n')
                    .map((line: string) => `<p>${line}</p>`)
                    .join(''),
            // @ts-ignore
            media: p.media,
          }))
        : [
            {
              content: '',
              id: makeId(10),
              media: [],
            },
          ]
    );

    return () => {
      reset();
    };
  }, []);

  if (!global.length && !internal.length) {
    return null;
  }

  return (
    <ManageModal {...props} />
  );
};
