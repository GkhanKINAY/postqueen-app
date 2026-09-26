'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Slider } from '@gitroom/react/form/slider';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Skeleton } from '@gitroom/react/ui/skeleton';
import { useVariables } from '@gitroom/react/helpers/variable.context';

interface EmailNotifications {
  sendSuccessEmails: boolean;
  sendFailureEmails: boolean;
  sendStreakEmails: boolean;
}

export const useEmailNotifications = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    return (await fetch('/user/email-notifications')).json();
  }, [fetch]);

  return useSWR<EmailNotifications>('email-notifications', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

interface ProductNews {
  /** Null when this install keeps no choice to show. */
  subscribed: boolean | null;
}

// Kept on the mailing list rather than the account, so it loads and saves on
// its own, and only where the install sends product news at all.
export const useProductNews = (enabled: boolean) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch('/user/product-news');
    if (!response.ok) {
      throw new Error('Failed to load product news');
    }
    return response.json();
  }, [fetch]);

  return useSWR<ProductNews>(enabled ? 'product-news' : null, load, {
    // A list that is down hides the row; retrying would only repeat the 500.
    shouldRetryOnError: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const SwitchRow: FC<{
  name: string;
  description: string;
  on: boolean;
  onChange: (on: boolean) => void;
}> = ({ name, description, on, onChange }) => (
  <div className="flex items-center gap-[14px] border-t border-pqLine py-[11px]">
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-[500] text-pqText">{name}</div>
      <div className="mt-[2px] text-[12px] text-pqMuted">{description}</div>
    </div>
    <Slider
      value={on ? 'on' : 'off'}
      onChange={(value) => onChange(value === 'on')}
      fill={true}
    />
  </div>
);

const EmailNotificationsComponent = () => {
  const t = useT();
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading } = useEmailNotifications();
  const { productNewsEnabled } = useVariables();
  const {
    data: news,
    isLoading: newsLoading,
    mutate: mutateNews,
  } = useProductNews(productNewsEnabled);
  const newsOn = typeof news?.subscribed === 'boolean' ? news.subscribed : null;
  // Each save is several calls to the list, so a second click waits for the
  // first instead of racing it.
  const savingNews = useRef(false);

  const [localSettings, setLocalSettings] = useState<EmailNotifications>({
    sendSuccessEmails: true,
    sendFailureEmails: true,
    sendStreakEmails: true,
  });

  // Keep a ref to always have the latest state
  const settingsRef = useRef(localSettings);
  settingsRef.current = localSettings;

  // Sync local state with fetched data
  useEffect(() => {
    if (data) {
      setLocalSettings(data);
    }
  }, [data]);

  const updateSetting = useCallback(
    async (key: keyof EmailNotifications, value: boolean) => {
      const currentSettings = settingsRef.current;
      const previous = currentSettings;
      const newData = {
        ...currentSettings,
        [key]: value,
      };

      setLocalSettings(newData);

      try {
        const response = await fetch('/user/email-notifications', {
          method: 'POST',
          body: JSON.stringify(newData),
        });
        if (!response.ok) {
          throw new Error('Failed to update email notifications');
        }
        toaster.show(t('settings_updated', 'Settings updated'), 'success');
      } catch {
        setLocalSettings(previous);
        toaster.show(
          t('something_went_wrong', 'Something went wrong'),
          'warning'
        );
      }
    },
    [fetch, toaster, t]
  );

  const updateNews = useCallback(
    async (value: boolean) => {
      if (savingNews.current) {
        return;
      }
      savingNews.current = true;
      const previous = news;
      mutateNews({ subscribed: value }, { revalidate: false });

      try {
        const response = await fetch('/user/product-news', {
          method: 'POST',
          body: JSON.stringify({ subscribed: value }),
        });
        if (!response.ok) {
          throw new Error('Failed to update product news');
        }
        toaster.show(t('settings_updated', 'Settings updated'), 'success');
      } catch {
        mutateNews(previous, { revalidate: false });
        toaster.show(
          t('something_went_wrong', 'Something went wrong'),
          'warning'
        );
      } finally {
        savingNews.current = false;
      }
    },
    [fetch, toaster, t, news, mutateNews]
  );

  const rows: {
    key: keyof EmailNotifications;
    name: string;
    description: string;
  }[] = [
    {
      key: 'sendSuccessEmails',
      name: t('success_emails', 'Success Emails'),
      description: t(
        'success_emails_description',
        'Receive email notifications when posts are published successfully'
      ),
    },
    {
      key: 'sendFailureEmails',
      name: t('failure_emails', 'Failure Emails'),
      description: t(
        'failure_emails_description',
        'Receive email notifications when posts fail to publish'
      ),
    },
    {
      key: 'sendStreakEmails',
      name: t('streak_emails', 'Streak Ended Emails'),
      description: t(
        'streak_emails_description',
        'Receive an email when your posting streak ends, 24 hours after your last published post'
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="mt-[18px] flex flex-col gap-[12px] rounded-pqMd bg-pqPop p-[15px_16px] shadow-[inset_0_0_0_1px_var(--border)]">
        {Array.from({ length: productNewsEnabled ? 4 : 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-[12px]">
            <Skeleton className="h-[13px] min-w-0 flex-1" />
            <Skeleton className="h-[20px] w-[38px] shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-[18px] flex flex-col gap-[10px]">
      <div className="rounded-pqMd bg-pqPop p-[15px_16px] shadow-[inset_0_0_0_1px_var(--border)]">
        <div className="flex items-center justify-between gap-[14px] pb-[6px]">
          <div className="min-w-0">
            <div className="text-[13.5px] font-[600] text-pqText">
              {t('email', 'Email')}
            </div>
            {!!user?.email && (
              <div className="mt-[2px] truncate text-[12px] text-pqMuted">
                {user.email}
              </div>
            )}
          </div>
        </div>
        {rows.map((row) => (
          <SwitchRow
            key={row.key}
            name={row.name}
            description={row.description}
            on={localSettings[row.key]}
            onChange={(on) => updateSetting(row.key, on)}
          />
        ))}
        {newsLoading && (
          <div className="flex items-center gap-[12px] border-t border-pqLine py-[11px]">
            <Skeleton className="h-[13px] min-w-0 flex-1" />
            <Skeleton className="h-[20px] w-[38px] shrink-0 rounded-full" />
          </div>
        )}
        {newsOn !== null && (
          <SwitchRow
            name={t('product_news', 'Product news')}
            description={t(
              'product_news_description',
              'Receive an email about new features and improvements, now and then'
            )}
            on={newsOn}
            onChange={updateNews}
          />
        )}
      </div>
    </div>
  );
};

export default EmailNotificationsComponent;
