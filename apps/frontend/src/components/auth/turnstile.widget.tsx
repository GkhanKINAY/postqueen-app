'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

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

/** How long to wait for challenges.cloudflare.com before giving up. */
const SCRIPT_TIMEOUT_MS = 10000;

// Load the Cloudflare Turnstile script once. Resolves true when
// `window.turnstile` is available, false when it cannot be loaded.
//
// Every path used to resolve only on `load`: no `error` listener, no timeout,
// and the SSR branch returned without settling at all. If the script is blocked
// — ad blocker, corporate proxy, CSP, regional block — the promise never
// settled, the widget never rendered, and "Send code" stayed disabled forever
// with nothing on screen to explain it. That is the whole passwordless flow
// dead for a real slice of users.
function ensureScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.turnstile) return resolve(true);

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), SCRIPT_TIMEOUT_MS);
    const onLoad = () => {
      clearTimeout(timer);
      finish(!!window.turnstile);
    };
    const onError = () => {
      clearTimeout(timer);
      finish(false);
    };

    const existing = document.getElementById(
      SCRIPT_ID
    ) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) {
        clearTimeout(timer);
        return finish(true);
      }
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', onError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
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
  const [unavailable, setUnavailable] = useState(false);
  const t = useT();

  useEffect(() => {
    let cancelled = false;

    ensureScript().then((ok) => {
      if (cancelled) return;
      if (!ok || !ref.current || !window.turnstile) {
        // Say so rather than leaving an empty box next to a permanently
        // disabled button. Deliberately NOT auto-enabling submit: when
        // TURNSTILE_SECRET is set the server rejects a missing token anyway,
        // and that rejection is far more opaque than this line.
        setUnavailable(true);
        return;
      }
      setUnavailable(false);
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

  return (
    <div className="mt-[4px]">
      <div ref={ref} />
      {unavailable && (
        <div className="text-[12.5px] leading-[1.5] text-pqWarn">
          {t(
            'captcha_unavailable',
            'The captcha could not load — it may be blocked by your browser or network. Reload the page to try again.'
          )}
        </div>
      )}
    </div>
  );
}
