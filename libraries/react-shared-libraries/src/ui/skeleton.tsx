'use client';

import { clsx } from 'clsx';

/**
 * Loading placeholder block. The app had zero skeletons — every load was a bare
 * spinner or a blank screen. Compose these to stand in for content while it
 * fetches.
 */
export const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={clsx('animate-pulse rounded-[8px] bg-newBgLineColor', className)}
  />
);
