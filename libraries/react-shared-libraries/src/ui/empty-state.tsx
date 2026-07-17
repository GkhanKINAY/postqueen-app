'use client';

import { ReactNode } from 'react';

/**
 * Centered empty state: optional icon/illustration, a heading, supporting text
 * and an optional action. Most empty views in the app were bare centered
 * strings; this gives them a consistent, less-barren shape.
 */
export const EmptyState = ({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-[12px] px-[20px] py-[48px] text-center">
    {icon && <div className="text-textItemBlur">{icon}</div>}
    <div className="text-[16px] font-[600] text-newTextColor">{title}</div>
    {description && (
      <div className="max-w-[360px] text-[13px] text-textItemBlur">
        {description}
      </div>
    )}
    {action && <div className="mt-[4px]">{action}</div>}
  </div>
);
