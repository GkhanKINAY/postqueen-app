'use client';

import { clsx } from 'clsx';

export interface TabItem {
  key: string;
  label: string;
}

/**
 * Underline tab bar. Settings and a few other places re-implement this ad hoc
 * with useState + .map; this is the shared version.
 */
export const Tabs = ({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) => (
  <div
    role="tablist"
    className={clsx(
      'flex items-center gap-[4px] border-b border-newBorder',
      className
    )}
  >
    {items.map((item) => {
      const isActive = item.key === active;
      return (
        <button
          key={item.key}
          role="tab"
          aria-selected={isActive}
          type="button"
          onClick={() => onChange(item.key)}
          className={clsx(
            '-mb-[1px] border-b-[2px] px-[14px] py-[10px] text-[13px] font-[500] transition-colors',
            isActive
              ? 'border-btnPrimary text-newTextColor'
              : 'border-transparent text-textItemBlur hover:text-newTextColor'
          )}
        >
          {item.label}
        </button>
      );
    })}
  </div>
);
