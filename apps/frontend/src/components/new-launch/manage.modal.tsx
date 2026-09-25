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
import {
  ComposePublishedAt,
  ComposeWhen,
} from '@gitroom/frontend/components/new-launch/compose.when';
import { ComposeNotify } from '@gitroom/frontend/components/new-launch/compose.notify';
import {
  PQ_NOTIFY_SETTING,
  postWantsPublishNotice,
} from '@gitroom/helpers/utils/post.publish.notice';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import { useShallow } from 'zustand/react/shallow';
import { RepeatComponent } from '@gitroom/frontend/components/launches/repeat.component';
import { TagsComponent } from '@gitroom/frontend/components/launches/tags.component';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { channelNameWithHandle } from '@gitroom/frontend/components/channels/channel-handle';
import { SelectCustomer } from '@gitroom/frontend/components/launches/select.customer';
import { DummyCodeComponent } from '@gitroom/frontend/components/new-launch/dummy.code.component';
import {
  ComposeAiAssistant,
  ComposeAiBindings,
  ComposeAiRail,
  CopilotMark,
  StudioRail,
  StudioRailProvider,
  StudioRailTabs,
  useComposerThread,
} from '@gitroom/frontend/components/new-launch/compose.ai.assistant';
import { PQ_AI_THREAD_SETTING } from '@gitroom/helpers/utils/copilot.context';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import {
  CloseIcon,
  ExpandIcon,
  CollapseIcon,
  TrashIcon,
  ChevronDownIcon,
  ScheduleIcon,
  SendIcon,
  DraftIcon,
  DuplicateIcon,
  RepeatIcon,
} from '@gitroom/frontend/components/ui/icons';
import { useHasScroll } from '@gitroom/frontend/components/ui/is.scroll.hook';
import { useShortlinkPreference } from '@gitroom/frontend/components/settings/shortlink-preference.component';
import dayjs from 'dayjs';
import { Button } from '@gitroom/react/form/button';
import {
  PQ_COMPOSER_SPLIT_MIN,
  useViewport,
} from '@gitroom/frontend/components/layout/use.viewport';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useClickOutside } from '@mantine/hooks';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { Spinner } from '@gitroom/react/ui/spinner';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

/** Side-by-side editor + preview once the viewport can hold a 420px preview. */
export const COMPOSER_SPLIT_MIN = PQ_COMPOSER_SPLIT_MIN;

export type ComposerPane = 'edit' | 'preview' | 'schedule';

const postHasPreviewableContent = (
  global: { content?: string; media?: unknown[] }[],
  internal: { integrationValue: { content?: string; media?: unknown[] }[] }[]
) => {
  const items = [...global, ...internal.flatMap((item) => item.integrationValue)];
  return items.some(
    (item) =>
      stripHtmlValidation('normal', item.content || '', true).trim().length >
        0 || (item.media?.length ?? 0) > 0
  );
};

const ComposerStepTabs: FC<{
  pane: ComposerPane;
  phone: boolean;
  onPane: (pane: ComposerPane) => void;
}> = ({ pane, phone, onPane }) => {
  const t = useT();
  const steps = (
    phone
      ? [
          ['edit', t('write', 'Write')],
          ['preview', t('preview', 'Preview')],
          ['schedule', t('schedule', 'Schedule')],
        ]
      : [
          ['edit', t('edit', 'Edit')],
          ['preview', t('preview', 'Preview')],
        ]
  ) as ReadonlyArray<readonly [ComposerPane, string]>;

  return (
    <div
      role="tablist"
      aria-label={t('create_post_title', 'Create Post')}
      className={clsx(
        'flex rounded-pqSm bg-pqSettings p-[2px]',
        phone && 'w-full'
      )}
    >
      {steps.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={pane === id}
          onClick={() => onPane(id)}
          className={clsx(
            'h-[44px] min-w-[44px] flex-1 rounded-[6px] px-[10px] text-[12.5px] font-[600]',
            pane === id ? 'bg-pqInner text-pqText shadow-pqE1' : 'text-pqSoft'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export const ManageModal: FC<AddEditModalProps> = (props) => {
  const t = useT();
  const fetch = useFetch();
  const { mobile, touch, splitComposer } = useViewport();
  const compactChrome = !splitComposer;
  const compactFooter = touch;
  const phoneFlow = mobile;
  const [composerPane, setComposerPane] = useState<ComposerPane>('edit');
  const [studioRail, setStudioRail] = useState<StudioRail>('assistant');
  const [maximized, setMaximized] = useState(false);
  // Desktop default: one right rail, AI Copilot first. Post Preview is
  // revealed once when text or media appears.
  // Full screen keeps write | preview | AI as three columns.
  const tabbedRail = !compactChrome && !maximized;
  const previewRevealedRef = useRef(false);
  const ref = useRef(null);
  const existingData = useExistingData();
  const copilotThread = useComposerThread();
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
  const { referenceRef: postNowRef, floatingRef: postNowMenuRef } =
    useAnchoredPopover<HTMLDivElement, HTMLDivElement>(postNowOpen, 'end', {
      offsetPx: 6,
      placement: 'top-end',
      matchWidth: true,
    });
  const postNowClickRef = useClickOutside(() => {
    if (postNowOpen) {
      setPostNowOpen(false);
    }
  });

  const { addEditSets, mutate, customClose, dummy, duplicatePost } = props;
  // A published post is already out there: Update would only rewrite our copy,
  // and the time is history. Offer Duplicate instead of scheduling controls.
  const publishedView =
    existingData?.posts?.[0]?.state === 'PUBLISHED' && !!duplicatePost;

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
    global,
    internal,
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
      global: state.global,
      internal: state.internal,
    }))
  );

  const hasChannels = selectedIntegrations.length > 0;
  const setRail = useCallback(
    (rail: StudioRail) => {
      setStudioRail(rail);
      if (compactChrome && rail === 'assistant') {
        setComposerPane('preview');
      }
    },
    [compactChrome]
  );

  useEffect(() => {
    if (hide) {
      setHide(false);
    }
  }, [hide]);

  useEffect(() => {
    if (previewRevealedRef.current || !hasChannels) {
      return;
    }
    if (!postHasPreviewableContent(global, internal)) {
      return;
    }
    previewRevealedRef.current = true;
    setStudioRail('preview');
  }, [global, internal, hasChannels]);

  useEffect(() => {
    if (!hasChannels && composerPane !== 'edit') {
      setComposerPane('edit');
    }
  }, [hasChannels, composerPane]);

  // Schedule is a phone-only column. Leaving the mobile bucket while that
  // pane is selected would hide both Edit and Preview with nothing to show.
  useEffect(() => {
    if (!phoneFlow && composerPane === 'schedule') {
      setComposerPane('edit');
    }
  }, [phoneFlow, composerPane]);

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

    // Nothing picked and nothing written: there is no data to lose, so the
    // confirmation would only be in the way.
    const nothingToLose =
      selectedIntegrations.length === 0 &&
      !postHasPreviewableContent(global, internal);

    if (
      nothingToLose ||
      (await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('yes_close_it', 'Yes, close it!'),
        undefined,
        undefined,
        false
      ))
    ) {
      if (customClose) {
        customClose();
        return;
      }
      modal.closeAll();
    }
  }, [activateExitButton, dummy, selectedIntegrations, global, internal]);

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

  // Once a repeating post has published, the view offers Duplicate only, so
  // without this the one way to stop the repeats was to delete the post.
  const repeating =
    publishedView && !!existingData?.posts?.[0]?.intervalInDays;

  const stopRepeating = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'stop_repeating_confirm',
          'It will not be posted again. Everything it already published stays published.'
        ),
        t('stop_repeating', 'Stop repeating'),
        t('stop_repeating_title', 'Stop repeating this post?'),
        undefined,
        false
      ))
    ) {
      return;
    }
    setLoading(true);
    const response = await fetch(`/posts/${existingData.group}/repeat`, {
      method: 'DELETE',
    });
    setLoading(false);

    if (!response.ok) {
      const { message } = await response
        .json()
        .catch(() => ({ message: '' }));
      toaster.show(
        message ||
          t(
            'stop_repeating_failed',
            'Could not stop this post from repeating, please try again'
          ),
        'warning'
      );
      return;
    }

    toaster.show(
      t('stop_repeating_done', 'This post no longer repeats'),
      'success'
    );
    mutate();
    modal.closeAll();
  }, [existingData, fetch, mutate, modal, toaster, t]);

  // Carry what is in the editor, so edits made here are not dropped. If the
  // values cannot be read, the duplicate falls back to the saved post.
  // The composer modal holds the fixed id `add-edit-modal`, and openModal
  // ignores an id that is already open, so this one has to close first.
  const openDuplicate = useCallback(async () => {
    const allValues = await ref.current?.getAllValues?.().catch((): null => null);
    const first = allValues?.[0];
    modal.closeAll();
    duplicatePost?.(
      first?.values?.map((value: any) => ({
        content: value.content,
        image: value.media || [],
        settings: first.settings,
      }))
    );
  }, [modal, duplicatePost]);

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
      const publishAt = date;
      // Pull the local values to build the payload, but rely on the server
      // (`/posts/valid`) for the actual validation — checkValidity now lives
      // server-side so it can't be bypassed.
      const allValues = await ref.current?.getAllValues?.();
      if (!allValues) {
        setLoading(false);
        toaster.show(
          t('something_went_wrong', 'Something went wrong'),
          'warning'
        );
        return;
      }

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

      // The Copilot thread this post was written with, kept like the notify
      // flag so reopening the draft brings the chat back. Only once the chat
      // was used, and never for Sets or the standalone JSON mode.
      const copilotThreadSetting =
        !addEditSets && !dummy && copilotThread.used()
          ? { [PQ_AI_THREAD_SETTING]: copilotThread.threadId }
          : {};

      const posts = allValues.map((post: any) => ({
        integration: {
          id: post.id,
        },
        group,
        settings: {
          ...(post.settings || {}),
          [PQ_NOTIFY_SETTING]: notifyOnPublish,
          ...copilotThreadSetting,
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

        // Phone submit lives on Schedule; tablet submit can be on Preview.
        // Bounce back to Write so the toast has a visible surface to fix.
        // Content errors must not call preview()/setCurrent — that switches
        // off global editing and locks the editor behind "Write a separate
        // version".
        const revealWriteForIssue = (kind: 'settings' | 'content') => {
          setComposerPane('edit');
          if (kind === 'settings') {
            document
              .getElementById('composer-quick-settings')
              ?.scrollIntoView({ block: 'nearest' });
            document
              .getElementById('wrapper-settings')
              ?.scrollIntoView({ block: 'nearest' });
          }
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
          revealWriteForIssue('content');
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
              revealWriteForIssue('settings');
              return;
            }

            if (item.errors !== true) {
              toaster.show(
                `${channelToastLabel(item)}: ${item.errors}`,
                'warning'
              );
              setLoading(false);
              revealWriteForIssue('content');
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
              setLoading(false);
              revealWriteForIssue('content');
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
        date: publishAt.utc().format('YYYY-MM-DDTHH:mm:ss'),
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
                formatShortWeekdayTime(publishAt.local())
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
      fetch,
      // Start over gives the rail a new thread id; the post saves that one.
      copilotThread,
    ]
  );

  return (
    <StudioRailProvider rail={studioRail} setRail={setRail}>
    <div
      id="add-edit-modal"
      data-pq="composer"
      data-pq-composer-max={maximized ? '1' : '0'}
      data-pq-composer-empty={hasChannels ? '0' : '1'}
      className={clsx(
        'relative flex min-h-0 w-full flex-1',
        (hasChannels || maximized || touch) && 'h-full'
      )}
    >
      <ComposeAiBindings />
      <div
        className={clsx(
          'flex min-h-0 flex-1 flex-col overflow-hidden shadow-pq',
          touch ? 'rounded-none bg-pqInner' : 'rounded-[20px] bg-pqBg'
        )}
      >
        <div
          className={clsx(
            'flex min-h-0 flex-1',
            compactChrome ? 'flex-col' : 'flex-row gap-[12px] p-[12px]'
          )}
        >
          <div
            className={clsx(
              'flex min-h-0 flex-1 flex-col overflow-hidden',
              !compactChrome &&
                'rounded-[16px] bg-pqInner shadow-[inset_0_0_0_1px_var(--border)]',
              compactChrome && composerPane !== 'edit' && 'hidden'
            )}
          >
            <div
              className={clsx(
                'flex shrink-0 flex-col border-b border-pqLine bg-pqInner text-pqText',
                !compactChrome && 'rounded-ss-[16px]'
              )}
            >
              <div
                className={clsx(
                  'flex items-center gap-[12px] px-[16px] font-display font-[600] -tracking-[0.015em]',
                  phoneFlow ? 'h-[52px]' : 'h-[65px] px-[20px] text-[20px]'
                )}
              >
                <div className="min-w-0 flex-1 truncate text-[17px] min-[1024px]:text-[20px]">
                  {existingData?.integration
                    ? t('edit_post_title', 'Edit Post')
                    : t('create_post_title', 'Create Post')}
                  <span className="ms-[8px] inline-flex align-middle">
                    <CreationMethodBadge
                      creationMethod={existingData?.posts?.[0]?.creationMethod}
                      size="sm"
                    />
                  </span>
                </div>
                {compactChrome && !phoneFlow && (
                  <ComposerStepTabs
                    pane={composerPane === 'schedule' ? 'preview' : composerPane}
                    phone={false}
                    onPane={setComposerPane}
                  />
                )}
                {(compactChrome || !hasChannels) && (
                  <button
                    type="button"
                    onClick={askClose}
                    aria-label={t('close', 'Close')}
                    className="grid size-[44px] shrink-0 place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
                  >
                    <CloseIcon size={16} />
                  </button>
                )}
              </div>
              {phoneFlow && (
                <div className="px-[12px] pb-[8px]">
                  <ComposerStepTabs
                    pane={composerPane}
                    phone
                    onPane={setComposerPane}
                  />
                </div>
              )}
            </div>
            <div
              className={clsx(
                'flex min-h-0 flex-col',
                hasChannels || compactChrome ? 'flex-1' : 'flex-none'
              )}
            >
              <div
              className={clsx(
                hasChannels || compactChrome
                  ? 'relative min-h-0 flex-1'
                  : 'relative'
              )}
              >
                <div
                  id="social-content"
                  className={clsx(
                    'gap-[32px] flex flex-col px-[20px] pt-[20px] pb-[32px]',
                    hasChannels || compactChrome
                      ? 'absolute top-0 left-0 w-full h-full overflow-x-hidden overflow-y-scroll'
                      : 'overflow-visible'
                  )}
                >
                  <div className={clsx(
                    'flex w-full items-start gap-[16px]',
                    compactChrome && 'flex-col'
                  )}>
                    <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
                      <div className="flex items-center gap-[8px]">
                        <span className="text-[13px] font-[600] text-pqText">
                          {t('post_to', 'Post to')}
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
                  <div className="flex flex-1 gap-[6px] flex-col">
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
                    <div
                      className={clsx(
                        !hasChannels && 'hidden',
                        compactChrome ? 'flex flex-1' : 'w-full shrink-0'
                      )}
                    >
                      {!hide && <EditorWrapper totalPosts={1} value="" />}
                    </div>
                    <div
                      data-pq="composer-settings-block"
                      className={clsx(
                        'flex flex-col gap-[12px] pb-[32px]',
                        !hasChannels && 'hidden'
                      )}
                    >
                    <div
                      data-pq="composer-settings-heading"
                      id="composer-settings-heading"
                      className="px-[4px] pt-[8px] text-[11px] font-[700] uppercase tracking-[0.06em] text-pqSoft"
                    >
                      {t('settings', 'Settings')}
                    </div>
                    <div
                      id="composer-quick-settings"
                      data-pq="composer-quick-settings"
                      className="flex flex-col empty:hidden px-[4px]"
                    />
                    <div
                      id="wrapper-settings"
                      data-pq="composer-settings"
                      role="region"
                      aria-labelledby="composer-settings-heading"
                      aria-label={t('channel_settings', 'Channel settings')}
                      className={clsx(
                        'flex min-w-0 flex-col select-none px-[4px]',
                        (selectedIntegrations.length === 0 ||
                          current !== 'global') &&
                          'hidden'
                      )}
                    >
                      <div
                        id="social-settings"
                        className="flex min-w-0 flex-col gap-[8px] text-[14px] font-[500] text-pqText empty:hidden"
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
          </div>
          <div
            data-pq="composer-preview"
            className={clsx(
              'flex min-h-0 flex-col overflow-hidden',
              compactChrome
                ? clsx(
                    'w-full flex-1',
                    (composerPane !== 'preview' || !hasChannels) && 'hidden'
                  )
                : clsx(
                    'rounded-[16px] bg-pqInner shadow-[inset_0_0_0_1px_var(--border)]',
                    hasChannels
                      ? 'w-[min(520px,38vw)] shrink-0'
                      : 'pointer-events-none hidden w-0 min-w-0'
                  )
            )}
          >
            <div
              className={clsx(
                'flex shrink-0 flex-col border-b border-pqLine bg-pqInner text-pqText',
                !compactChrome && 'rounded-t-[16px]'
              )}
            >
              <div
                className={clsx(
                  'flex items-center gap-[8px] px-[16px] font-display font-[600] -tracking-[0.015em] min-[1024px]:px-[20px]',
                  phoneFlow ? 'h-[52px] text-[17px]' : 'h-[65px] text-[20px]'
                )}
              >
                {compactChrome || tabbedRail ? (
                  <StudioRailTabs />
                ) : (
                  <div className="min-w-0 flex-1 truncate text-[17px] min-[1024px]:text-[20px]">
                    {t('post_preview', 'Post Preview')}
                  </div>
                )}
                {compactChrome && !phoneFlow && (
                  <ComposerStepTabs
                    pane={composerPane === 'schedule' ? 'preview' : composerPane}
                    phone={false}
                    onPane={setComposerPane}
                  />
                )}
                {(compactChrome || tabbedRail) && (
                <div className="ms-auto flex shrink-0 items-center gap-[8px]">
                  {tabbedRail && !touch && (
                    <button
                      type="button"
                      onClick={() => setMaximized(true)}
                      aria-label={t('full_screen', 'Full screen')}
                      className="grid size-[44px] shrink-0 place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
                    >
                      <ExpandIcon size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={askClose}
                    aria-label={t('close', 'Close')}
                    className="grid size-[44px] shrink-0 place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
                )}
              </div>
              {phoneFlow && (
                <div className="px-[12px] pb-[8px]">
                  <ComposerStepTabs
                    pane={composerPane}
                    phone
                    onPane={setComposerPane}
                  />
                </div>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              <div
                className={clsx(
                  'absolute inset-0',
                  (compactChrome || tabbedRail) &&
                    studioRail === 'assistant' &&
                    'hidden'
                )}
              >
                <Scrollable
                  scrollClasses="!pe-[20px]"
                  className={clsx(
                    'absolute top-0 p-[20px] pe-[8px] left-0 w-full h-full overflow-x-hidden overflow-y-scroll',
                    compactChrome
                      ? 'pb-[min(34vh,260px)] snap-y snap-proximity'
                      : 'pb-[20px]'
                  )}
                >
                  <ShowAllProviders ref={ref} />
                </Scrollable>
              </div>
              {hasChannels && (compactChrome || tabbedRail) && (
                <div
                  className={clsx(
                    'absolute inset-0',
                    studioRail !== 'assistant' && 'hidden'
                  )}
                >
                  <ComposeAiRail />
                </div>
              )}
            </div>
          </div>
          {!compactChrome && hasChannels && maximized && (
            <div
              data-pq="composer-ai"
              className="flex min-h-0 w-[min(400px,30vw)] shrink-0 flex-col overflow-hidden rounded-[16px] bg-pqInner shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <div className="flex h-[65px] shrink-0 items-center gap-[8px] border-b border-pqLine px-[20px] font-display text-[20px] font-[600] -tracking-[0.015em] text-pqText">
                <CopilotMark size={18} className="text-pqFocused" />
                <div className="min-w-0 flex-1 truncate">
                  {t('ai_copilot', 'AI Copilot')}
                </div>
                <div className="ms-auto flex shrink-0 items-center gap-[8px]">
                  {!touch && (
                    <button
                      type="button"
                      onClick={() => setMaximized((v) => !v)}
                      aria-label={
                        maximized
                          ? t('restore', 'Restore')
                          : t('full_screen', 'Full screen')
                      }
                      className="grid size-[44px] shrink-0 place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
                    >
                      {maximized ? (
                        <CollapseIcon size={16} />
                      ) : (
                        <ExpandIcon size={16} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={askClose}
                    aria-label={t('close', 'Close')}
                    className="grid size-[44px] shrink-0 place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
              </div>
              <div className="relative min-h-0 flex-1">
                <div className="absolute inset-0">
                  <ComposeAiRail />
                </div>
              </div>
            </div>
          )}
          {phoneFlow && (
            <div
              className={clsx(
                'flex min-h-0 w-full flex-1 flex-col',
                composerPane !== 'schedule' && 'hidden'
              )}
            >
              <div className="flex h-[52px] shrink-0 items-center gap-[8px] border-b border-pqLine bg-pqBg px-[16px] font-display text-[17px] font-[600] text-pqText">
                <div className="min-w-0 flex-1 truncate">
                  {t('schedule', 'Schedule')}
                </div>
                <button
                  type="button"
                  onClick={askClose}
                  aria-label={t('close', 'Close')}
                  className="grid size-[44px] shrink-0 place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText"
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <div className="px-[12px] pb-[8px]">
                <ComposerStepTabs
                  pane={composerPane}
                  phone
                  onPane={setComposerPane}
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-[12px] overflow-y-auto px-[16px] py-[12px]">
                {publishedView ? (
                  <ComposePublishedAt date={date} />
                ) : (
                  <ComposeWhen date={date} onChange={setDate} />
                )}
                {!dummy && !publishedView && selectedIntegrations.length > 0 && (
                  <ComposeNotify
                    notify={notifyOnPublish}
                    onChange={setNotifyOnPublish}
                  />
                )}
                {!dummy && !publishedView && hasChannels && (
                  <div className="w-full [&>*]:w-full">
                    <TagsComponent
                      name="tags"
                      label={t('tags', 'Tags')}
                      initial={tags}
                      onChange={(e) => {
                        setTags(e.target.value);
                      }}
                    />
                  </div>
                )}
                {!dummy && !publishedView && hasChannels && (
                  <div className="w-full [&>*]:w-full">
                    <RepeatComponent repeat={repeater} onChange={setRepeater} />
                  </div>
                )}
                {repeating && (
                  <button
                    type="button"
                    onClick={stopRepeating}
                    disabled={loading}
                    className="flex cursor-pointer items-center gap-[8px] text-[15px] font-[600] text-pqText disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RepeatIcon />
                    <div>{t('stop_repeating', 'Stop repeating')}</div>
                  </button>
                )}
                {existingData?.integration && (
                  <button
                    onClick={deletePost}
                    className="flex cursor-pointer items-center gap-[8px] text-[15px] font-[600] text-pqWarn"
                  >
                    <TrashIcon />
                    <div>{t('delete_post', 'Delete Post')}</div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {phoneFlow && composerPane !== 'schedule' && (
          <div className="flex min-w-0 shrink-0 gap-[8px] border-t border-pqBorder px-[16px] py-[12px] pb-[max(12px,env(safe-area-inset-bottom))]">
            {composerPane === 'preview' && (
              <button
                type="button"
                onClick={() => setComposerPane('edit')}
                className="flex h-[44px] min-w-0 flex-1 items-center justify-center rounded-[10px] bg-btnSimple text-[15px] font-[600]"
              >
                {t('back', 'Back')}
              </button>
            )}
            {composerPane === 'edit' && hasChannels && (
              <div className="min-w-0 flex-1 [&>*]:w-full">
                <ComposeAiAssistant className="h-[44px] w-full justify-center" />
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                setComposerPane(
                  composerPane === 'edit' ? 'preview' : 'schedule'
                )
              }
              className="btnSub flex h-[44px] min-w-0 flex-1 items-center justify-center rounded-[10px] bg-pqBrand px-[12px] text-[15px] font-[600] text-white"
            >
              {composerPane === 'edit'
                ? t('preview', 'Preview')
                : t('next', 'Next')}
            </button>
          </div>
        )}
        <div
          className={clsx(
            'flex min-w-0 select-none border-t border-pqBorder bg-pqInner pb-[max(12px,env(safe-area-inset-bottom))]',
            phoneFlow && composerPane !== 'schedule' && 'hidden',
            compactFooter
              ? 'flex-col gap-[10px] overflow-x-hidden px-[16px] py-[12px]'
              : 'min-h-[84px] w-full items-center justify-between overflow-x-auto overflow-y-hidden py-[20px] min-[1180px]:flex-row'
          )}
        >
          {!phoneFlow && (
          <div
            className={clsx(
              'min-w-0 gap-[8px]',
              compactFooter
                ? 'grid w-full grid-cols-2'
                : 'flex min-w-0 flex-1 items-center ps-[20px]'
            )}
          >
            {!dummy && !compactFooter && !publishedView && (
              <div data-pq="composer-footer-tag" className="shrink-0">
                <TagsComponent
                  name="tags"
                  label={t('tags', 'Tags')}
                  initial={tags}
                  menuPlacement="top-start"
                  onChange={(e) => {
                    setTags(e.target.value);
                  }}
                />
              </div>
            )}
            {compactFooter && !dummy && !publishedView && hasChannels && (
              <div className={clsx('min-w-0', compactFooter && 'w-full [&>*]:w-full')}>
                <TagsComponent
                  name="tags"
                  label={t('tags', 'Tags')}
                  initial={tags}
                  onChange={(e) => {
                    setTags(e.target.value);
                  }}
                />
              </div>
            )}

            {compactFooter && !dummy && !publishedView && hasChannels && (
              <div className={clsx('min-w-0', compactFooter && 'w-full [&>*]:w-full')}>
                <RepeatComponent repeat={repeater} onChange={setRepeater} />
              </div>
            )}
            {!dummy && !publishedView && hasChannels && !compactFooter && (
              <div data-pq="composer-footer-repeat" className="shrink-0">
                <RepeatComponent
                  repeat={repeater}
                  menuPlacement="top-start"
                  onChange={setRepeater}
                />
              </div>
            )}
            {!dummy && !publishedView && hasChannels && !compactFooter && (
              <div data-pq="composer-footer-notify" className="shrink-0">
                <ComposeNotify
                  notify={notifyOnPublish}
                  menuPlacement="top-start"
                  onChange={setNotifyOnPublish}
                />
              </div>
            )}
            {compactFooter && hasChannels && publishedView && (
              <ComposePublishedAt date={date} />
            )}
            {compactFooter && hasChannels && !publishedView && (
              <ComposeWhen date={date} onChange={setDate} />
            )}
            {compactFooter &&
              !dummy &&
              !publishedView &&
              selectedIntegrations.length > 0 && (
              <ComposeNotify
                notify={notifyOnPublish}
                onChange={setNotifyOnPublish}
              />
            )}
          </div>
          )}
          <div
            className={clsx(
              'flex min-w-0 items-center justify-end gap-[8px]',
              compactFooter ? 'w-full flex-col' : 'shrink-0 pe-[20px]',
              phoneFlow && 'flex-row'
            )}
          >
            {!phoneFlow && (!compactFooter || !hasChannels) && (
              <>
                {publishedView ? (
                  <ComposePublishedAt date={date} />
                ) : (
                  <ComposeWhen date={date} onChange={setDate} />
                )}
              </>
            )}
            {!phoneFlow && repeating && (
              <button
                type="button"
                onClick={stopRepeating}
                disabled={loading}
                className="cursor-pointer flex text-pqText gap-[8px] items-center text-[15px] font-[600] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div>
                  <RepeatIcon />
                </div>
                <div className="whitespace-nowrap">
                  {t('stop_repeating', 'Stop repeating')}
                </div>
              </button>
            )}
            {!phoneFlow && existingData?.integration && (
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
                compactFooter && 'w-full',
                phoneFlow && 'min-w-0 flex-1'
              )}
            >
            {!addEditSets && !publishedView && (
              <button
                disabled={
                  selectedIntegrations.length === 0 || loading || locked
                }
                onClick={schedule('draft')}
                className={clsx(
                  'relative flex h-[44px] cursor-pointer items-center justify-center gap-[8px] overflow-hidden rounded-[10px] bg-btnSimple text-[15px] font-[600] disabled:cursor-not-allowed',
                  'max-[1179px]:min-w-0 max-[1179px]:flex-1 max-[1179px]:px-[12px]',
                  touch ? 'min-w-0 flex-1 px-[12px]' : 'px-[18px]'
                )}
              >
                {loading && (
                  <div className="absolute left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] text-textColor">
                    <Spinner width={20} height={20} />
                  </div>
                )}
                <span
                  className={clsx(
                    'flex min-w-0 items-center gap-[8px]',
                    loading && 'invisible'
                  )}
                >
                  <DraftIcon size={16} className="shrink-0" />
                  <span className="min-w-0 truncate whitespace-nowrap">
                    {t('save_as_draft', 'Save as Draft')}
                  </span>
                </span>
              </button>
            )}
            {addEditSets && (
              <button
                className={clsx(
                  'btnSub flex h-[44px] items-center justify-center gap-[8px] rounded-[10px] bg-pqBrand text-[15px] font-[600] text-white outline-none disabled:cursor-not-allowed disabled:opacity-80',
                  touch
                    ? 'min-w-0 flex-1 px-[12px]'
                    : 'min-w-[168px] px-[18px]'
                )}
                disabled={
                  selectedIntegrations.length === 0 || loading || locked
                }
                onClick={schedule('draft')}
              >
                Save Set
              </button>
            )}
            {publishedView && (
              <button
                type="button"
                onClick={openDuplicate}
                className={clsx(
                  'btnSub flex h-[44px] items-center justify-center gap-[8px] rounded-[10px] bg-pqBrand text-[15px] font-[600] text-white outline-none',
                  'max-[1179px]:flex-1 max-[1179px]:px-[12px] max-[1179px]:min-w-0',
                  touch ? 'min-w-0 flex-1 px-[12px]' : 'min-w-[168px] px-[18px]'
                )}
              >
                <DuplicateIcon size={16} className="shrink-0" />
                <span className="min-w-0 truncate whitespace-nowrap">
                  {t('duplicate_post', 'Duplicate Post')}
                </span>
              </button>
            )}
            {!addEditSets && !publishedView && (
              <div className={clsx('relative', touch && 'flex min-w-0 flex-1')} ref={postNowClickRef}>
                <div className={clsx('flex min-w-0', touch && 'w-full')} ref={postNowRef}>
                  <button
                    type="button"
                    disabled={
                      selectedIntegrations.length === 0 || loading || locked
                    }
                    onClick={schedule('schedule')}
                    className={clsx(
                      'btnSub relative flex h-[44px] min-w-0 items-center justify-center gap-[8px] overflow-hidden bg-pqBrand text-[15px] font-[600] text-white outline-none disabled:cursor-not-allowed disabled:opacity-40',
                      dummy || !hasChannels
                        ? 'rounded-[10px]'
                        : 'rounded-s-[10px]',
                      'max-[1179px]:flex-1 max-[1179px]:px-[12px] max-[1179px]:min-w-0',
                      touch
                        ? 'min-w-0 flex-1 px-[12px]'
                        : 'min-w-[168px] px-[18px]'
                    )}
                  >
                    {loading && (
                      <div className="absolute left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] text-white">
                        <Spinner width={20} height={20} />
                      </div>
                    )}
                    <span
                      className={clsx(
                        'flex min-w-0 items-center gap-[8px]',
                        loading && 'invisible'
                      )}
                    >
                      {hasChannels && !dummy && (
                        <ScheduleIcon size={16} className="shrink-0" />
                      )}
                      <span className="min-w-0 truncate whitespace-nowrap">
                        {selectedIntegrations.length === 0
                          ? t('select_channels', 'Select channels')
                          : dummy
                          ? t('create_output', 'Create output')
                          : existingData?.posts?.[0]?.state &&
                            existingData.posts[0].state !== 'DRAFT'
                          ? t('update', 'Update')
                          : t('schedule', 'Schedule')}
                      </span>
                    </span>
                  </button>
                  {!dummy && hasChannels && (
                    <button
                      type="button"
                      disabled={
                        selectedIntegrations.length === 0 || loading || locked
                      }
                      onClick={() => setPostNowOpen((v) => !v)}
                      aria-haspopup="menu"
                      aria-expanded={postNowOpen}
                      aria-label={t('post_now', 'Post Now')}
                      className="grid h-[44px] w-[38px] shrink-0 place-items-center rounded-e-[10px] bg-pqBrand text-white shadow-[inset_1px_0_0_rgba(255,255,255,.24)] outline-none disabled:cursor-not-allowed disabled:opacity-80"
                    >
                      <ChevronDownIcon
                        size={16}
                        rotated={postNowOpen}
                        className="opacity-70"
                      />
                    </button>
                  )}
                </div>
                {!dummy && hasChannels && postNowOpen && (
                  <div
                    ref={postNowMenuRef}
                    data-pq="composer-post-now-menu"
                    role="menu"
                    className="z-[300] rounded-[10px] bg-pqPop p-[4px] shadow-[var(--e3),inset_0_0_0_1px_var(--border)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={schedule('now')}
                      disabled={
                        selectedIntegrations.length === 0 || loading || locked
                      }
                      className="post-now flex h-[40px] w-full items-center justify-center gap-[8px] rounded-[8px] bg-pqPink text-[14px] font-[600] text-white disabled:cursor-not-allowed disabled:opacity-80"
                    >
                      <SendIcon size={16} className="shrink-0" />
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
    </StudioRailProvider>
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
