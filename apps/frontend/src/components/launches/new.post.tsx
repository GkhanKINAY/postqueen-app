import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import { useSWRConfig } from 'swr';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import dayjs from 'dayjs';
import { isPostsSwrKey } from '@gitroom/frontend/components/launches/posts-swr';
import { CalendarWeekProvider } from '@gitroom/frontend/components/launches/calendar.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useSets } from '@gitroom/frontend/components/launches/helpers/use.sets';
import { useDefaultSignature } from '@gitroom/frontend/components/launches/helpers/use.default.signature';
import { useAddProvider } from '@gitroom/frontend/components/launches/helpers/use.add.provider';
import { useClickOutside } from '@mantine/hooks';
import {
  useAiAvailable,
  useUser,
} from '@gitroom/frontend/components/layout/user.context';
import { useRouter } from 'next/navigation';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import clsx from 'clsx';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { MobileSheet } from '@gitroom/frontend/components/layout/mobile-sheet';

/**
 * The generator and the set picker are heavy and this control now renders on
 * every route, so they load when a dialog is actually opened — the click
 * already awaits `/posts/find-slot`, so the chunk arrives alongside a request
 * that had to happen anyway.
 *
 * `AddEditModal` is deliberately NOT among them. It opens with
 * `closeOnEscape: false`, `withCloseButton: false`, `closeOnClickOutside: false`
 * and `fullScreen`, so anything that renders nothing in its place is an
 * undismissable blank overlay — and a chunk that 404s (a tab left open across a
 * deploy) makes that permanent, with a page reload as the only way out. The two
 * below are safe to defer because their modals can all be closed.
 */
const GeneratorPopup = dynamic(
  () =>
    import('@gitroom/frontend/components/launches/generator/generator').then(
      (mod) => mod.GeneratorPopup
    ),
  { ssr: false }
);

const SetSelectionModal = dynamic(
  () =>
    import('@gitroom/frontend/components/launches/calendar').then(
      (mod) => mod.SetSelectionModal
    ),
  { ssr: false }
);

/** One row of the Create menu: what it makes and, in a line, how. */
const CreateMenuItem: FC<{
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  brand?: boolean;
  locked?: boolean;
  big?: boolean;
}> = ({ icon, title, description, onClick, brand, locked, big }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={clsx(
      'flex w-full items-center gap-[12px] rounded-[12px] text-start outline-none transition-colors hover:bg-pqHover focus-visible:bg-pqHover',
      big ? 'min-h-[66px] p-[12px]' : 'p-[10px]',
      locked && 'opacity-[0.45]'
    )}
  >
    <span
      className={clsx(
        'flex shrink-0 items-center justify-center',
        big ? 'size-[42px] rounded-[12px]' : 'size-[34px] rounded-[10px]',
        brand ? 'bg-pqBrandSoft text-pqFocused' : 'bg-pqSettings text-pqMuted'
      )}
    >
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span
        className={clsx(
          'block font-[600] text-pqText',
          big ? 'text-[15px]' : 'text-[13.5px]'
        )}
      >
        {title}
      </span>
      <span
        className={clsx(
          'mt-[1px] block text-pqMuted',
          big ? 'text-[13px]' : 'text-[12.5px]'
        )}
      >
        {description}
      </span>
    </span>
    {locked && (
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        aria-hidden="true"
        className="shrink-0 text-pqMuted"
      >
        <rect
          x="3"
          y="7"
          width="10"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M5.5 7V5.2a2.5 2.5 0 015 0V7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    )}
  </button>
);

const createMenuIcon = (d: string, size: number) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    aria-hidden="true"
  >
    <path
      d={d}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PEN_PATH = 'M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4';
const SPARKLES_PATH =
  'M12 3l1.9 4.8 4.8 1.9-4.8 1.9L12 16.4l-1.9-4.8L5.3 9.7l4.8-1.9L12 3ZM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z';
const CHAT_PATH =
  'M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.4A8 8 0 1 1 20 12ZM8.5 10.5h7M8.5 14h4';

/**
 * Create Post split control (Blank / AI), rendered by the chrome header on
 * every route. Primary opens a blank compose; the chevron opens Blank / AI post
 * (AI gated the same way as Generator).
 *
 * It deliberately does not read `useCalendar()` — that provider wraps the
 * calendar page only, and this button outlives it. Channels and sets come from
 * their own SWR hooks (same keys, so the cache is shared with the calendar),
 * and the calendar is refreshed by key prefix instead of by context callback.
 *
 * With no channels connected the control stays visible and opens Add Channel:
 * a first-run user has no other cue that posting is what this app does.
 */
export const NewPost = () => {
  const fetch = useFetch();
  const modal = useModals();
  const {
    data: integrations = [],
    mutate: mutateIntegrations,
    isLoading,
    error: integrationsError,
  } = useIntegrationList();
  const {
    data: sets = [],
    mutate: mutateSets,
    isLoading: setsLoading,
    error: setsError,
  } = useSets();
  const {
    data: signature,
    mutate: mutateSignature,
    isLoading: signatureLoading,
    error: signatureError,
  } = useDefaultSignature();
  const { mutate: globalMutate } = useSWRConfig();
  const t = useT();
  const toaster = useToaster();
  const user = useUser();
  const router = useRouter();
  const { billingEnabled, aiEnabled } = useVariables();
  const { mobile, touch } = useViewport();
  const aiAvailable = useAiAvailable();
  const addProvider = useAddProvider(mutateIntegrations);
  const [menuOpen, setMenuOpen] = useState(false);
  // The phone sheet is portalled, so a tap inside it is "outside" this
  // wrapper; it closes through its own scrim instead.
  const menuRef = useClickOutside(() => {
    if (!mobile) setMenuOpen(false);
  });
  const { referenceRef, floatingRef } = useAnchoredPopover<
    HTMLDivElement,
    HTMLDivElement
  >(menuOpen && !mobile, 'end');

  // The phone sheet closes itself on Escape; the desktop menu needs its own.
  useEffect(() => {
    if (!menuOpen || mobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, mobile]);

  // The calendar and list views key off `/posts-...` and `/posts-list-...`.
  // Matching the prefix reaches both, and reaches them from pages where the
  // calendar context is not mounted at all.
  const reloadCalendarView = useCallback(() => {
    globalMutate(isPostsSwrKey);
  }, [globalMutate]);

  /**
   * `useIntegrationList` carries `fallbackData: []`, so the first paint of any
   * page looks channel-less. Resolve the list at click time rather than
   * disabling the button on a value that is merely not back yet.
   *
   * Three answers, not two. `null` means "could not tell". The bound `mutate()`
   * defaults to `throwOnError`, so an unguarded rejection would escape into the
   * click handler and leave Create Post doing nothing at all; and reporting the
   * failure as an empty account would push someone who has channels into the
   * add-a-channel flow.
   */
  const resolveIntegrations = useCallback(async (): Promise<any[] | null> => {
    // A non-empty list is always trustworthy. Empty is not: it is what the
    // fallback reads before the first fetch lands, what a failed fetch leaves
    // behind, and — since `revalidateOnFocus` and `revalidateIfStale` are both
    // off on this key — what the cache still says after someone connects their
    // first channel through the OAuth popup. Empty is also the answer that
    // sends them into the connect flow, so it is the one answer worth
    // confirming against the server before acting on it. The extra request only
    // happens on an account that looks channel-less, where the dialog it guards
    // is about to fetch `/integrations` anyway.
    if (!isLoading && !integrationsError && integrations.length) {
      return integrations;
    }
    try {
      return (await mutateIntegrations()) ?? [];
    } catch {
      return null;
    }
  }, [isLoading, integrationsError, integrations, mutateIntegrations]);

  /**
   * Same race as the channel list, decided the same way. `/sets` has no
   * `fallbackData`, so an in-flight fetch reads as "no sets" and the Select-a-Set
   * step is skipped outright — silently, for someone who does have sets. The
   * button paints on every route now, so it is reachable long before this
   * resolves.
   *
   * Unlike channels, a failure resolves to `[]` rather than blocking: sets are a
   * convenience, and refusing to open the composer because their fetch failed
   * would be a worse trade than skipping the picker.
   */
  const resolveSets = useCallback(async (): Promise<any[]> => {
    if (!setsLoading && !setsError) return sets;
    try {
      return (await mutateSets()) ?? [];
    } catch {
      return [];
    }
  }, [setsLoading, setsError, sets, mutateSets]);

  /**
   * The signature a new post starts with, the one the calendar's empty slots
   * add. Resolved at click time like the sets above; a failure means no
   * signature rather than no composer.
   */
  const resolveSignature = useCallback(async (): Promise<any> => {
    if (!signatureLoading && !signatureError) return signature;
    try {
      return await mutateSignature();
    } catch {
      return undefined;
    }
  }, [signatureLoading, signatureError, signature, mutateSignature]);

  const createAPost = useCallback(async () => {
    setMenuOpen(false);
    const list = await resolveIntegrations();
    if (list === null) {
      toaster.show(t('something_went_wrong', 'Something went wrong'), 'warning');
      return;
    }
    if (!list.length) {
      // No channels: the composer renders nothing without one, so send the
      // user where posting actually starts, without leaving the page.
      await addProvider();
      return;
    }

    // Rejects outright when the backend is unreachable, and an undefined `date`
    // would silently open the composer at "now" rather than the next free slot.
    let date: string | undefined;
    try {
      const slotResponse = await fetch('/posts/find-slot');
      if (!slotResponse.ok) {
        throw new Error('find-slot failed');
      }
      date = (await slotResponse.json())?.date;
    } catch (e) {
      date = undefined;
    }

    if (!date) {
      toaster.show(
        t('create_post_failed', 'Could not start a new post, please try again'),
        'warning'
      );
      return;
    }

    const setList = await resolveSets();

    const set: any = !setList.length
      ? undefined
      : await new Promise((resolve) => {
          modal.openModal({
            title: t('select_set', 'Select a Set'),
            closeOnClickOutside: true,
            closeOnEscape: true,
            withCloseButton: false,
            onClose: () => resolve('exit'),
            classNames: {
              modal: 'text-textColor',
            },
            children: (
              <SetSelectionModal
                sets={setList}
                onSelect={(selectedSet) => {
                  resolve(selectedSet);
                  modal.closeAll();
                }}
                onContinueWithoutSet={() => {
                  resolve(undefined);
                  modal.closeAll();
                }}
              />
            ),
          });
        });

    if (set === 'exit') return;

    const defaultSignature = set ? undefined : await resolveSignature();

    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      classNames: {
        modal: 'w-[100%] max-w-[1400px] text-textColor',
      },
      children: (
        <AddEditModal
          allIntegrations={list.map((p) => ({
            ...p,
          }))}
          {...(defaultSignature?.id
            ? {
                onlyValues: [
                  {
                    content: '\n' + defaultSignature.content,
                  },
                ],
              }
            : {})}
          {...(set?.content ? { set: JSON.parse(set.content) } : {})}
          reopenModal={createAPost}
          mutate={reloadCalendarView}
          integrations={list}
          when="next"
          date={dayjs.utc(date).local()}
        />
      ),
      size: '80%',
      title: ``,
    });
  }, [
    resolveIntegrations,
    resolveSets,
    resolveSignature,
    addProvider,
    fetch,
    modal,
    reloadCalendarView,
    t,
    toaster,
  ]);

  const createAiPost = useCallback(async () => {
    setMenuOpen(false);
    const list = await resolveIntegrations();
    if (list === null) {
      toaster.show(t('something_went_wrong', 'Something went wrong'), 'warning');
      return;
    }
    if (!list.length) {
      await addProvider();
      return;
    }
    // Two different refusals, and they used to be one. The old condition was
    // `!billingEnabled || !user?.tier?.ai`, which on an install with billing
    // switched off is *always* true: every user was told to upgrade and sent to
    // /billing, a page the nav hides and that has no working checkout there.
    // The same file already had it right two hundred lines down (`aiLocked`).
    //
    // No key on the installation is not something anyone can buy their way out
    // of, so it gets a plain toast and no billing trip.
    if (!aiEnabled) {
      toaster.show(
        t(
          'ai_not_configured_body',
          'AI features are not configured on this installation.'
        ),
        'warning'
      );
      return;
    }
    // Past that guard `useAiAvailable()` is false only when billing is on and
    // this tier does not include AI — which is the one case where upgrading is
    // genuinely the answer.
    if (!aiAvailable) {
      if (
        await deleteDialog(
          t('upgrade_required', 'You need to upgrade to use this feature'),
          t('move_to_billing', 'Move to billing'),
          t('payment_required', 'Payment Required')
        )
      ) {
        router.push('/billing');
      }
      return;
    }
    modal.openModal({
      title: t('generate_posts', 'Generate Posts'),
      withCloseButton: true,
      // Opaque --inner card (modal shell). Never bg-transparent — that let the
      // calendar list bleed through. Width matches prototype generator card.
      classNames: {
        modal: 'text-pqText',
      },
      size: 640,
      children: (
        <CalendarWeekProvider integrations={list}>
          <GeneratorPopup />
        </CalendarWeekProvider>
      ),
    });
  }, [
    resolveIntegrations,
    addProvider,
    aiEnabled,
    aiAvailable,
    modal,
    router,
    t,
    toaster,
  ]);

  // The padlock means "your plan does not include this", so it stays a tier
  // question. An installation with no OpenAI key is not a plan problem and gets
  // the toast in createAiPost instead — a padlock there would invite an upgrade
  // that changes nothing.
  const aiLocked = billingEnabled && !user?.tier?.ai;

  const planWithCopilot = useCallback(() => {
    setMenuOpen(false);
    router.push('/agents');
  }, [router]);

  // The same three ways to start, as a menu on desktop and a sheet on phones
  // (where AI post had no way in before).
  const menuItems = (big: boolean) => (
    <>
      <CreateMenuItem
        big={big}
        icon={createMenuIcon(PEN_PATH, big ? 19 : 17)}
        title={t('blank_post', 'Blank post')}
        description={t('create_blank_post_sub', 'Write it yourself')}
        onClick={createAPost}
      />
      <CreateMenuItem
        big={big}
        brand
        locked={aiLocked}
        icon={createMenuIcon(SPARKLES_PATH, big ? 19 : 17)}
        title={t('ai_post', 'AI post')}
        description={t(
          'create_ai_post_sub',
          'Describe it and get a first draft'
        )}
        onClick={createAiPost}
      />
      {!big && <div className="mx-[6px] my-[4px] h-px bg-pqLine" />}
      <CreateMenuItem
        big={big}
        icon={createMenuIcon(CHAT_PATH, big ? 19 : 17)}
        title={t('plan_with_copilot', 'Plan with AI Copilot')}
        description={t(
          'plan_with_copilot_sub',
          'Several posts, images and times in one chat'
        )}
        onClick={planWithCopilot}
      />
    </>
  );

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <div
        ref={referenceRef}
        className={clsx(
          'flex overflow-hidden rounded-[10px] bg-pqBrand text-[14px] font-[500] text-pqOnBrand',
          mobile ? 'size-[44px]' : touch ? 'h-[44px]' : 'h-[36px]'
        )}
      >
        <button
          type="button"
          data-pq="create-post"
          aria-label={t('create_new_post', 'Create Post')}
          aria-haspopup={mobile ? 'dialog' : undefined}
          onClick={mobile ? () => setMenuOpen(true) : createAPost}
          className={clsx(
            'flex h-full items-center justify-center outline-none transition-colors hover:bg-black/10',
            mobile ? 'w-full' : 'gap-[6px] ps-[14px] pe-[10px]'
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 21 20"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M10.5001 4.16699V15.8337M4.66675 10.0003H16.3334"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {/* Phones drop the word and keep the icon — same rule as Help/streak. */}
          <span data-hdr-label="1">{t('create_new_post', 'Create Post')}</span>
        </button>
        {!mobile && (
        <button
          type="button"
          data-pq="create-post-menu"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={t('create_post_options', 'Create post options')}
          onClick={() => setMenuOpen((open) => !open)}
          className={clsx(
            // Seam between the two halves of the split. `white/25` rather than
            // `pqOnBrand/25`: that token is a bare `var()` with no
            // `<alpha-value>`, so the opacity modifier would be dropped —
            // and `--onBrand` is #ffffff in both themes anyway. `border-s`
            // keeps the seam on the inner edge under RTL.
            'flex h-full w-[32px] items-center justify-center border-s border-white/25 outline-none transition-colors hover:bg-black/10',
            menuOpen && 'bg-black/10'
          )}
        >
          <svg
            viewBox="0 0 12 12"
            width="12"
            height="12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        )}
      </div>
      {menuOpen && !mobile && (
        <div
          ref={floatingRef}
          role="menu"
          data-pq="create-post-dropdown"
          className="z-[80] w-[330px] overflow-hidden rounded-[16px] border border-pqBorder bg-pqPop p-[6px] shadow-menu"
        >
          {menuItems(false)}
        </div>
      )}
      {mobile && (
        <MobileSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={t('create', 'Create')}
        >
          <div role="menu" className="flex flex-col px-[6px] pb-[10px]">
            {menuItems(true)}
          </div>
        </MobileSheet>
      )}
    </div>
  );
};
