'use client';

import { FC, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// /oauth/hubspot/callback sends people here after they install the PostQueen
// app in HubSpot, and the calendar alone doesn't say what just happened
export const HubspotInstalled: FC = () => {
  const searchParams = useSearchParams();
  const installed = searchParams.get('hubspot') === 'installed';
  const modal = useDecisionModal();
  const t = useT();
  const shown = useRef(false);

  useEffect(() => {
    if (!installed || shown.current) {
      return;
    }
    shown.current = true;
    (async () => {
      await modal.open({
        title: t('hubspot_installed', 'PostQueen is installed in HubSpot'),
        onlyApprove: true,
        approveLabel: t('ok', 'OK'),
        description: t(
          'hubspot_installed_description',
          'Connect the channels you want to post to here in PostQueen. Then, in HubSpot, open Agent Hub > Agent Builder, add a tool, pick PostQueen under MCP Servers and click Connect and add.'
        ),
      });
      // drop the params once closed, so a reload of the calendar doesn't
      // show it again; the calendar's own ones stay (calendar.context's
      // `now` cleanup does the same)
      const cleaned = new URLSearchParams(window.location.search);
      cleaned.delete('hubspot');
      cleaned.delete('returnUrl');
      const q = cleaned.toString();
      window.history.replaceState(
        null,
        '',
        q ? `/launches?${q}` : '/launches'
      );
    })();
  }, [installed, modal, t]);

  return null;
};
