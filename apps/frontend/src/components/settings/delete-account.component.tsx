'use client';

import React, { FC, useCallback, useState } from 'react';
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

  const goToAccount = useCallback(() => {
    router.push('/settings?tab=account');
  }, [router]);

  const closeForm = useCallback(() => {
    setOpen(false);
    setEmail('');
    setPassword('');
  }, []);

  const deleteAccount = useCallback(async () => {
    if (
      !(await deleteDialog(
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
  }, [fetch, isSecured, t, toaster, email, password]);

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
            {t(
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
              className="h-[40px] w-[110px] shrink-0 rounded-[10px] bg-transparent text-[13.5px] font-[500] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover"
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
