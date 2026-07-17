'use client';

import { ReactNode } from 'react';
import { clsx } from 'clsx';

const TONES = {
  neutral: 'bg-newBgLineColor text-textItemBlur',
  brand: 'bg-btnPrimary/12 text-btnPrimary',
  success: 'bg-green-500/12 text-green-600',
  warning: 'bg-amber-500/12 text-amber-600',
  danger: 'bg-red-500/12 text-red-500',
};

/** Small status pill. */
export const Badge = ({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) => (
  <span
    className={clsx(
      'inline-flex items-center gap-[4px] rounded-full px-[10px] py-[3px] text-[11px] font-[600]',
      TONES[tone],
      className
    )}
  >
    {children}
  </span>
);
