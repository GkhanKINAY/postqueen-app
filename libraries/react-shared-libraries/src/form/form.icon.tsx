'use client';

import { FC } from 'react';
import clsx from 'clsx';

/**
 * Named glyphs for composer / settings labels. Providers pass a name on the
 * setting; FormChoice / Checkbox / Select / FormSection draw it. Keep this
 * list generic (music, visibility, comments…) — never branch on a platform.
 */
export const FORM_ICON_NAMES = [
  'visibility',
  'globe',
  'users',
  'user',
  'lock',
  'music',
  'comments',
  'duet',
  'stitch',
  'ai',
  'disclosure',
  'upload',
  'location',
  'brand',
  'kids',
  'reply',
  'carousel',
  'post',
  'story',
  'article',
  'status',
  'type',
  'chat',
  'group',
  'warn',
  'event',
  'offer',
] as const;

export type FormIconName = (typeof FORM_ICON_NAMES)[number];

const PATHS: Record<FormIconName, string[]> = {
  visibility: [
    'M1.5 8s2.7-5 6.5-5 6.5 5 6.5 5-2.7 5-6.5 5S1.5 8 1.5 8Z',
    'M8 10.2A2.2 2.2 0 1 0 8 5.8a2.2 2.2 0 0 0 0 4.4Z',
  ],
  globe: [
    'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z',
    'M1.5 8h13',
    'M8 1.5c1.7 1.8 2.6 4.1 2.6 6.5S9.7 12.7 8 14.5C6.3 12.7 5.4 10.4 5.4 8S6.3 3.3 8 1.5Z',
  ],
  users: [
    'M10.8 13.5v-1.2A2.3 2.3 0 0 0 8.5 10H4.2A2.3 2.3 0 0 0 1.9 12.3v1.2',
    'M6.35 7.4A2.2 2.2 0 1 0 6.35 3a2.2 2.2 0 0 0 0 4.4Z',
    'M14.1 13.5v-1.1a2 2 0 0 0-1.5-1.9',
    'M10.6 3.15a2.2 2.2 0 0 1 0 4.25',
  ],
  user: [
    'M12.5 13.5v-1.2A2.8 2.8 0 0 0 9.7 9.5H6.3A2.8 2.8 0 0 0 3.5 12.3v1.2',
    'M8 7.3A2.4 2.4 0 1 0 8 2.5a2.4 2.4 0 0 0 0 4.8Z',
  ],
  lock: [
    'M12.2 14.2H3.8A1.3 1.3 0 0 1 2.5 12.9V8.4A1.3 1.3 0 0 1 3.8 7.1h8.4A1.3 1.3 0 0 1 13.5 8.4v4.5a1.3 1.3 0 0 1-1.3 1.3Z',
    'M5 7.1V4.8a3 3 0 0 1 6 0v2.3',
  ],
  music: [
    'M6.2 13.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
    'M8.4 11.3V2.5l5.3 1.1v7.2',
    'M11.5 10.8a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
  ],
  comments: [
    'M3.2 12.8 2 14.5V4.2A1.7 1.7 0 0 1 3.7 2.5h8.6A1.7 1.7 0 0 1 14 4.2v6.4A1.7 1.7 0 0 1 12.3 12.3H5.1L3.2 12.8Z',
  ],
  duet: [
    'M6.8 12.8H3.4A1.4 1.4 0 0 1 2 11.4V4.6A1.4 1.4 0 0 1 3.4 3.2h3.4',
    'M9.2 3.2h3.4A1.4 1.4 0 0 1 14 4.6v6.8a1.4 1.4 0 0 1-1.4 1.4H9.2',
    'M8 2.5v11',
  ],
  stitch: [
    'M5.2 3.2 2.8 5.6l2.4 2.4',
    'M10.8 3.2l2.4 2.4-2.4 2.4',
    'M8 2.8v4.8',
    'M5.2 10.2 2.8 12.6l2.4 2.2',
    'M10.8 10.2l2.4 2.4-2.4 2.2',
    'M8 9.8v4.6',
  ],
  ai: [
    'M8 2.2v1.8',
    'M8 12v1.8',
    'M2.2 8h1.8',
    'M12 8h1.8',
    'M4 4l1.2 1.2',
    'M10.8 10.8 12 12',
    'M12 4l-1.2 1.2',
    'M5.2 10.8 4 12',
    'M8 10.5A2.5 2.5 0 1 0 8 5.5a2.5 2.5 0 0 0 0 5Z',
  ],
  disclosure: [
    'M3.2 13.2V4.8L8 2.5l4.8 2.3v8.4L8 15.5 3.2 13.2Z',
    'M8 7.2v3.6',
    'M8 6.2a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z',
  ],
  upload: [
    'M2.8 10.2v2.3A1.5 1.5 0 0 0 4.3 14h7.4a1.5 1.5 0 0 0 1.5-1.5v-2.3',
    'M8 2.5v8',
    'M5 5.5 8 2.5 11 5.5',
  ],
  location: [
    'M8 14.5s5.2-4.2 5.2-8.1A5.2 5.2 0 1 0 2.8 6.4C2.8 10.3 8 14.5 8 14.5Z',
    'M8 8.4A2 2 0 1 0 8 4.4a2 2 0 0 0 0 4Z',
  ],
  brand: [
    'M2.5 6.2 8 2.5l5.5 3.7v7.1A1.2 1.2 0 0 1 12.3 14.5H3.7A1.2 1.2 0 0 1 2.5 13.3V6.2Z',
    'M6.2 14.5V9.2h3.6v5.3',
  ],
  kids: [
    'M8 7.2A2.4 2.4 0 1 0 8 2.4a2.4 2.4 0 0 0 0 4.8Z',
    'M3.2 14.2v-1.1A3.3 3.3 0 0 1 6.5 9.8h3A3.3 3.3 0 0 1 12.8 13.1v1.1',
  ],
  reply: [
    'M6.2 7.2 2.8 10.6 6.2 14',
    'M13.2 4.5v2.6A3.5 3.5 0 0 1 9.7 10.6H2.8',
  ],
  carousel: [
    'M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6A1.5 1.5 0 0 1 11 12.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5Z',
    'M14 5.5v5',
    'M2 5.5v5',
  ],
  post: [
    'M3.5 3.5h9v9h-9z',
    'M5.5 6.5h5',
    'M5.5 9h3.5',
  ],
  story: [
    'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z',
    'M8 4.2V8l2.4 1.5',
  ],
  article: [
    'M4 2.8h6.2L12.5 5v8.2H4V2.8Z',
    'M10.2 2.8V5h2.3',
    'M5.8 8h4.4',
    'M5.8 10.4H9',
  ],
  status: [
    'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z',
    'M5.2 8.2 7.1 10l3.7-4.2',
  ],
  type: [
    'M3.2 4.2h9.6',
    'M8 4.2v7.6',
    'M5.5 11.8h5',
  ],
  chat: [
    'M3 4.2h10A1.3 1.3 0 0 1 14.3 5.5v5.2A1.3 1.3 0 0 1 13 12H8.2L5 14.2V12H3A1.3 1.3 0 0 1 1.7 10.7V5.5A1.3 1.3 0 0 1 3 4.2Z',
  ],
  group: [
    'M10.5 13.2v-1A2.1 2.1 0 0 0 8.4 10H4.3A2.1 2.1 0 0 0 2.2 12.2v1',
    'M6.35 7.2A2 2 0 1 0 6.35 3.2a2 2 0 0 0 0 4Z',
    'M13.8 13.2v-.9a1.8 1.8 0 0 0-1.3-1.7',
    'M10.2 3.4a2 2 0 0 1 0 3.8',
  ],
  warn: [
    'M8 2.8 14.2 13.5H1.8L8 2.8Z',
    'M8 6.6v3.2',
    'M8 11.8h.01',
  ],
  event: [
    'M3.2 4.5h9.6A1.3 1.3 0 0 1 14.1 5.8v7A1.3 1.3 0 0 1 12.8 14.1H3.2A1.3 1.3 0 0 1 1.9 12.8v-7A1.3 1.3 0 0 1 3.2 4.5Z',
    'M4.5 2.8v2.4',
    'M11.5 2.8v2.4',
    'M1.9 7.2h12.2',
  ],
  offer: [
    'M2.8 8.2 8.2 2.8h4.5v4.5L7.8 13.2a1.4 1.4 0 0 1-2 0L2.8 10.2a1.4 1.4 0 0 1 0-2Z',
    'M11.2 5.2a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6Z',
  ],
};

export const FormIcon: FC<{
  name: FormIconName;
  size?: number;
  className?: string;
}> = ({ name, size = 16, className }) => {
  const paths = PATHS[name];
  if (!paths) {
    return null;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={clsx('shrink-0', className)}
    >
      {paths.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
};

export const isEmptyFormValue = (value: unknown) =>
  value === undefined || value === null || value === '';
