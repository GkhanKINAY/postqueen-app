'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { setCookie } from '@gitroom/frontend/components/layout/layout.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Spinner } from '@gitroom/react/ui/spinner';
import { TrashIcon } from '@gitroom/frontend/components/ui/icons';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useRouter } from 'next/navigation';
import { modalFieldClass } from '@gitroom/frontend/components/layout/new-modal';

interface DeleteAccountInfo {
  hasSubscription: boolean;
  hasAdditionalMembers: boolean;
}

// What deleting the account also does: the subscription it cancels and the
// team members it removes. Read when the section mounts, so the warning is
// right by the time the form opens, and again when Delete is pressed.
const useDeleteAccountInfo = (enabled: boolean) => {
  const fetch = useFetch();
  const load = useCallback(async (): Promise<DeleteAccountInfo> => {
    // customFetch resolves a 4xx/5xx; a failed read must not look like an
    // account with nothing else to lose.
    const response = await fetch('/user/delete-account-info');
    if (!response.ok) {
      throw new Error('Could not load what deleting the account does');
    }
    return response.json();
  }, [fetch]);
  return useSWR(enabled ? 'delete-account-info' : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};

const DeleteAccountComponent: FC<{ isLink?: boolean }> = ({ isLink }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const router = useRouter();
  const { isSecured } = useVariables();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { data: info, mutate: reloadInfo } = useDeleteAccountInfo(!isLink);

  // The subscription is cancelled now and the other members are removed;
  // nothing is said about money, since refunds go by request.
  const effects = useCallback(
    (current?: DeleteAccountInfo) =>
      current?.hasSubscription && current?.hasAdditionalMembers
        ? t(
            'delete_account_confirm_subscription_members',
            'Your account, organizations, channels and posts will be deleted, your subscription will be cancelled now and the other team members will be removed from your organization. This cannot be undone.'
          )
        : current?.hasSubscription
        ? t(
            'delete_account_confirm_subscription',
            'Your account, organizations, channels and posts will be deleted and your subscription will be cancelled now. This cannot be undone.'
          )
        : current?.hasAdditionalMembers
        ? t(
            'delete_account_confirm_members',
            'Your account, organizations, channels and posts will be deleted and the other team members will be removed from your organization. This cannot be undone.'
          )
        : null,
    [t]
  );

  const goToAccount = useCallback(() => {
    router.push('/settings?tab=account');
  }, [router]);

  const closeForm = useCallback(() => {
    setOpen(false);
    setEmail('');
    setPassword('');
  }, []);

  const deleteAccount = useCallback(async () => {
    // Read again at the click: a subscription or a member may have come or
    // gone since the section loaded.
    const current = await reloadInfo().catch((): undefined => undefined);
    if (
      !(await deleteDialog(
        effects(current) ||
          t(
            'delete_account_confirm',
            'Your account, organizations, channels and posts will be deleted. This action cannot be undone, are you sure?'
          ),
        t('yes_delete_my_account', 'Yes, delete my account')
      ))
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/user/delete-account', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password: password || undefined,
        }),
      });

      if (response.status !== 200 && response.status !== 201) {
        const { message } = await response.json().catch(() => ({
          message: '',
        }));
        toaster.show(
          message ||
            t('could_not_delete_account', 'Could not delete your account'),
          'warning'
        );
        return;
      }

      if (!isSecured) {
        setCookie('auth', '', -10);
      }
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  }, [fetch, isSecured, t, toaster, email, password, reloadInfo, effects]);

  const loadingOverlay = loading && (
    <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center gap-[16px] bg-pqBg/90">
      <Spinner width={48} height={48} borderWidth={3} className="text-pqBrand" />
      <div className="text-[20px] font-[600] text-pqText">
        {t('deleting_your_account', 'Deleting your account...')}
      </div>
      <div className="max-w-[360px] text-center text-[14px] text-pqMuted">
        {t(
          'deleting_your_account_description',
          'We are removing your channels and posts, this can take a while. Please don’t close this window.'
        )}
      </div>
    </div>
  );

  if (isLink) {
    return (
      <>
        {loadingOverlay}
        <button
          type="button"
          className="flex cursor-pointer items-center gap-[8px] text-[14px] text-pqDanger transition-opacity hover:opacity-80"
          onClick={goToAccount}
        >
          <TrashIcon size={16} />
          <div>{t('delete_account', 'Delete Account')}</div>
        </button>
      </>
    );
  }

  const emailMatches =
    !!user?.email && email.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <div
      data-pq="account-delete"
      data-open={open ? '1' : '0'}
      className="rounded-pqMd bg-pqDangerSoft p-[15px_16px] shadow-[inset_0_0_0_1px_var(--dangerLine)]"
    >
      {loadingOverlay}
      <div className="flex items-start gap-[12px]">
        <span className="grid size-[36px] shrink-0 place-items-center rounded-[10px] bg-pqDangerChip text-pqDanger">
          <TrashIcon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-[600] text-pqText">
            {t('delete_account', 'Delete Account')}
          </div>
          <div className="mt-[3px] text-[12.5px] leading-[1.45] text-pqMuted">
            {t(
              'delete_account_description',
              'Your account, organizations and channels will be deleted permanently'
            )}
          </div>
        </div>
      </div>

      {!open ? (
        <div className="mt-[14px] flex justify-end">
          <Button
            variant="danger"
            className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
            onClick={() => setOpen(true)}
          >
            {t('delete_account', 'Delete Account')}
          </Button>
        </div>
      ) : (
        <div className="mt-[14px] flex min-w-0 flex-col gap-[10px]">
          <div
            role="alert"
            className="rounded-[10px] bg-pqDangerChip px-[12px] py-[10px] text-[12.5px] leading-[1.5] text-pqDanger"
          >
            {effects(info) ||
              t(
                'delete_account_warning',
                'This permanently deletes your account, organizations, channels and posts. This cannot be undone.'
              )}
          </div>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('type_your_email', 'Type your email to confirm')}
            className={modalFieldClass}
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('current_password', 'Current password')}
            className={modalFieldClass}
            autoComplete="current-password"
          />
          <p className="text-[12px] leading-[1.4] text-pqMuted">
            {t(
              'delete_account_password_hint',
              'Or re-authenticate with a connected account instead of a password.'
            )}
          </p>
          <div className="mt-[4px] flex flex-wrap items-center justify-end gap-[8px]">
            <Button
              variant="danger"
              className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
              loading={loading}
              disabled={!emailMatches}
              onClick={deleteAccount}
            >
              {t('delete_account', 'Delete Account')}
            </Button>
            <button
              type="button"
              onClick={closeForm}
              className="h-[40px] shrink-0 rounded-[10px] bg-pqBtnSimple px-[18px] text-[13.5px] font-[600] text-pqText transition-shadow hover:shadow-[inset_0_0_0_999px_var(--hover)]"
            >
              {t('cancel', 'Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeleteAccountComponent;
