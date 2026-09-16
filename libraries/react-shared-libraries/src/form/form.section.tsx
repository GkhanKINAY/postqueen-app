'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';
import { FormIcon, type FormIconName } from './form.icon';

/**
 * Grouped settings card. Colour/radius follow GMB event/offer blocks
 * (`bg-pqSettings`, 10px) so a long form is a stack of labeled panels
 * instead of hairlines over empty inner black.
 */
export const FormSection: FC<{
  icon?: FormIconName;
  title?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ icon, title, hint, children, className }) => {
  return (
    <div
      className={clsx(
        'flex flex-col gap-[12px] rounded-[10px] bg-pqSettings p-[14px]',
        className
      )}
    >
      {(icon || title) && (
        <div className="flex items-center gap-[8px] text-[13px] font-[600] text-pqText">
          {icon && <FormIcon name={icon} size={16} className="text-pqMuted" />}
          {title ? <span>{title}</span> : null}
        </div>
      )}
      {children}
      {hint ? (
        <div className="text-[12px] leading-[1.45] text-pqMuted text-balance">
          {hint}
        </div>
      ) : null}
    </div>
  );
};
