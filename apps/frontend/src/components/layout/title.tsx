'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useMenuItem } from '@gitroom/frontend/components/layout/top.menu';

// Routes with no menu entry (/admin/*, /err) that still deserve a heading
// rather than an empty <h1>.
const FALLBACK_TITLES: Record<string, string> = {
  '/settings': 'Settings',
  '/billing': 'Billing',
  '/admin/stats': 'Stats',
  '/admin/errors': 'Errors',
  '/err': 'Error',
};

export const Title = () => {
  const path = usePathname();
  const { all: menuItems } = useMenuItem();
  const currentTitle = useMemo(() => {
    const fromMenu = menuItems.find((item) => path.indexOf(item.path) > -1)?.name;
    if (fromMenu) return fromMenu;
    const fallbackKey = Object.keys(FALLBACK_TITLES).find(
      (key) => path.indexOf(key) > -1
    );
    return fallbackKey ? FALLBACK_TITLES[fallbackKey] : '';
  }, [path, menuItems]);

  return <h1>{currentTitle}</h1>;
};
