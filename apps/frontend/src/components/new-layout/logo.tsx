'use client';

import Link from 'next/link';
import { PostQueenLogo } from '@gitroom/frontend/components/ui/logo.component';

/**
 * Icon-only brand mark for the left rail (40px inside the 64px rail), with a
 * small "postqueen.ai" tagline under it. Links to the Calendar so the crown
 * doubles as a "home" affordance.
 */
export const Logo = () => (
  <Link
    href="/launches"
    aria-label="Calendar"
    className="flex flex-col items-center gap-[4px] transition-transform duration-200 hover:scale-105"
  >
    <PostQueenLogo tileClassName="size-10" />
    <span className="text-[9px] leading-none whitespace-nowrap font-[500] text-newTextColor/70">
      postqueen.ai
    </span>
  </Link>
);
