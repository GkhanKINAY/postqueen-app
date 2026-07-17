'use client';

import { clsx } from 'clsx';

const SIZES = {
  sm: 'size-[24px] text-[10px]',
  md: 'size-[32px] text-[13px]',
  lg: 'size-[40px] text-[15px]',
};

/**
 * Circular avatar with an initial fallback. Used anywhere a user or org needs a
 * face; the app had none before, so identity was invisible in the chrome.
 */
export const Avatar = ({
  src,
  name,
  size = 'md',
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) => {
  const initial = (name?.trim()?.[0] || '?').toUpperCase();
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-btnPrimary font-[600] text-white',
        SIZES[size],
        className
      )}
    >
      {src ? (
        <img src={src} alt={name || ''} className="size-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
};
