'use client';

import { FC, useEffect } from 'react';
import { showToast } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * `customFetch` deliberately RESOLVES on 4xx/5xx, so call sites guard with
 * `response.ok`. A genuine network failure — backend restarting, offline, DNS,
 * CORS — is different: the browser's `fetch` REJECTS, and no `.ok` check can
 * see it. Roughly 75 click handlers across the app `await fetch(...)` without a
 * `catch`, so that rejection goes unhandled.
 *
 * There is no error boundary below `app/global-error.tsx` and no route-level
 * `error.tsx`, which makes the symptom environment-dependent and both flavours
 * bad: the Next.js overlay in dev, and — because an unhandled rejection in an
 * event handler does not replace the page in production — a completely silent
 * dead button for real users.
 *
 * This is the safety net, not the fix. It only observes: no data flow changes,
 * no success path touched. Individual handlers still need their own `catch` to
 * clear loading state (the canonical shape is `launches/ai.video.tsx:92-107`),
 * because a toast cannot un-disable a spinner.
 */

// Same patterns Sentry already classifies as non-alerting
// (`initialize.sentry.next.basic.ts:8-15`). Anything else is a real bug and
// must keep surfacing exactly as it does today.
const NETWORK_ERROR = /failed to fetch|load failed|networkerror when attempting/i;

const isNetworkError = (reason: unknown) => {
  if (!reason) return false;
  const message =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
      ? reason.message
      : String((reason as any)?.message ?? '');
  return NETWORK_ERROR.test(message);
};

export const NetworkErrorBridge: FC = () => {
  const t = useT();

  useEffect(() => {
    // One failing action usually means several parallel requests failing, and
    // the toaster shows one at a time — without this the last of a burst wins
    // and the toast lingers long after the click.
    let lastShown = 0;

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isNetworkError(event.reason)) {
        return;
      }

      // Marks the rejection handled, which is what suppresses the dev overlay.
      event.preventDefault();

      const now = Date.now();
      if (now - lastShown < 5000) {
        return;
      }
      lastShown = now;

      showToast(
        t(
          'network_error_toast',
          'Could not reach the server. Check your connection and try again.'
        ),
        'warning'
      );
    };

    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [t]);

  return null;
};
