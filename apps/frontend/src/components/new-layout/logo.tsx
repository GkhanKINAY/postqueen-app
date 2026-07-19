'use client';

import Link from 'next/link';
import { PostQueenLogo } from '@gitroom/frontend/components/ui/logo.component';
import { useVariables } from '@gitroom/react/helpers/variable.context';

/**
 * Icon-only brand mark for the left rail (40px inside the 64px rail), with the
 * deployment's own hostname as a tagline under it. Links to the Calendar so the
 * crown doubles as a "home" affordance.
 */
export const Logo = () => {
  const { frontEndUrl } = useVariables();
  let host = '';
  try {
    host = new URL(frontEndUrl).hostname;
  } catch {
    // Unset or malformed: show the mark alone rather than a stale domain.
  }

  return (
  <Link
    href="/launches"
    aria-label="Calendar"
    className="flex flex-col items-center gap-[4px] transition-transform duration-200 hover:scale-105"
  >
    <PostQueenLogo tileClassName="size-10" />
    {!!host && (
      <span className="text-[9px] leading-none whitespace-nowrap font-[500] text-newTextColor/70">
        {host}
      </span>
    )}
  </Link>
  );
};
