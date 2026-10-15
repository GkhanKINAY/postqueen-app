'use client';

import { useSearchParams } from 'next/navigation';
import { FC, useCallback, useEffect } from 'react';
// A sign-in someone gave up on must not open its return page, such as an
// OAuth consent screen, at an unrelated sign-in days later
const RETURN_URL_TTL = 15 * 60 * 1000;
const ReturnUrlComponent: FC = () => {
  const params = useSearchParams();
  const url = params.get('returnUrl');
  useEffect(() => {
    if (url?.indexOf?.('http')! > -1) {
      localStorage.setItem('returnUrl', url!);
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
      return data && Date.now() - at < RETURN_URL_TTL ? data : null;
    }, []),
  };
};
export default ReturnUrlComponent;
