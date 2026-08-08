'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useCookie from 'react-use-cookie';
export const AfterActivate = () => {
  const fetch = useFetch();
  const params = useParams();
  const [showLoader, setShowLoader] = useState(true);
  const [failed, setFailed] = useState(false);
  const run = useRef(false);
  const t = useT();
  const [datafast_visitor_id] = useCookie('datafast_visitor_id');

  useEffect(() => {
    if (!run.current) {
      run.current = true;
      loadCode();
    }
  }, []);
  const loadCode = useCallback(async () => {
    if (!params.code) {
      return;
    }

    // `verifyJWT` throws on an expired or tampered token and the controller has
    // no try/catch, so this answers 500 as often as it answers `{can:false}`.
    // Unchecked, the throw left `showLoader` true forever — a permanent spinner
    // with no way out.
    try {
      const response = await fetch(`/auth/activate`, {
        method: 'POST',
        body: JSON.stringify({
          code: params.code,
          datafast_visitor_id,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        setFailed(true);
        setShowLoader(false);
        return;
      }

      const { can } = await response.json();
      if (!can) {
        setShowLoader(false);
      }
    } catch (e) {
      setFailed(true);
      setShowLoader(false);
    }
  }, []);
  return (
    <>
      {showLoader ? (
        <LoadingComponent />
      ) : (
        <>
          {/* The backend returns a falsy `can` for "already activated" AND for
              an expired or tampered link, so it cannot tell them apart — the
              old copy asserted the first and was simply wrong for the second.
              Say what is true for both. */}
          {failed
            ? t(
                'activation_check_failed',
                'We could not confirm this link. Please try again in a moment.'
              )
            : t(
                'activation_link_not_valid',
                'This activation link is no longer valid — it may have expired, or the account is already active.'
              )}
          <br />
          <Link href="/auth/login" className="underline">
            {t(
              'click_here_to_go_back_to_login',
              'Click here to go back to login'
            )}
          </Link>
        </>
      )}
    </>
  );
};
