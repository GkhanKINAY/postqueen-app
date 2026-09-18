'use client';

import { useCallback, useContext, useMemo } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
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

/** The `posts` array `/posts/valid` and `/posts` take, built like the composer's. */
const postsPayload = (group: AgentDraftGroup, postGroup: string) =>
  group.integrationIds.map((id) => ({
    integration: { id },
    group: postGroup,
    settings: group.settingsById[id] || {},
    value: group.posts.map((post) => ({
      content: post.content,
      delay: 0,
      image: post.attachments.map((a) => ({ id: a.id, path: a.path })),
    })),
  }));

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
        const unknown = group.integrationIds.filter((id) => !selectedChannel(id));
        for (const id of unknown) {
          errors.push({
            integrationId: id,
            error:
              'This channel is not selected in the Channels column, or it needs a reconnect. Use only the channels in the current state.',
          });
        }
        const known = { ...group, integrationIds: group.integrationIds.filter((id) => selectedChannel(id)) };
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
    [fetch, selectedChannel]
  );

  /** Schedule, publish now or save as a draft, exactly what the card shows. */
  const execute = useCallback(
    async (
      group: AgentDraftGroup,
      action: AgentDraftAction,
      dateOverride?: string
    ): Promise<AgentDraftOutcome> => {
      const at = new Date().toISOString();
      let date = dateOverride || group.date;
      if (action === 'now') {
        date = dayjs.utc().format('YYYY-MM-DDTHH:mm:ss');
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
      const response = await fetch('/posts', {
        method: 'POST',
        body: JSON.stringify({
          type: action,
          tags: [],
          shortLink: false,
          date: publishAt,
          posts: postsPayload(known, makeId(10)),
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
        status: action === 'now' ? 'posted' : action === 'draft' ? 'draft' : 'scheduled',
        at,
        date: publishAt,
      };
    },
    [fetch, channel]
  );

  /**
   * One composer for the group, seeded the way a saved Set is (channels with
   * their settings, the thread as the global value). Never the edit path:
   * that is for posts the server already has. Resolves with `true` when the
   * person saved from there, `false` when they closed it.
   */
  const openComposer = useCallback(
    async (group: AgentDraftGroup) => {
      const known = group.integrationIds.filter((id) => channel(id));
      if (!known.length) {
        return false;
      }
      // A card on "Next free slot" opens the composer on that slot, the way
      // the header's Create Post does; if the lookup fails the person picks
      // a date there.
      let date = group.date;
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
          children: (
            <AddEditModal
              date={date ? dayjs.utc(date).local() : dayjs()}
              allIntegrations={channels}
              integrations={channels}
              set={{
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
              }}
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
    [fetch, modals, channels, channel]
  );

  return { validate, execute, openComposer, channels };
};
