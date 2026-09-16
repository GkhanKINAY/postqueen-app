'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import {
  FC,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useClickAway } from '@uidotdev/usehooks';
import ReactLoading from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useAnchoredPopover } from '@gitroom/frontend/components/layout/use.anchored.popover';
import { useDateFormat } from '@gitroom/frontend/components/launches/helpers/date.format';
import {
  NotificationAction,
  NotificationKind,
  splitNotificationContent,
} from '@gitroom/frontend/components/notifications/notification.look';
import { useViewport } from '@gitroom/frontend/components/layout/use.viewport';
import { MobileSheet } from '@gitroom/frontend/components/layout/mobile-sheet';

const NotificationKindIcon: FC<{ kind: NotificationKind; unread: boolean }> = ({
  kind,
  unread,
}) => {
  if (kind === 'success') {
    return (
      <span
        className="mt-[2px] grid size-[18px] shrink-0 place-items-center rounded-full bg-pqOk text-white"
        aria-hidden="true"
      >
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
          <path
            d="M2.4 6.2 4.8 8.6 9.6 3.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (kind === 'fail') {
    return (
      <span
        className="mt-[2px] grid size-[18px] shrink-0 place-items-center rounded-full bg-pqDanger text-white"
        aria-hidden="true"
      >
        <svg viewBox="0 0 12 12" width="9" height="9" fill="none">
          <path
            d="M3 3l6 6M9 3 3 9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  if (kind === 'warning') {
    return (
      <span
        className="mt-[2px] grid size-[18px] shrink-0 place-items-center rounded-full bg-pqAmber text-white"
        aria-hidden="true"
      >
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
          <path
            d="M6 2.4 10.4 10H1.6L6 2.4Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M6 5.2v2.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="6" cy="8.7" r="0.55" fill="currentColor" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={clsx(
        'mt-[6px] size-[6px] shrink-0 rounded-full',
        unread ? 'bg-pqBrand' : 'bg-transparent'
      )}
      aria-hidden="true"
    />
  );
};

function actionLabel(
  action: NotificationAction,
  t: ReturnType<typeof useT>
): string | null {
  if (action === 'view_post') {
    return t('view_post', 'View post');
  }
  if (action === 'reconnect') {
    return t('reconnect', 'Reconnect');
  }
  if (action === 'open_channel') {
    return t('open_channel', 'Open channel');
  }
  if (action === 'open_billing') {
    return t('go_to_billing', 'Go to billing');
  }
  if (action === 'open_calendar') {
    return t('open_calendar', 'Open calendar');
  }
  if (action === 'open_link') {
    return t('open_link', 'Open link');
  }
  return null;
}

export const ShowNotification: FC<{
  notification: {
    id: string;
    createdAt: string;
    content: string;
    link?: string | null;
  };
  /** Frozen lastRead from when the popover first loaded list data this open. */
  unreadCutoff: string;
  /** Local clear from "Mark all read". */
  forceRead?: boolean;
  onNavigate?: () => void;
}> = (props) => {
  const { notification, forceRead, unreadCutoff, onNavigate } = props;
  const unread =
    !forceRead &&
    new Date(notification.createdAt) > new Date(unreadCutoff);
  const createdAt = dayjs(notification.createdAt);
  const isWithin24h = dayjs().diff(createdAt, 'hour') < 24;
  const { mediumDateTimePattern } = useDateFormat();
  const t = useT();
  const fullDate = createdAt.format(mediumDateTimePattern());
  const { text, url, kind, action, external } = splitNotificationContent(
    notification.content,
    notification.link
  );
  const label = actionLabel(action, t);
  const ctaClass =
    'mt-[6px] inline-flex h-[26px] items-center rounded-[7px] bg-pqBrandSoft px-[10px] text-[12px] font-[600] text-pqFocused hover:bg-pqBoxFocused';
  return (
    <div
      className={clsx(
        'flex gap-[10px] border-b border-pqLine px-[16px] py-[12px] last:border-b-0',
        unread ? 'bg-pqBrandSoft' : 'bg-transparent'
      )}
    >
      <NotificationKindIcon kind={kind} unread={unread} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          className={clsx(
            'break-words text-[13.5px] leading-[1.5] text-pqText [overflow-wrap:anywhere]',
            unread ? 'font-[600]' : 'font-[400]'
          )}
        >
          {text}
        </div>
        {url && label && (
          external ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={ctaClass}
            >
              {label}
            </a>
          ) : (
            <Link
              href={url}
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.();
              }}
              className={ctaClass}
            >
              {label}
            </Link>
          )
        )}
        <div
          className="mt-[4px] text-[11.5px] font-normal text-pqSoft"
          title={isWithin24h ? fullDate : undefined}
        >
          {isWithin24h ? createdAt.fromNow() : fullDate}
        </div>
      </div>
    </div>
  );
};

export const NotificationOpenComponent = forwardRef<
  HTMLDivElement,
  {
    markedAllRead: boolean;
    onMarkAllRead: () => void;
    /** Bumps each open so SWR never paints a stale lastRead from a prior open. */
    listSession: number;
    unreadCutoff: string | null;
    onUnreadCutoff: (cutoff: string) => void;
    embedded?: boolean;
    onNavigate?: () => void;
  }
>(function NotificationOpenComponent(
  {
    markedAllRead,
    onMarkAllRead,
    listSession,
    unreadCutoff,
    onUnreadCutoff,
    embedded,
    onNavigate,
  },
  ref
) {
  const fetch = useFetch();
  const loadNotifications = useCallback(async () => {
    return await (await fetch('/notifications/list')).json();
  }, [fetch]);
  const t = useT();
  const badgeCleared = useRef(false);

  const { data, isLoading } = useSWR(
    ['notifications', listSession],
    loadNotifications
  );

  // Freeze the pre-read cutoff from the first list payload this open.
  useEffect(() => {
    if (!data || unreadCutoff !== null) {
      return;
    }
    onUnreadCutoff(
      data.lastReadNotifications ?? new Date(0).toISOString()
    );
  }, [data, unreadCutoff, onUnreadCutoff]);

  // Clear server unread (badge) after we have captured the cutoff for styling.
  // Matches prior WORK (open cleared lastRead) without wiping unread LOOK.
  useEffect(() => {
    if (!data || unreadCutoff === null || badgeCleared.current) {
      return;
    }
    badgeCleared.current = true;
    void fetch('/notifications/read', { method: 'POST' });
  }, [data, unreadCutoff, fetch]);

  const hasUnread =
    !markedAllRead &&
    unreadCutoff !== null &&
    !!data?.notifications?.some(
      (n: { createdAt: string }) =>
        new Date(n.createdAt) > new Date(unreadCutoff)
    );

  return (
    <div
      ref={ref}
      id="notification-popup"
      className={clsx(
        'flex min-h-[200px] cursor-default flex-col overflow-hidden bg-pqInner text-pqText',
        embedded
          ? 'w-full'
          : 'z-[600] w-[380px] max-w-[calc(100vw-16px)] rounded-pqLg border border-pqBorder shadow-pq animate-pqPop'
      )}
    >
      <div className="flex items-center border-b border-pqLine px-[16px] py-[12px]">
        {!embedded && (
          <span className="flex-1 text-[14px] font-[600] text-pqText">
            {t('notifications', 'Notifications')}
          </span>
        )}
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={!hasUnread}
          className={clsx(
            'border-0 bg-transparent font-inherit text-[12.5px] font-[600]',
            embedded && 'ms-auto',
            hasUnread
              ? 'cursor-pointer text-pqFocused hover:underline'
              : 'cursor-default text-pqSoft'
          )}
        >
          {t('mark_all_read', 'Mark all read')}
        </button>
      </div>

      <div
        className={clsx(
          'flex flex-col overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor',
          embedded ? 'max-h-none' : 'max-h-[380px]'
        )}
      >
        {isLoading && (
          <div className="flex flex-1 justify-center pt-12 text-pqText">
            <ReactLoading width={36} height={36} />
          </div>
        )}
        {!isLoading && !data?.notifications?.length && (
          <div className="mt-[20px] flex flex-1 flex-col items-center justify-center gap-[6px] p-[24px] text-center text-pqSoft">
            <span className="text-[13.5px] font-[600] text-pqMuted">
              {t('no_notifications', 'No notifications')}
            </span>
            <span className="text-[12px]">
              {t(
                'no_notifications_hint',
                'Publish, reconnect, and billing updates will show up here.'
              )}
            </span>
          </div>
        )}
        {/* `data?.notifications?.length` three lines up is the safe form; this
            one dereferenced straight through. `unreadCutoff` is set from any
            truthy `data`, so a `{statusCode, message}` error body satisfied the
            guard and `.map` threw. */}
        {!isLoading &&
          unreadCutoff !== null &&
          data?.notifications?.map(
            (notification: {
              id: string;
              createdAt: string;
              content: string;
              link?: string | null;
            }) => (
              <ShowNotification
                notification={notification}
                unreadCutoff={unreadCutoff}
                forceRead={markedAllRead}
                onNavigate={onNavigate}
                key={notification.id}
              />
            )
          )}
      </div>
    </div>
  );
});

const NotificationComponent = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const { touch } = useViewport();
  const [show, setShow] = useState(false);
  const [markedAllRead, setMarkedAllRead] = useState(false);
  const [unreadCutoff, setUnreadCutoff] = useState<string | null>(null);
  const [listSession, setListSession] = useState(0);
  const loadNotifications = useCallback(async () => {
    return await (await fetch('/notifications')).json();
  }, [fetch]);
  const { data, mutate } = useSWR('notifications-list', loadNotifications);
  const changeShow = useCallback(() => {
    mutate(
      {
        ...data,
        total: 0,
      },
      {
        revalidate: false,
      }
    );
    setShow((open) => {
      if (open) {
        return false;
      }
      // Fresh open: new list session + capture unread LOOK before POST /read.
      setMarkedAllRead(false);
      setUnreadCutoff(null);
      setListSession((n) => n + 1);
      return true;
    });
  }, [data, mutate]);
  const markAllRead = useCallback(() => {
    // Open already POSTs /notifications/read for the badge; call again so an
    // explicit Mark all read still persists if that request failed.
    void fetch('/notifications/read', { method: 'POST' });
    setMarkedAllRead(true);
    mutate({ ...data, total: 0 }, { revalidate: false });
    toaster.show(
      t(
        'all_notifications_marked_as_read',
        'All notifications marked as read'
      )
    );
  }, [data, fetch, mutate, t, toaster]);
  const onUnreadCutoff = useCallback((cutoff: string) => {
    setUnreadCutoff(cutoff);
  }, []);
  const close = useCallback(() => setShow(false), []);
  const ref = useClickAway<HTMLDivElement>(() => {
    if (!touch) setShow(false);
  });
  const { referenceRef, floatingRef } = useAnchoredPopover<
    HTMLButtonElement,
    HTMLDivElement
  >(show, 'end', { offsetPx: 10 });
  return (
    <div className="relative cursor-pointer select-none" ref={ref}>
      <button
        type="button"
        ref={referenceRef}
        onClick={changeShow}
        aria-label={t('notifications', 'Notifications')}
        aria-expanded={show}
        className={clsx(
          'relative grid place-items-center rounded-[8px] text-pqSoft transition-colors hover:bg-pqHover hover:text-pqText',
          touch ? 'size-[44px]' : 'size-[30px]',
          show && 'bg-pqHover text-pqText'
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          {/* Lucide bell. The previous expanded cubic skipped 4.88258 on the
              left dome, so only the clapper stroke painted. */}
          <path
            d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {data && data.total > 0 && (
          <span
            className="absolute end-[6px] top-[5px] size-[7px] rounded-full bg-pqPink shadow-[0_0_0_2px_var(--rail)]"
            aria-hidden="true"
          />
        )}
      </button>
      {show &&
        (touch ? (
          <MobileSheet
            open={show}
            onClose={close}
            title={t('notifications', 'Notifications')}
          >
            <NotificationOpenComponent
              markedAllRead={markedAllRead}
              onMarkAllRead={markAllRead}
              listSession={listSession}
              unreadCutoff={unreadCutoff}
              onUnreadCutoff={onUnreadCutoff}
              onNavigate={close}
              embedded
            />
          </MobileSheet>
        ) : (
          <NotificationOpenComponent
            ref={floatingRef}
            markedAllRead={markedAllRead}
            onMarkAllRead={markAllRead}
            listSession={listSession}
            unreadCutoff={unreadCutoff}
            onUnreadCutoff={onUnreadCutoff}
            onNavigate={close}
          />
        ))}
    </div>
  );
};
export default NotificationComponent;
