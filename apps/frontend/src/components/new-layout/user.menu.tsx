'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { setCookie } from '@gitroom/frontend/components/layout/layout.context';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/** First initial for the avatar fallback, from name or email. */
function initialOf(user: { name?: string; email?: string } | undefined) {
  const source = user?.name?.trim() || user?.email?.trim() || '';
  return source ? source[0].toUpperCase() : '?';
}

/**
 * Identity in the top-right: avatar + name that opens a menu with the user's
 * email, a link to Settings and Logout. Before this the chrome showed no user
 * at all and logout was buried at the bottom of the settings sub-nav.
 */
export const UserMenu = () => {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const fetch = useFetch();
  const { isGeneral, isSecured } = useVariables();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logout = useCallback(async () => {
    setOpen(false);
    if (
      await deleteDialog(
        t('are_you_sure_you_want_to_logout', 'Are you sure you want to logout?'),
        t('yes_logout', 'Yes logout')
      )
    ) {
      if (!isSecured) {
        setCookie('auth', '', -10);
      } else {
        await fetch('/user/logout', { method: 'POST' });
      }
      window.location.href = '/';
    }
  }, [isSecured]);

  if (!user) return null;

  const displayName = user.name?.trim() || user.email?.split('@')[0] || 'Account';
  const picture = (user as { picture?: { path?: string } }).picture?.path;

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account_menu', 'Account menu')}
        className="grid size-[34px] place-items-center rounded-full ring-1 ring-transparent hover:ring-newBorder transition-all"
      >
        <span className="grid size-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-btnPrimary text-[13px] font-[600] text-white">
          {picture ? (
            <img src={picture} alt="" className="size-full object-cover" />
          ) : (
            initialOf(user)
          )}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-[calc(100%+8px)] z-[300] w-[240px] overflow-hidden rounded-[12px] border border-newBorder bg-newBgColorInner shadow-lg"
        >
          <div className="flex items-center gap-[10px] border-b border-newBorder px-[14px] py-[12px]">
            <span className="grid size-[36px] shrink-0 place-items-center overflow-hidden rounded-full bg-btnPrimary text-[15px] font-[600] text-white">
              {picture ? (
                <img
                  src={picture}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                initialOf(user)
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-[600] text-newTextColor">
                {displayName}
              </div>
              <div className="truncate text-[12px] text-textItemBlur">
                {user.email}
              </div>
            </div>
          </div>
          <div className="p-[6px]">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push('/settings');
              }}
              className="flex w-full items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] text-[13px] text-newTextColor hover:bg-boxHover transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              {t('settings', 'Settings')}
            </button>
          </div>
          <div className="border-t border-newBorder p-[6px]">
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] text-[13px] text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t('logout_from', 'Logout from')}
              {isGeneral ? ' PostQueen' : ' PostQueen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
