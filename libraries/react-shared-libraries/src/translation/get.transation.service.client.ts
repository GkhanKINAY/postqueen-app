'use client';

import i18next from './i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
// `isolatedModules` is on, so a type has to say so — imported as a value it
// becomes a real import of a binding that does not exist at runtime.
import type { UseTranslationOptions } from 'react-i18next';

export function useT(ns?: string, options?: UseTranslationOptions<any>) {
  const { t } = useTranslation(ns, options);
  return t;
}

export function useTranslationSettings() {
  const [savedI18next, setSavedI18next] = useState(i18next);

  return savedI18next;
}
