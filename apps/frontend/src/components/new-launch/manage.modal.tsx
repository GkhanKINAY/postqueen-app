'use client';

import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PicksSocialsComponent } from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { EditorWrapper } from '@gitroom/frontend/components/new-launch/editor';
import { SelectCurrent } from '@gitroom/frontend/components/new-launch/select.current';
import { ShowAllProviders } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import { useShallow } from 'zustand/react/shallow';
import { RepeatComponent } from '@gitroom/frontend/components/launches/repeat.component';
import { ComposeNotify } from '@gitroom/frontend/components/new-launch/compose.notify';
import {
  PQ_NOTIFY_SETTING,
  postWantsPublishNotice,
} from '@gitroom/helpers/utils/post.publish.notice';
import { TagsComponent } from '@gitroom/frontend/components/launches/tags.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { SelectCustomer } from '@gitroom/frontend/components/launches/select.customer';
import { DummyCodeComponent } from '@gitroom/frontend/components/new-launch/dummy.code.component';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import {
  CloseIcon,
  TrashIcon,
} from '@gitroom/frontend/components/ui/icons';
import { useHasScroll } from '@gitroom/frontend/components/ui/is.scroll.hook';
import { useShortlinkPreference } from '@gitroom/frontend/components/settings/shortlink-preference.component';
import dayjs from 'dayjs';
import { Button } from '@gitroom/react/form/button';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useClickOutside } from '@mantine/hooks';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { Spinner } from '@gitroom/react/ui/spinner';

export const ManageModal: FC<AddEditModalProps> = (props) => {
  const t = useT();
  const fetch = useFetch();
  const { touch } = useViewport();
  const [composerPane, setComposerPane] = useState<'edit' | 'preview'>('edit');
  const ref = useRef(null);
  const existingData = useExistingData();
  const [loading, setLoading] = useState(false);
  const [postNowOpen, setPostNowOpen] = useState(false);
  const [notifyOnPublish, setNotifyOnPublish] = useState(() =>
    postWantsPublishNotice(existingData.settings)
  );
  const toaster = useToaster();
  const { dropPostGroupFromView } = useCalendar();
  const modal = useModals();
  const { formatShortWeekdayTime } = useDateFormat();
  const { data: shortlinkPreferenceData } = useShortlinkPreference();
  // Footer overflow-y-hidden clips absolute menus; fixed popover escapes it.
  const { referenceRef: postNowRef, floatingRef: postNowMenuRef } =
    useAnchoredPopover<HTMLDivElement, HTMLDivElement>(postNowOpen, 'end', {
      offsetPx: 10,
      placement: 'top-end',
    });
  const postNowClickRef = useClickOutside(() => {
    if (postNowOpen) {
      setPostNowOpen(false);
    }
  });

  const { addEditSets, mutate, customClose, dummy } = props;

  const {
    selectedIntegrations,
    hide,
    date,
    setDate,
    repeater,
    setRepeater,
    tags,
    setTags,
    integrations,
    setSelectedIntegrations,
    locked,
    current,
    activateExitButton,
    setHide,
  } = useLaunchStore(
    useShallow((state) => ({
      hide: state.hide,
      setHide: state.setHide,
      date: state.date,
      setDate: state.setDate,
      current: state.current,
      repeater: state.repeater,
      setRepeater: state.setRepeater,
      tags: state.tags,
      setTags: state.setTags,
      selectedIntegrations: state.selectedIntegrations,
      integrations: state.integrations,
      setSelectedIntegrations: state.setSelectedIntegrations,
      locked: state.locked,
      activateExitButton: state.activateExitButton,
    }))
  );

  const hasChannels = selectedIntegrations.length > 0;
  // First paint of an existing post must not slide the preview in. Enable
  // width transitions only after mount so a new post's first channel pick
  // still animates.
  const [railMotion, setRailMotion] = useState(false);
  useEffect(() => {
    setRailMotion(true);
  }, []);

  useEffect(() => {
    if (hide) {
      setHide(false);
    }
  }, [hide]);

  const changeCustomer = useCallback(
    (customer: string) => {
      const neededIntegrations = integrations.filter(
        (p) => p?.customer?.id === customer
      );
      setSelectedIntegrations(
        neededIntegrations.map((p) => ({
          settings: {},
          selectedIntegrations: p,
        }))
      );
    },
    [integrations]
  );

  const askClose = useCallback(async () => {
    if (!activateExitButton || dummy) {
      return;
    }

    if (
      await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('yes_close_it', 'Yes, close it!'),
        undefined,
        undefined,
        false
      )
    ) {
      if (customClose) {
        customClose();
        return;
      }
      modal.closeAll();
    }
  }, [activateExitButton, dummy]);

  const deletePost = useCallback(async () => {
    setLoading(true);
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_delete_post',
          'Are you sure you want to delete this post?'
        ),
        t('yes_delete_it', 'Yes, delete it!')
      ))
    ) {
      setLoading(false);
      return;
    }
    // customFetch resolves on 4xx/5xx, so an unchecked delete closed the editor
    // and refreshed the calendar as if the post were gone — it was still there,
    // and reappeared on the next load.
    const response = await fetch(`/posts/${existingData.group}`, {
      method: 'DELETE',
    });

    if (!response?.ok) {
      setLoading(false);
      toaster.show(
        t('post_delete_failed', 'Could not delete this post, please try again'),
        'warning'
      );
      return;
    }

    dropPostGroupFromView(existingData.group);
    mutate();
    modal.closeAll();
    return;
  }, [existingData, mutate, modal, toaster, t, dropPostGroupFromView]);

  const schedule = useCallback(
    (type: 'draft' | 'now' | 'schedule' | 'update') => async () => {
      let republish = false;
      if (
        (type === 'now' || type === 'schedule') &&
        (existingData?.posts?.[0]?.state === 'PUBLISHED' ||
          (existingData?.posts?.[0]?.state === 'QUEUE' &&
            dayjs().isAfter(date.utc())))
      ) {
        const channels = selectedIntegrations
          .map((p) => p.integration.name)
          .join(', ');
        const isRecurring =
          !!repeater || !!existingData?.posts?.[0]?.intervalInDays;

        const whatToDo = await new Promise((resolve) => {
          modal.openModal({
            title: t('what_do_you_want_to_do', 'What do you want to do?'),
            children: (
              <div className="flex flex-col">
                <div className="text-[20px] mb-[20px]">
                  {t(
                    'post_already_published_republish_warning',
                    'This post was already published. Republishing will publish it again to'
                  )}{' '}
                  {channels} {t('republish_at', 'at')}{' '}
                  {date.format('DD/MM/YYYY HH:mm')}.
                  {isRecurring && (
                    <div className="mt-[10px]">
                      {t(
                        'republish_recurring_note',
                        'This is a recurring post: your changes apply to all future recurrences starting now.'
                      )}
                    </div>
                  )}
                </div>
                <div className="flex w-full gap-[10px]">
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('update')}
                    >
                      {t(
                        'just_update_post_details',
                        'Just update the post details'
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('republish')}
                    >
                      {t('republish_the_post', 'Republish the post')}
                    </Button>
                  </div>
                </div>
              </div>
            ),
          });
        });

        if (whatToDo === 'update') {
          type = 'update';
        }

        if (whatToDo === 'republish') {
          republish = true;
        }
      }

      setLoading(true);

      // Backstop for everything below. `schedule` is wired straight to onClick,
      // so any throw was an unhandled rejection that left `loading` true — and
      // with it every submit button disabled, trapping an unsaved post. The
      // guards above handle the known cases; this catches the rest.
      // `saved` marks the point after which the post exists server-side, so the
      // catch can tell "failed" from "succeeded then stumbled".
      let saved = false;
      try {
      // Pull the local values to build the payload, but rely on the server
      // (`/posts/valid`) for the actual validation — checkValidity now lives
      // server-side so it can't be bypassed.
      const allValues = await ref.current.getAllValues();

      const integrationById = (id: string) =>
        selectedIntegrations.find((p) => p.integration.id === id);

      const channelToastLabel = (item: {
        id: string;
        identifier?: string;
        name?: string;
      }) =>
        channelNameWithHandle({
          name: integrationById(item.id)?.integration.name || item.name,
          display: integrationById(item.id)?.integration.display,
        }) || item.identifier || '';

      const group = existingData.group || makeId(10);

      const posts = allValues.map((post: any) => ({
        integration: {
          id: post.id,
        },
        group,
        settings: {
          ...(post.settings || {}),
          [PQ_NOTIFY_SETTING]: notifyOnPublish,
        },
        value: post.values.map((value: any) => ({
          ...(value.id ? { id: value.id } : {}),
          content: value.content,
          delay: value.delay || 0,
          image:
            (value?.media || []).map(
              ({ id, path, alt, thumbnail, thumbnailTimestamp }: any) => ({
                id,
                path,
                alt,
                thumbnail,
                thumbnailTimestamp,
              })
            ) || [],
        })),
      }));

      if (!dummy) {
        const validResponse = await fetch('/posts/valid', {
          method: 'POST',
          body: JSON.stringify({ type, posts }),
        });

        // customFetch resolves on 4xx/5xx, so this used to hand a Nest error
        // object to `.filter` below. That threw out of an un-caught click
        // handler and left `loading` true forever — every submit button is
        // disabled on it, so the user's unsaved post was sealed inside a modal
        // with no close button.
        const checkAllValid = validResponse.ok
          ? await validResponse.json().catch((): null => null)
          : null;

        if (!Array.isArray(checkAllValid)) {
          setLoading(false);
          toaster.show(
            t('post_validation_failed', 'Could not check the post, please try again'),
            'warning'
          );
          return;
        }

        const focus = (id: string, where: 'fix' | 'preview') => {
          integrationById(id)?.ref?.current?.[where]?.();
        };

        const notEnoughChars = checkAllValid.filter((p: any) => p.emptyContent);

        for (const item of notEnoughChars) {
          toaster.show(
            `${channelToastLabel(item)}: ` +
              t(
                'post_needs_content_or_image',
                'Your post should have at least one character or one image.'
              ),
            'warning'
          );
          setLoading(false);
          focus(item.id, 'preview');
          return;
        }

        if (type !== 'draft') {
          for (const item of checkAllValid) {
            if (item.valid === false) {
              toaster.show(
                `${channelToastLabel(item)}: ${
                  item.settingsError ||
                  t('please_fix_your_settings', 'Please fix your settings')
                }`,
                'warning'
              );
              focus(item.id, 'fix');
              setLoading(false);
              document
                .getElementById('wrapper-settings')
                ?.scrollIntoView({ block: 'nearest' });
              return;
            }

            if (item.errors !== true) {
              toaster.show(
                `${channelToastLabel(item)}: ${item.errors}`,
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              return;
            }

            if (item.tooLong) {
              toaster.show(
                `${channelToastLabel(item)} ${t(
                  'post_is_too_long',
                  'post is too long, please fix it'
                )}`,
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              return;
            }
          }
        }
      }

      const shortlinkPreference = shortlinkPreferenceData?.shortlink || 'ASK';

      let shortLink = false;

      if (!dummy && shortlinkPreference !== 'NO') {
        const shortLinkResponse = await fetch('/posts/should-shortlink', {
          method: 'POST',
          body: JSON.stringify({
            messages: allValues
              // platforms that remove links won't keep shortlinks either
              .filter(
                (p: any) => !integrationById(p.id)?.integration?.stripLinks
              )
              .flatMap((p: any) => p.values.flatMap((a: any) => a.content)),
          }),
        });

        // Same shape as `/posts/valid` above. Shortlinking is an optional
        // nicety, so a failure here must not block the save — fall through
        // with `ask: false` rather than stranding the post.
        const shortLinkUrl = shortLinkResponse.ok
          ? await shortLinkResponse.json().catch(() => ({}))
          : {};

        if (shortLinkUrl?.ask) {
          if (shortlinkPreference === 'YES') {
            // Automatically shortlink without asking
            shortLink = true;
          } else {
            // ASK: Show the dialog
            shortLink = await deleteDialog(
              t(
                'shortlink_urls_question',
                'Do you want to shortlink the URLs? it will let you get statistics over clicks'
              ),
              t('yes_shortlink_it', 'Yes, shortlink it!'),
              undefined,
              t('no_original_urls', 'No, original URLs')
            );
          }
        }
      }

      const data = {
        type,
        ...(republish ? { republish } : {}),
        ...(repeater ? { inter: repeater } : {}),
        tags,
        shortLink,
        date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
        posts,
      };

      if (dummy) {
        modal.openModal({
          title: '',
          children: <DummyCodeComponent code={data} />,
          classNames: {
            modal: 'w-[100%] bg-transparent text-textColor',
          },
          size: '100%',
          withCloseButton: false,
          closeOnEscape: true,
          closeOnClickOutside: true,
        });

        setLoading(false);
      }

      if (!dummy) {
        const response = addEditSets
          ? (addEditSets(data), undefined)
          : await fetch('/posts', {
              method: 'POST',
              body: JSON.stringify(data),
            });

        // The result used to be discarded, so a rejected save — over the monthly
        // post cap, or failing server-side validation — still showed "Added
        // successfully" and closed the editor, losing everything the user wrote.
        if (response && !response.ok) {
          // The body is a Nest error object; showing it raw put
          // {"statusCode":400,...} in front of the user.
          const reason = await response
            .json()
            .then((body) => body?.message)
            .catch(() => '');

          setLoading(false);
          toaster.show(
            typeof reason === 'string' && reason
              ? reason
              : t('post_save_failed', 'Could not save the post, please try again'),
            'warning'
          );
          return;
        }

        // Past this line the post exists on the server (or the set callback has
        // been handed the data), so no later failure may be reported as one.
        saved = true;

        if (!addEditSets) {
          mutate();
          if (type === 'draft') {
            toaster.show(
              t('saved_as_draft', 'Saved as draft'),
              'success'
            );
          } else if (type === 'schedule') {
            toaster.show(
              t('scheduled_for_when', 'Scheduled for {when}').replace(
                '{when}',
                formatShortWeekdayTime(date.local())
              ),
              'success'
            );
          } else if (type === 'now') {
            toaster.show(
              t('publishing_now', 'Publishing now…'),
              'success'
            );
          } else {
            toaster.show(
              !existingData.integration
                ? t('added_successfully', 'Added successfully')
                : t('updated_successfully', 'Updated successfully')
            );
          }
        }
        if (customClose) {
          setTimeout(() => {
            customClose();
          }, 2000);
        }

        if (!addEditSets) {
          modal.closeAll();
        }
      }
      } catch (e) {
        // Keep this reachable in the console / Sentry: before the try existed
        // these were unhandled rejections, which at least got reported.
        console.error(e);
        setLoading(false);

        // Everything from the toasts down runs AFTER the post is already saved.
        // A throw there (mutate, date formatting) must not say "went wrong" and
        // leave the composer open — the user would submit again and, because a
        // new post mints a fresh `group`, get a duplicate.
        if (saved) {
          if (!addEditSets) {
            modal.closeAll();
          }
          return;
        }

        toaster.show(
          t('something_went_wrong', 'Something went wrong'),
          'warning'
        );
      }
    },
    [
      ref,
      repeater,
      tags,
      date,
      addEditSets,
      dummy,
      shortlinkPreferenceData,
      toaster,
      t,
      notifyOnPublish,
    ]
  );

  return (
    <div
      data-pq="composer-shell"
      className={clsx(
        'relative flex h-full w-full flex-1',
        touch ? 'p-0' : 'items-center justify-center p-[24px]'
      )}
    >
      <div
        data-pq="composer-card"
        className={clsx(
          'flex flex-col overflow-hidden bg-pqInner shadow-pq',
          // Empty: compact channel picker. After a channel is picked: compose
          // studio with a 440px preview rail. Phone/tablet stay full-bleed.
          touch
            ? 'h-full w-full min-h-0 flex-1 rounded-none'
            : clsx(
                'w-full rounded-[24px]',
                railMotion &&
                  'motion-safe:transition-[max-width] motion-safe:duration-[380ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
                hasChannels
                  ? 'h-[calc(100dvh-48px)] max-w-[min(1440px,calc(100vw-48px))]'
                  : 'max-h-[calc(100dvh-48px)] max-w-[min(720px,calc(100vw-48px))]'
              )
        )}
      >
        <div
          className={clsx(
            'flex min-h-0 flex-1',
            // Phone/tablet: Edit | Preview tabs. Preview fills leftover height.
            touch ? 'flex-col' : 'flex-row overflow-hidden'
          )}
        >
          <div
            className={clsx(
              'flex min-h-0 flex-1 flex-col',
              !touch && hasChannels && 'border-e border-pqBorder',
              touch && composerPane !== 'edit' && 'hidden'
            )}
          >
            <div className="flex h-[56px] items-center gap-[12px] rounded-ss-[24px] border-b border-pqLine bg-pqBg px-[24px] font-display text-[18px] font-[600] -tracking-[0.015em] text-pqText mobile:rounded-none">
              {existingData?.integration
                ? t('edit_post_title', 'Edit Post')
                : t('create_post_title', 'Create Post')}
              <CreationMethodBadge
                creationMethod={existingData?.posts?.[0]?.creationMethod}
                size="sm"
              />
              <div className="ms-auto flex items-center gap-[8px]">
                {!dummy && (
                  <TagsComponent
                    name="tags"
                    label={t('tags', 'Tags')}
                    menuPlacement="bottom-start"
                    initial={tags}
                    onChange={(e) => {
                      setTags(e.target.value);
                    }}
                  />
                )}
                {touch && hasChannels && (
                  <div className="flex gap-[4px] rounded-pqSm bg-pqSettings p-[2px]">
                    <button
                      type="button"
                      onClick={() => setComposerPane('edit')}
                      className={clsx(
                        'h-[44px] min-w-[44px] rounded-[6px] px-[12px] text-[12.5px] font-[600]',
                        composerPane === 'edit'
                          ? 'bg-pqInner text-pqText shadow-pqE1'
                          : 'text-pqSoft'
                      )}
                    >
                      {t('edit', 'Edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerPane('preview')}
                      className={clsx(
                        'h-[44px] min-w-[44px] rounded-[6px] px-[12px] text-[12.5px] font-[600]',
                        composerPane === 'preview'
                          ? 'bg-pqInner text-pqText shadow-pqE1'
                          : 'text-pqSoft'
                      )}
                    >
                      {t('preview', 'Preview')}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={askClose}
                  aria-label={t('close', 'Close')}
                  className="grid size-[44px] place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar scrollbar-thumb-pqColColor scrollbar-track-pqInner">
              <div>
                <div
                  id="social-content"
                  className="flex flex-col gap-[20px] pe-[8px] ps-[24px] pt-[20px]"
                >
                  <div className={clsx(
                    'flex w-full items-start gap-[16px]',
                    touch && 'flex-col'
                  )}>
                    <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
                      <div className="flex items-center gap-[8px]">
                        <span className="text-[11px] font-[700] uppercase tracking-[0.06em] text-pqSoft">
                          {t('select_channels', 'Select channels')}
                        </span>
                        <span className="rounded-full bg-pqInner px-[8px] py-[2px] text-[11px] font-[600] text-pqMuted shadow-[inset_0_0_0_1px_var(--border)]">
                          {selectedIntegrations.length === 0
                            ? t('none_yet', 'none yet')
                            : selectedIntegrations.length === 1
                            ? t('one_selected', '1 selected')
                            : t('n_selected', '{{count}} selected', {
                                count: selectedIntegrations.length,
                              })}
                        </span>
                      </div>
                      <PicksSocialsComponent toolTip={true} />
                    </div>
                    <div>
                      {!dummy && (
                        <SelectCustomer
                          onChange={changeCustomer}
                          integrations={integrations}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-[6px]">
                    {!hasChannels && (
                      <div
                        data-pq="composer-empty"
                        className="flex flex-col items-center justify-center px-[16px] py-[48px] text-center"
                      >
                        <p className="text-[14px] leading-[1.5] text-pqMuted">
                          {t(
                            'select_a_channel_to_create_a_post',
                            'Select a channel to create a post.'
                          )}
                        </p>
                      </div>
                    )}
                    <div className={clsx(!hasChannels && 'hidden')}>
                      <SelectCurrent />
                    </div>
                    <div className={clsx('flex w-full min-w-0', !hasChannels && 'hidden')}>
                      {!hide && <EditorWrapper totalPosts={1} value="" />}
                    </div>
                    <div
                      id="wrapper-settings"
                      data-pq="composer-settings"
                      role="region"
                      aria-label={t('channel_settings', 'Channel settings')}
                      className={clsx(
                        'flex flex-col',
                        !hasChannels && 'hidden'
                      )}
                    >
                      <span className="sr-only">
                        {t(
                          'channel_settings_hint',
                          'Per network — title, tags, audience, and more'
                        )}
                      </span>
                      <div
                        id="social-settings"
                        className="flex flex-col gap-[16px] text-[14px] font-[500] text-pqText"
                      />
                      <style>
                        {`#social-settings [data-id="${current}"] {display: block !important;}`}
                      </style>
                    </div>
                    <div
                      id="social-empty"
                      className="pb-[8px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            data-pq="composer-preview"
            className={clsx(
              'flex flex-col overflow-hidden bg-pqBg',
              touch
                ? clsx(
                    'w-full min-h-0 flex-1',
                    (composerPane !== 'preview' || !hasChannels) && 'hidden'
                  )
                : clsx(
                    'shrink-0',
                    railMotion &&
                      'motion-safe:transition-[width,opacity] motion-safe:duration-[380ms] motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
                    hasChannels
                      ? 'w-[440px] shrink-0 bg-pqBg opacity-100'
                      : 'pointer-events-none w-0 min-w-0 max-w-0 flex-none opacity-0'
                  )
            )}
          >
            <div
              className={clsx(
                'flex h-[56px] items-center border-b border-pqLine bg-pqBg px-[20px] font-display text-[18px] font-[600] -tracking-[0.015em] text-pqText mobile:rounded-none',
                !touch && 'rounded-se-[24px]'
              )}
            >
              <div className="flex-1">{t('post_preview', 'Post Preview')}</div>
              {touch && (
                <div className="me-[8px] flex gap-[4px] rounded-pqSm bg-pqSettings p-[2px]">
                  <button
                    type="button"
                    onClick={() => setComposerPane('edit')}
                    className={clsx(
                      'h-[44px] min-w-[44px] rounded-[6px] px-[12px] text-[12.5px] font-[600]',
                      composerPane === 'edit'
                        ? 'bg-pqInner text-pqText shadow-pqE1'
                        : 'text-pqSoft'
                    )}
                  >
                    {t('edit', 'Edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerPane('preview')}
                    className={clsx(
                      'h-[44px] min-w-[44px] rounded-[6px] px-[12px] text-[12.5px] font-[600]',
                      composerPane === 'preview'
                        ? 'bg-pqInner text-pqText shadow-pqE1'
                        : 'text-pqSoft'
                    )}
                  >
                    {t('preview', 'Preview')}
                  </button>
                </div>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              <Scrollable
                scrollClasses="!pe-[16px]"
                className="absolute left-0 top-0 h-full w-full overflow-x-hidden overflow-y-scroll p-[16px] pe-[8px] scrollbar scrollbar-thumb-pqColColor scrollbar-track-pqBg"
              >
                <ShowAllProviders ref={ref} />
              </Scrollable>
            </div>
          </div>
        </div>
        <div
          data-pq="composer-footer"
          className={clsx(
            'flex min-w-0 select-none border-t border-pqBorder bg-pqBg pb-[max(12px,env(safe-area-inset-bottom))]',
            'max-[1179px]:flex-col max-[1179px]:gap-[10px] max-[1179px]:overflow-x-hidden max-[1179px]:px-[16px] max-[1179px]:py-[12px]',
            touch
              ? 'flex-col gap-[10px] overflow-x-hidden px-[16px] py-[12px]'
              : 'items-center overflow-x-auto overflow-y-hidden px-[20px] py-[12px] scrollbar scrollbar-thumb-pqBorder scrollbar-track-transparent min-[1180px]:flex-row'
          )}
        >
          <div
            className={clsx(
              'min-w-0 gap-[8px]',
              'max-[1179px]:grid max-[1179px]:w-full max-[1179px]:grid-cols-2',
              touch
                ? 'grid w-full grid-cols-2'
                : 'flex flex-1 items-end gap-[12px] min-[1180px]:flex'
            )}
          >
            <div className={clsx('min-w-0', touch ? 'w-full' : 'shrink-0')}>
              <div className="mb-[4px] text-[11px] font-[700] uppercase tracking-[0.06em] text-pqSoft">
                {t('when_to_post', 'When to post')}
              </div>
              <DatePicker
                onChange={setDate}
                date={date}
                className="max-[1179px]:!ml-0 max-[1179px]:w-full max-[1179px]:!flex-none"
              />
            </div>
            {!dummy && (
              <div
                className={clsx(
                  'min-w-0',
                  touch ? 'w-full [&>*]:w-full self-end' : 'shrink-0'
                )}
              >
                <RepeatComponent repeat={repeater} onChange={setRepeater} />
              </div>
            )}
            {!dummy && (
              <div
                className={clsx(
                  'min-w-0',
                  touch ? 'w-full [&>*]:w-full self-end' : 'shrink-0'
                )}
              >
                <ComposeNotify
                  notify={notifyOnPublish}
                  onChange={setNotifyOnPublish}
                />
              </div>
            )}
          </div>
          <div
            data-pq="composer-publish"
            className={clsx(
              'flex min-w-0 items-center justify-end gap-[8px]',
              'max-[1179px]:w-full max-[1179px]:flex-col',
              touch ? 'w-full flex-col' : 'shrink-0'
            )}
          >
            {existingData?.integration && (
              <button
                onClick={deletePost}
                className="cursor-pointer flex text-pqWarn gap-[8px] items-center text-[15px] font-[600]"
              >
                <div>
                  <TrashIcon />
                </div>
                <div>{t('delete_post', 'Delete Post')}</div>
              </button>
            )}
            <div
              className={clsx(
                'flex min-w-0 items-center justify-end gap-[8px]',
                'max-[1179px]:w-full',
                touch && 'w-full'
              )}
            >
            {!addEditSets && (
              <button
                disabled={
                  selectedIntegrations.length === 0 || loading || locked
                }
                onClick={schedule('draft')}
                className={clsx(
                  'relative flex cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-pqBorder bg-pqInner text-[13px] font-[600] text-pqText transition-colors hover:bg-pqHover disabled:cursor-not-allowed',
                  'max-[1179px]:h-[44px] max-[1179px]:min-w-0 max-[1179px]:flex-1 max-[1179px]:px-[12px]',
                  touch
                    ? 'h-[44px] min-w-0 flex-1 px-[12px]'
                    : 'h-[42px] px-[16px]'
                )}
              >
                {loading && (
                  <div className="absolute left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] text-textColor">
                    <Spinner width={20} height={20} />
                  </div>
                )}
                <div
                  className={clsx(
                    'min-w-0 truncate whitespace-nowrap',
                    loading && 'invisible'
                  )}
                >
                  {t('save_as_draft', 'Save as Draft')}
                </div>
              </button>
            )}
            {addEditSets && (
              <button
                className={clsx(
                  'btnSub flex items-center justify-center gap-[8px] rounded-[10px] bg-pqBrand text-[14px] font-[600] text-white outline-none disabled:cursor-not-allowed disabled:opacity-80',
                  touch
                    ? 'h-[44px] min-w-0 flex-1 px-[12px]'
                    : 'h-[42px] min-w-[168px] px-[18px]'
                )}
                disabled={
                  selectedIntegrations.length === 0 || loading || locked
                }
                onClick={schedule('draft')}
              >
                Save Set
              </button>
            )}
            {!addEditSets && (
              <div className={clsx('relative', touch && 'flex min-w-0 flex-1')} ref={postNowClickRef}>
                <div className={clsx('flex min-w-0', touch && 'w-full')} ref={postNowRef}>
                  <button
                    type="button"
                    disabled={
                      selectedIntegrations.length === 0 || loading || locked
                    }
                    onClick={schedule('schedule')}
                    className={clsx(
                      'btnSub relative flex min-w-0 items-center justify-center overflow-hidden rounded-s-[10px] bg-pqBrand text-[14px] font-[600] text-white outline-none disabled:cursor-not-allowed disabled:opacity-80',
                      'max-[1179px]:h-[44px] max-[1179px]:flex-1 max-[1179px]:px-[12px] max-[1179px]:min-w-0',
                      touch
                        ? 'h-[44px] min-w-0 flex-1 px-[12px]'
                        : 'h-[42px] min-w-[168px] px-[18px]'
                    )}
                  >
                    {loading && (
                      <div className="absolute left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] text-white">
                        <Spinner width={20} height={20} />
                      </div>
                    )}
                    <span
                      className={clsx(
                        'min-w-0 truncate whitespace-nowrap',
                        loading && 'invisible'
                      )}
                    >
                      {selectedIntegrations.length === 0
                        ? t('select_channels', 'Select channels')
                        : dummy
                        ? t('create_output', 'Create output')
                        : !existingData?.integration
                        ? t('add_to_calendar', 'Add to calendar')
                        : existingData?.posts?.[0]?.state === 'DRAFT'
                        ? t('schedule', 'Schedule')
                        : t('update', 'Update')}
                    </span>
                  </button>
                  {!dummy && (
                    <button
                      type="button"
                      disabled={
                        selectedIntegrations.length === 0 || loading || locked
                      }
                      onClick={() => setPostNowOpen((v) => !v)}
                      aria-label={t('more', 'More')}
                      data-tooltip-id="tooltip"
                      data-tooltip-content={t('more', 'More')}
                      className={clsx(
                        'grid w-[38px] shrink-0 place-items-center rounded-e-[10px] bg-pqBrand text-white shadow-[inset_1px_0_0_rgba(255,255,255,.24)] outline-none disabled:cursor-not-allowed disabled:opacity-80',
                        touch ? 'h-[44px]' : 'h-[42px]'
                      )}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        className="opacity-65"
                      >
                        <path
                          d="m6 9 6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {!dummy && postNowOpen && (
                  <div
                    ref={postNowMenuRef}
                    className="z-[300] w-[206px] rounded-[8px] border border-pqBorder bg-pqInner p-[12px] shadow-pq"
                  >
                    <button
                      type="button"
                      onClick={schedule('now')}
                      disabled={
                        selectedIntegrations.length === 0 || loading || locked
                      }
                      className="post-now flex h-[44px] w-full items-center justify-center rounded-[8px] bg-pqPink text-[15px] font-[600] text-white disabled:cursor-not-allowed disabled:opacity-80"
                    >
                      {t('post_now', 'Post Now')}
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Scrollable: FC<{
  className: string;
  scrollClasses: string;
  children: ReactNode;
}> = ({ className, scrollClasses, children }) => {
  const ref = useRef(undefined);
  const hasScroll = useHasScroll(ref);
  return (
    <div className={clsx(className, hasScroll && scrollClasses)} ref={ref}>
      {children}
    </div>
  );
};
