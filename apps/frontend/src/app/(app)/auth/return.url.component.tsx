'use client';

import { useSearchParams } from 'next/navigation';
import { FC, useCallback, useEffect } from 'react';
// A sign-in someone gave up on must not open its return page, such as an
// OAuth consent screen, at an unrelated sign-in days later
const RETURN_URL_TTL = 15 * 60 * 1000;

// Only an address on this app, so signing in can never send someone to
// another site or run a javascript: URL. A path is read against this origin,
// so `//other.site` resolves to that site and is refused like any other.
export const sameOriginUrl = (url: string | null, origin: string) => {
  if (!url) {
    return null;
  }
  try {
    const base = new URL(origin);
    const parsed = new URL(url, base);
    return parsed.origin === base.origin && parsed.protocol === base.protocol
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const ReturnUrlComponent: FC = () => {
  const params = useSearchParams();
  const url = params.get('returnUrl');
  useEffect(() => {
    const returnUrl = sameOriginUrl(url, window.location.origin);
    if (returnUrl) {
      localStorage.setItem('returnUrl', returnUrl);
      localStorage.setItem('returnUrlAt', String(Date.now()));
    }
  }, [url]);
  return null;
};
export const useReturnUrl = () => {
  return {
    getAndClear: useCallback(() => {
      const data = localStorage.getItem('returnUrl');
      const at = Number(localStorage.getItem('returnUrlAt'));
      localStorage.removeItem('returnUrl');
      localStorage.removeItem('returnUrlAt');
      // also on read: localStorage can hold a value saved before this check
      return data && Date.now() - at < RETURN_URL_TTL
        ? sameOriginUrl(data, window.location.origin)
        : null;
    }, []),
  };
};
export default ReturnUrlComponent;
