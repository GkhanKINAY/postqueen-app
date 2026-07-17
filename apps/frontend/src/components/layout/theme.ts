// Theme mode lives in the `mode` cookie, written by mode.component.tsx and read
// back by the root layouts so the class is stamped on <body> server-side.
// Resolving it on the client alone paints the previous theme first, then flips.
export type ThemeMode = 'dark' | 'light';

export const THEME_COOKIE = 'mode';

export const DEFAULT_THEME: ThemeMode = 'light';

export const resolveTheme = (value?: string): ThemeMode =>
  value === 'dark' || value === 'light' ? value : DEFAULT_THEME;
