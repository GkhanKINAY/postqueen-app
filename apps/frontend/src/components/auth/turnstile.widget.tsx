'use client';

import { useEffect, useRef } from 'react';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'flexible' | 'compact';
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Load the Cloudflare Turnstile script once, resolving when window.turnstile
// is available.
function ensureScript(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return;
    if (window.turnstile) return resolve();

    const existing = document.getElementById(
      SCRIPT_ID
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(), { once: true });
    document.head.appendChild(script);
  });
}

/**
 * Cloudflare Turnstile widget (explicit render). Emits the token via `onToken`
 * on success, and an empty string on expiry/error so the caller can require a
 * fresh solve. Only rendered when a site key is configured; with no key the
 * whole widget is absent and the server skips the captcha gate.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme: 'auto',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // widget already gone; nothing to clean up
        }
        widgetId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return <div ref={ref} className="mt-[4px]" />;
}
