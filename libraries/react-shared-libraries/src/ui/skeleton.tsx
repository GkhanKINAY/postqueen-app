'use client';

import { ComponentPropsWithoutRef } from 'react';
import { clsx } from 'clsx';

/**
 * Loading placeholder block — the single "bone" every skeleton is built from.
 * Compose these to stand in for content while it fetches, sized to whatever
 * they are replacing.
 *
 * `bg-pqSkeleton` is the one fill: the app used to spell this four different
 * ways (`pqHover`, `pqSettings`, `newSep`, `newBgLineColor`), so placeholders
 * changed shade from screen to screen. `pq-loop` is the hook
 * `prefers-reduced-motion` switches the pulse off with — see the note in
 * apps/frontend/src/app/global.scss.
 *
 * Extra props are forwarded so a bone can still carry the `data-*` hooks its
 * surroundings key off — the rail's collapse CSS needs `data-sbl` on whatever
 * sits in the label slot, bone or not.
 */
export const Skeleton = ({
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'>) => (
  <div
    className={clsx(
      'pq-loop animate-pulse rounded-[8px] bg-pqSkeleton',
      className
    )}
    {...rest}
    // After the spread, not before: a bone is a placeholder and must stay out
    // of the a11y tree, so this is not a caller's to override.
    aria-hidden
  />
);
