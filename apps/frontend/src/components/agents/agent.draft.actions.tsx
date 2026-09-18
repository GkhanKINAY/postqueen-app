'use client';

import { ReactElement, useCallback, useContext, useMemo } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import {
  AgentDraftAction,
  AgentDraftGroup,
  AgentDraftOutcome,
} from '@gitroom/frontend/components/agents/agent.draft.card';

dayjs.extend(utc);

type AgentChannel = Integrations & {
  refreshNeeded?: boolean;
  inBetweenSteps?: boolean;
};

const needsAttention = (integration: AgentChannel) =>
  !!(integration.refreshNeeded || integration.inBetweenSteps);

/** The calendar's own wrapper for a post the server has; a new draft has none. */
const wrapExisting = (existing: any, modal: ReactElement) =>
  existing ? (
    <ExistingDataContextProvider value={existing}>{modal}</ExistingDataContextProvider>
  ) : (
    modal
  );

/** A media entry as a post row stores it; the card holds only id and path. */
type StoredMedia = { id: string; path: string; [key: string]: unknown };

/**
 * The `posts` array `/posts/valid` and `/posts` take, built like the
 * composer's. For an existing post, `current` holds the server's rows by
 * thread index: an item with a row id is updated in place, an item without
 * is a new comment, a row not listed is dropped by the server, and a media
 * entry the row already has keeps its poster and alt text under the card's
 * id and path.
 */
const postsPayload = (group: AgentDraftGroup, postGroup: string, current?: ExistingThread) =>
  group.integrationIds.map((id) => ({
    integration: { id },
    group: postGroup,
    settings: group.settingsById[id] || {},
    value: group.posts.map((post, index) => ({
      ...(current?.ids[index] ? { id: current.ids[index] } : {}),
      content: post.content,
      delay: post.delay || 0,
      image: post.attachments.map((a) => ({
        ...(current?.media[index]?.find((m) => m.id === a.id) || {}),
        id: a.id,
        path: a.path,
        ...(a.thumbnail ? { thumbnail: a.thumbnail } : {}),
      })),
    })),
  }));

/** The rows of an existing post as the server holds them now. */
type ExistingThread = {
  group: string;
  ids: string[];
  /** Per thread index: the stored media entries, posters and alt text included. */
  media: StoredMedia[][];
  state: string;
  publishDate?: string;
  integrationId?: string;
  settings: Record<string, any>;
  posts: { id: string; content: string; delay: number }[];
};

export type DraftValidationError = {
  integrationId?: string;
  channel?: string;
  error: string;
};

/**
 * Everything a Post Preview card can do, off the same endpoints Create Post
 * uses. The model never re-emits a draft to publish it: what the card shows
 * is what `/posts` receives.
 */
export const useDraftActions = () => {
  const fetch = useFetch();
  const modals = useModals();
  const t = useT();
  const { properties, allChannels } = useContext(PropertiesContext);
  // A new draft may only target the channels selected in the Channels
  // column (that is what the prompt lists); a card from an earlier chat can
  // still be scheduled, posted or opened on any channel that can post.
  const selected = useMemo(
    () =>
      (Array.isArray(properties) ? properties : []).filter(
        (p: AgentChannel) => !needsAttention(p)
      ) as AgentChannel[],
    [properties]
  );
  const channels = useMemo(
    () =>
      (Array.isArray(allChannels) ? allChannels : []).filter(
        (p: AgentChannel) => !needsAttention(p)
      ) as AgentChannel[],
    [allChannels]
  );

  const channel = useCallback(
    (id: string) => channels.find((p) => p.id === id),
    [channels]
  );
  const selectedChannel = useCallback(
    (id: string) => selected.find((p) => p.id === id),
    [selected]
  );

  /**
   * The same server-side check the composer runs before saving. Returns the
   * errors, so the model can fix a draft before anyone sees the buttons.
   */
  const validate = useCallback(
    async (groups: AgentDraftGroup[]): Promise<DraftValidationError[]> => {
      const errors: DraftValidationError[] = [];
      for (const group of groups) {
        // An existing post keeps its channel whether or not that channel is
        // selected in the column; a new draft goes only to the selection.
        const allowed = group.existing ? channel : selectedChannel;
        const unknown = group.integrationIds.filter((id) => !allowed(id));
        for (const id of unknown) {
          errors.push({
            integrationId: id,
            error: group.existing
              ? 'This channel cannot post right now; it may need a reconnect.'
              : 'This channel is not selected in the Channels column, or it needs a reconnect. Use only the channels in the current state.',
          });
        }
        const known = { ...group, integrationIds: group.integrationIds.filter((id) => allowed(id)) };
        if (!known.integrationIds.length) {
          continue;
        }
        const response = await fetch('/posts/valid', {
          method: 'POST',
          body: JSON.stringify({
            type: 'schedule',
            posts: postsPayload(known, makeId(10)),
          }),
        });
        // customFetch resolves on 4xx/5xx: a non-array here is the server
        // saying it could not check, which is an error the model can see.
        const checked = response.ok
          ? await response.json().catch((): null => null)
          : null;
        if (!Array.isArray(checked)) {
          errors.push({ error: 'The post could not be validated. Try again.' });
          continue;
        }
        for (const item of checked) {
          const name = item.name || selectedChannel(item.id)?.name;
          if (item.emptyContent) {
            errors.push({ integrationId: item.id, channel: name, error: 'The post needs at least one character or one image.' });
          } else if (item.valid === false) {
            // class-validator words a missing key like a wrong value; say
            // which key to add, or the model resends the same settings.
            const key = String(item.settingsErrorKey || '');
            const missing =
              key && !(key.split('.')[0] in (group.settingsById[item.id] || {}));
            errors.push({
              integrationId: item.id,
              channel: name,
              error: missing
                ? `settings.${key} is missing. ${item.settingsError}`
                : item.settingsError || 'The settings are invalid; get the schema with integrationSchema.',
            });
          } else if (item.errors !== true) {
            errors.push({ integrationId: item.id, channel: name, error: String(item.errors) });
          } else if (item.tooLong) {
            errors.push({ integrationId: item.id, channel: name, error: `The post is too long; the maximum is ${item.maximumCharacters} characters.` });
          }
        }
      }
      return errors;
    },
    [fetch, selectedChannel, channel]
  );

  /**
   * The server's current rows for an existing post, read at the moment of
   * the action: the group rotates on every save, so a value kept from when
   * the card was drawn would name rows that no longer exist.
   */
  const readExisting = useCallback(
    async (id: string): Promise<ExistingThread | undefined> => {
      const response = await fetch(`/posts/${id}`);
      const body = response.ok ? await response.json().catch((): null => null) : null;
      const first = body?.posts?.[0];
      if (!first?.id || !body?.group) {
        return undefined;
      }
      return {
        group: body.group,
        ids: body.posts.map((post: { id: string }) => post.id),
        media: body.posts.map((post: { image?: unknown }) =>
          (Array.isArray(post.image) ? post.image : []).filter(
            (m: any): m is StoredMedia => !!m?.id && !!m?.path
          )
        ),
        state: first.state,
        publishDate: first.publishDate
          ? dayjs.utc(first.publishDate).format('YYYY-MM-DDTHH:mm:ss')
          : undefined,
        integrationId: first.integrationId,
        settings: body.settings || {},
        posts: body.posts.map((post: { id: string; content?: string; delay?: number }) => ({
          id: post.id,
          content: post.content || '',
          delay: post.delay || 0,
        })),
      };
    },
    [fetch]
  );

  /** Schedule, publish now or save as a draft, exactly what the card shows. */
  const execute = useCallback(
    async (
      group: AgentDraftGroup,
      action: AgentDraftAction,
      dateOverride?: string
    ): Promise<AgentDraftOutcome | null> => {
      const at = new Date().toISOString();
      // An existing post: its rows are read now, and a delete is the one
      // action that never reaches /posts. Deleting asks first, always.
      let current: ExistingThread | undefined;
      if (group.existing) {
        current = await readExisting(group.existing);
        if (!current) {
          return { status: 'error', at, error: t('post_no_longer_exists', 'This post no longer exists.') };
        }
        if (action === 'delete') {
          if (
            !(await deleteDialog(
              t('are_you_sure_you_want_to_delete_post', 'Are you sure you want to delete post?')
            ))
          ) {
            return null;
          }
          const response = await fetch(`/posts/${current.group}`, { method: 'DELETE' });
          if (!response.ok) {
            return { status: 'error', at, error: t('post_delete_failed', 'Could not delete the post.') };
          }
          return { status: 'deleted', at };
        }
      } else if (action === 'delete' || action === 'update') {
        return {
          status: 'error',
          at,
          error: t('only_existing_post', 'Only an existing post can be updated or deleted.'),
        };
      }
      // Save changes keeps the post's own date: the queue reads the date it
      // was started with, so a moved date on 'update' would show on the new
      // day and publish on the old one. A date change is a schedule.
      let date =
        action === 'update'
          ? current?.publishDate
          : dateOverride || group.date || current?.publishDate;
      if (action === 'now') {
        date = dayjs.utc().format('YYYY-MM-DDTHH:mm:ss');
      }
      if (
        action === 'schedule' &&
        current &&
        date &&
        dayjs.utc(date).isBefore(dayjs.utc())
      ) {
        // A draft written for a date that has passed would go out at once.
        return {
          status: 'error',
          at,
          error: t('post_date_passed', 'The date of this post has passed; say when it should go out.'),
        };
      }
      if (!date) {
        // "Next free slot": the same lookup the header's Create Post does.
        const slot = await fetch('/posts/find-slot');
        date = slot.ok ? (await slot.json().catch(() => ({})))?.date : undefined;
        if (!date) {
          return { status: 'error', at, error: 'Could not find a free slot. Pick a date and try again.' };
        }
      }
      const known = { ...group, integrationIds: group.integrationIds.filter((id) => channel(id)) };
      if (!known.integrationIds.length) {
        return { status: 'error', at, error: 'None of these channels can post right now.' };
      }
      const publishAt = dayjs.utc(date).format('YYYY-MM-DDTHH:mm:ss');
      // Sending a published post to the queue publishes it again; the
      // server refuses that without `republish`, so the person is asked.
      let republish = false;
      if (current?.state === 'PUBLISHED' && (action === 'schedule' || action === 'now')) {
        republish = await deleteDialog(
          t(
            'republish_confirm',
            'This post was already published. Publishing it again creates a second post on the channel. Continue?'
          ),
          t('publish_again', 'Publish again'),
          t('already_published', 'Already published'),
          undefined,
          false
        );
        if (!republish) {
          return null;
        }
      }
      const response = await fetch('/posts', {
        method: 'POST',
        body: JSON.stringify({
          type: action,
          tags: [],
          shortLink: false,
          date: publishAt,
          ...(republish ? { republish: true } : {}),
          posts: postsPayload(known, current?.group || makeId(10), current),
        }),
      });
      if (!response.ok) {
        // A Nest error body (`message` is a string, or the DTO's list of
        // strings), or the validation filter's `{ name, message }`.
        const body = await response.json().catch(() => ({}));
        const message = (
          Array.isArray(body?.message) ? body.message.join('. ') : body?.message
        )
          // "posts.0.value.0.image.0.File must have…": the DTO path is noise here.
          ?.replace?.(/(^|\. )(?:[a-zA-Z]+\.\d+\.)+/g, '$1');
        const reason = [body?.name, message]
          .filter((p) => typeof p === 'string' && p)
          .join(': ');
        return { status: 'error', at, error: reason || 'Could not save the post.' };
      }
      return {
        status:
          action === 'now'
            ? 'posted'
            : action === 'draft'
            ? 'draft'
            : action === 'update'
            ? 'updated'
            : 'scheduled',
        at,
        date: publishAt,
      };
    },
    [fetch, channel, readExisting, t]
  );

  /**
   * One composer for the group. A new draft is seeded the way a saved Set is
   * (channels with their settings, the thread as the global value). An
   * existing post opens the calendar's edit path instead (`/posts/group`
   * under `ExistingDataContextProvider`), so saving changes the post rather
   * than making a second one. Resolves with `true` when the person saved
   * from there, `false` when they closed it.
   */
  const openComposer = useCallback(
    async (group: AgentDraftGroup) => {
      const known = group.integrationIds.filter((id) => channel(id));
      if (!known.length) {
        return false;
      }
      let existing: any = null;
      if (group.existing) {
        const current = await readExisting(group.existing);
        const response = current ? await fetch(`/posts/group/${current.group}`) : undefined;
        existing = response?.ok ? await response.json().catch((): null => null) : null;
        if (!existing?.posts?.length) {
          return false;
        }
      }
      // A card on "Next free slot" opens the composer on that slot, the way
      // the header's Create Post does; if the lookup fails the person picks
      // a date there.
      let date = group.date || existing?.posts?.[0]?.publishDate;
      if (!date) {
        const slot = await fetch('/posts/find-slot');
        date = slot.ok ? (await slot.json().catch(() => ({})))?.date : undefined;
      }
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (saved: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(saved);
        };
        modals.openModal({
          id: 'add-edit-modal',
          closeOnClickOutside: false,
          removeLayout: true,
          closeOnEscape: false,
          withCloseButton: false,
          askClose: true,
          size: '80%',
          title: ``,
          classNames: {
            modal: 'w-[100%] max-w-[1400px] text-textColor',
          },
          children: wrapExisting(
            existing,
            <AddEditModal
              date={date ? dayjs.utc(date).local() : dayjs()}
              allIntegrations={channels}
              integrations={
                existing
                  ? channels
                      .filter((c) => c.id === existing.integration)
                      .map((c) => ({ ...c, picture: existing.integrationPicture }))
                  : channels
              }
              {...(existing
                ? {}
                : {
                    set: {
                      posts: known.map((id) => ({
                        integration: { id },
                        settings: group.settingsById[id] || {},
                        value: group.posts.map((post) => ({
                          content: post.content,
                          media: post.attachments.map((a) => ({
                            id: a.id,
                            path: a.path,
                          })),
                        })),
                      })),
                    },
                  })}
              reopenModal={() => {}}
              // Called on a successful save, then `closeAll()` runs, then
              // `customClose` fires two seconds later: the first one wins.
              mutate={() => settle(true)}
              customClose={() => {
                // The person closed it unsaved: with `customClose` set the
                // composer leaves closing to us.
                if (settled) {
                  return;
                }
                modals.closeAll();
                settle(false);
              }}
            />
          ),
        });
      });
    },
    [fetch, modals, channels, channel, readExisting]
  );

  return { validate, execute, openComposer, readExisting, channels };
};
