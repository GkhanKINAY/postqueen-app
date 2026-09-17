'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser, useRevalidateIdentity } from '@gitroom/frontend/components/layout/user.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { modalFieldClass } from '@gitroom/frontend/components/layout/new-modal';

const ghostBtn =
  'h-[40px] shrink-0 rounded-[10px] px-[13px] text-[12.5px] font-[500] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText';

const PencilIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WorkspaceNameComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const toaster = useToaster();
  const revalidateIdentity = useRevalidateIdentity();
  const [name, setName] = useState(user?.orgName || '');
  const [nameOpen, setNameOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.orgName || '');
  }, [user?.orgName]);

  const closeEditor = useCallback(() => {
    setName(user?.orgName || '');
    setNameOpen(false);
  }, [user?.orgName]);

  const save = useCallback(async () => {
    const next = name.trim();
    if (next === (user?.orgName || '').trim()) {
      setNameOpen(false);
      return;
    }
    if (next.length < 3 || next.length > 64) {
      toaster.show(
        t(
          'organization_name_length',
          'Organization name must be between 3 and 64 characters'
        ),
        'warning'
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/settings/organization', {
        method: 'POST',
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const { message } = await res.json().catch(() => ({ message: '' }));
        toaster.show(
          message || t('could_not_save', 'Could not save'),
          'warning'
        );
        return;
      }
      const body = await res.json();
      const saved = typeof body?.name === 'string' ? body.name : next;
      setName(saved);
      await revalidateIdentity({ orgName: saved });
      toaster.show(t('settings_updated', 'Settings updated'), 'success');
      setNameOpen(false);
    } finally {
      setSaving(false);
    }
  }, [name, user?.orgName, fetch, toaster, t, revalidateIdentity]);

  if (user?.role !== 'SUPERADMIN') {
    return null;
  }

  const nameDirty = name.trim() !== (user?.orgName || '').trim();

  return (
    <div
      data-pq="organization-name"
      className="rounded-pqMd bg-pqPop p-[15px_16px] shadow-[inset_0_0_0_1px_var(--border)]"
    >
      <div className="text-[13.5px] font-[600] text-pqText">
        {t('organization_name', 'Organization name')}
      </div>
      <div className="mt-[2px] text-[12px] text-pqMuted">
        {t(
          'organization_name_description',
          'Shown in the organization switcher and on invoices.'
        )}
      </div>
      {!nameOpen ? (
        <div
          data-pq="organization-name-display"
          className="mt-[14px] flex items-center gap-[10px]"
        >
          <div className="min-w-0 flex-1 truncate text-[15px] font-[600] text-pqText">
            {user?.orgName || t('organization_name', 'Organization name')}
          </div>
          <button
            type="button"
            aria-label={t('edit', 'Edit')}
            onClick={() => {
              setName(user?.orgName || '');
              setNameOpen(true);
            }}
            className="grid size-[32px] shrink-0 place-items-center rounded-[8px] text-pqMuted transition-colors hover:bg-pqHover hover:text-pqText"
          >
            <PencilIcon />
          </button>
        </div>
      ) : (
        <div
          data-pq="organization-name-edit"
          className="mt-[14px] flex flex-col gap-[10px]"
        >
          <input
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void save();
              }
              if (event.key === 'Escape') {
                closeEditor();
              }
            }}
            className={modalFieldClass}
          />
          <div className="flex flex-wrap items-center justify-end gap-[8px]">
            <Button
              loading={saving}
              disabled={!nameDirty}
              onClick={save}
              className="h-[40px] shrink-0 rounded-[10px] px-[18px] text-[13.5px] font-[600]"
            >
              {t('save', 'Save')}
            </Button>
            <button type="button" onClick={closeEditor} className={ghostBtn}>
              {t('cancel', 'Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceNameComponent;
