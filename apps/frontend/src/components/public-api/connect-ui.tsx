'use client';

import { FC, Fragment, useState, type ReactNode } from 'react';
import copy from 'copy-to-clipboard';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useApiKeyAdminOnly } from '@gitroom/frontend/components/public-api/api-key-card';
import type {
  Connection,
  Way,
  WayKind,
} from '@gitroom/frontend/components/public-api/connections.catalog';

/**
 * Building blocks of the Connect panel: logos, the copy boxes, the key row
 * and the small marks the hub and the agent pages share.
 */

/** Stands in for the key where a member has none: the snippet still reads. */
export const KEY_PLACEHOLDER = 'YOUR_API_KEY';

/** The key as the panel shows it: dots and the last five characters. */
export const maskKey = (key: string) => `•••••${key.slice(-5)}`;

/** Shows a snippet with the key masked; copying still gives the real one. */
export const maskIn = (text: string, key: string) =>
  key && key !== KEY_PLACEHOLDER ? text.split(key).join(maskKey(key)) : text;

/** The layout the Connect panel is drawn for, from `useViewport()`. */
export type ConnectLayout = {
  mobile: boolean;
  tablet: boolean;
  desktop: boolean;
};

export const ConnIcon: FC<{
  item: Pick<Connection, 'icon' | 'glyph' | 'name' | 'symbol'>;
  size?: 'xs' | 'hero' | 'sm' | 'md' | 'lg' | 'xl';
  /** Next to the name already, so a screen reader should not read it twice. */
  decorative?: boolean;
}> = ({ item, size = 'sm', decorative }) => {
  const px = { xs: 22, hero: 34, sm: 40, md: 42, lg: 48, xl: 52 }[size];
  if (item.icon) {
    return (
      <span className="flex shrink-0 items-center justify-center">
        <SafeImage
          src={item.icon}
          alt={decorative ? '' : item.name}
          width={px}
          height={px}
          className="object-contain"
        />
      </span>
    );
  }
  if (item.symbol) {
    return (
      <span
        style={{ width: px, height: px }}
        className={clsx(
          'flex shrink-0 items-center justify-center bg-pqBrandSoft text-pqFocused',
          size === 'xs' ? 'rounded-[6px]' : 'rounded-pqMd'
        )}
      >
        <StrokeIcon paths={ICONS[item.symbol]} size={Math.round(px * 0.46)} />
      </span>
    );
  }
  return (
    <span
      style={{ width: px, height: px }}
      className={clsx(
        'flex shrink-0 items-center justify-center bg-pqSettings font-[700] text-pqText ring-1 ring-pqBorder',
        size === 'xs' ? 'rounded-[6px] text-[9px]' : 'rounded-pqMd text-[12px]'
      )}
    >
      {item.glyph}
    </span>
  );
};

export const StrokeIcon: FC<{
  paths: string[];
  size?: number;
  className?: string;
}> = ({ paths, size = 16, className }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    className={clsx('block shrink-0', className)}
    aria-hidden="true"
  >
    {paths.map((d) => (
      <path
        key={d}
        d={d}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ))}
  </svg>
);

export const ICONS = {
  copy: [
    'M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15M5.5 9h8A1.5 1.5 0 0 1 15 10.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 18.5v-8A1.5 1.5 0 0 1 5.5 9Z',
  ],
  external: [
    'M14 5h5v5M19 5l-9 9M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4',
  ],
  arrow: ['M5 12h14M13 6l6 6-6 6'],
  back: ['M19 12H5M11 18l-6-6 6-6'],
  chevron: ['m9 6 6 6-6 6'],
  chevronDown: ['m6 9 6 6 6-6'],
  close: ['M6 6l12 12M18 6 6 18'],
  search: ['M17 17l4 4M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z'],
  key: [
    'M7.5 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z',
    'm21 2-9.6 9.6',
    'm15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4',
  ],
  lock: [
    'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM8 11V7a4 4 0 0 1 8 0v4',
  ],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2'],
  check: ['M20 6 9 17l-5-5'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16v-4M12 8h.01'],
  alert: [
    'm21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3ZM12 9v4M12 17h.01',
  ],
  chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  ],
  signin: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3'],
  terminal: [
    'm7 11 2-2-2-2M11 13h4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  ],
  config: [
    'M12 20h9M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.8.8-2.9a2 2 0 0 1 .5-.9Z',
  ],
  plug: ['M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z'],
  book: [
    'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20',
  ],
  hook: [
    'M18 17H12a2.5 2.5 0 0 0-2.4 1.8A4 4 0 1 1 5 14.2M6.5 17l3.2-5.8c.5-1 .1-2.2-.5-3.1a4 4 0 1 1 6.9-4M12 6l3.1 5.8c.5 1 1.8 1.2 2.9 1.2a4 4 0 0 1 0 8',
  ],
  rss: ['M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 19h.01'],
  code: ['m16 18 6-6-6-6M8 6l-6 6 6 6'],
  package: [
    'm7.5 4.3 9 5.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7ZM3.3 7 12 12l8.7-5M12 22V12',
  ],
  mail: [
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 7l-9 5.7a2 2 0 0 1-2 0L2 7',
  ],
} satisfies Record<string, string[]>;

const WAY_ICON: Record<WayKind, string[]> = {
  message: ICONS.chat,
  signin: ICONS.signin,
  command: ICONS.terminal,
  config: ICONS.config,
  connector: ICONS.plug,
  panel: ICONS.plug,
  address: ICONS.plug,
};

/** The card's "how you connect" line, in place of a method badge. */
export const WayLine: FC<{ way: Way }> = ({ way }) => (
  <span className="inline-flex items-center gap-[6px] text-[12px] font-[600] text-pqMuted">
    <StrokeIcon
      paths={WAY_ICON[way.kind]}
      size={14}
      className="text-pqFocused"
    />
    {way.label}
  </span>
);

export const NewBadge: FC = () => {
  const t = useT();
  return (
    <span className="inline-flex h-[16px] items-center rounded-full bg-pqBrandSoft px-[6px] text-[9px] font-[800] tracking-[0.04em] text-pqFocused">
      {t('conn_new_badge', 'NEW')}
    </span>
  );
};

export const SoonBadge: FC = () => {
  const t = useT();
  return (
    <span className="inline-flex h-[20px] items-center rounded-full bg-pqText px-[8px] text-[11px] font-[700] text-pqPop">
      {t('conn_soon_badge', 'SOON')}
    </span>
  );
};

/** Runs of `code` in a sentence, as the site writes them. */
export const InlineCode: FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('`').map((part, i) =>
      i % 2 ? (
        <code
          key={i}
          dir="ltr"
          className="rounded-[5px] bg-pqBtnSimple px-[5px] py-[1px] font-mono text-[0.92em] text-pqText"
        >
          {part}
        </code>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    )}
  </>
);

/** Copies a value and says so, the one way the panel does it. */
export const useCopy = () => {
  const toaster = useToaster();
  const t = useT();
  return (value: string) => {
    copy(value);
    toaster.show(t('conn_copied', 'Copied to the clipboard'), 'success');
  };
};

const copyButtonClass =
  'inline-flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] bg-pqBrand px-[10px] text-[12px] font-[600] text-pqOnBrand transition-colors hover:bg-pqBrandHover';

/**
 * A copyable block that stays dark in both themes, like a terminal. The key
 * shows masked; Copy puts the real value on the clipboard.
 */
export const CodePanel: FC<{
  code: string;
  label: string;
  apiKey: string;
  fold?: number;
}> = ({ code, label, apiKey, fold }) => {
  const t = useT();
  const copyValue = useCopy();
  const [open, setOpen] = useState(false);
  const lines = maskIn(code, apiKey).split('\n');
  const folded = !!fold && lines.length > fold && !open;
  return (
    <div className="overflow-hidden rounded-[13px] bg-pqConnCode shadow-[inset_0_0_0_1px_var(--connCodeLine)]">
      <div className="flex h-[36px] items-center justify-between border-b border-pqConnCodeLine pe-[5px] ps-[14px]">
        <span className="font-mono text-[11.5px] text-pqConnCodeMuted">
          {label}
        </span>
        <button
          type="button"
          onClick={() => copyValue(code)}
          className={clsx(copyButtonClass, 'h-[26px] mobile:h-[32px]')}
        >
          <StrokeIcon paths={ICONS.copy} size={13} />
          {t('copy', 'Copy')}
        </button>
      </div>
      <div className="p-[10px_14px_11px]" dir="ltr">
        <pre
          className={clsx(
            'm-0 whitespace-pre-wrap break-all font-mono text-[12.5px] leading-[1.65] text-pqConnCodeText',
            folded &&
              'max-h-[84px] overflow-hidden [mask-image:linear-gradient(180deg,black_55%,transparent)]'
          )}
        >
          {folded ? lines.slice(0, fold).join('\n') : lines.join('\n')}
        </pre>
        {!!fold && lines.length > fold && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-[6px] inline-flex cursor-pointer items-center gap-[5px] text-[12px] font-[600] text-pqConnHeroAccent"
          >
            {open
              ? t('conn_show_less', 'Show less')
              : t('conn_show_whole', 'Show the whole message')}
            <StrokeIcon
              paths={ICONS.chevronDown}
              size={13}
              className={clsx(open && 'rotate-180')}
            />
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * One line to copy: a shell command, shown after `$`, or a plain value such as
 * an address or a package name.
 */
export const CommandRow: FC<{
  code: string;
  apiKey: string;
  prompt?: boolean;
}> = ({ code, apiKey, prompt = true }) => {
  const t = useT();
  const copyValue = useCopy();
  return (
    <div
      dir="ltr"
      className="flex h-[40px] items-center gap-[10px] rounded-[12px] bg-pqConnCode pe-[5px] ps-[12px] shadow-[inset_0_0_0_1px_var(--connCodeLine)]"
    >
      {prompt && (
        <span className="font-mono text-[12px] text-pqConnCodeMuted">$</span>
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-pqConnCodeText">
        {maskIn(code, apiKey)}
      </span>
      <button
        type="button"
        onClick={() => copyValue(code)}
        className={clsx(copyButtonClass, 'h-[30px] mobile:h-[36px]')}
      >
        <StrokeIcon paths={ICONS.copy} size={13} />
        {t('copy', 'Copy')}
      </button>
    </div>
  );
};

/**
 * The key inside the step that needs it. A member has no key to copy, and is
 * told whose it is instead.
 */
export const KeyRow: FC<{ apiKey: string }> = ({ apiKey }) => {
  const t = useT();
  const copyValue = useCopy();
  const adminOnly = useApiKeyAdminOnly();
  if (!apiKey || apiKey === KEY_PLACEHOLDER) {
    return (
      <div className="flex items-start gap-[11px] rounded-[10px] bg-pqInner p-[11px_13px] shadow-[inset_0_0_0_1px_var(--border)]">
        <StrokeIcon paths={ICONS.lock} className="mt-[1px] text-pqMuted" />
        <span className="flex flex-col gap-[2px]">
          <span className="text-[13px] font-[600] text-pqText">
            {adminOnly.title}
          </span>
          <span className="text-[12.5px] leading-[1.45] text-pqMuted">
            {adminOnly.body}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-[12px] rounded-[10px] bg-pqInner py-[8px] pe-[8px] ps-[14px] shadow-[inset_0_0_0_1px_var(--border)]">
      <StrokeIcon paths={ICONS.key} className="text-pqFocused" />
      <span
        dir="ltr"
        className="min-w-0 flex-1 truncate font-mono text-[13px] tracking-[0.04em] text-pqText"
      >
        {maskKey(apiKey)}
      </span>
      <button
        type="button"
        onClick={() => copyValue(apiKey)}
        className={clsx(
          copyButtonClass,
          'h-[32px] px-[12px] text-[12.5px] mobile:h-[40px]'
        )}
      >
        <StrokeIcon paths={ICONS.copy} size={14} />
        {t('conn_copy_key', 'Copy key')}
      </button>
    </div>
  );
};

/** A prompt to copy and send, in the chat bubble shape. */
export const AskChip: FC<{ text: string }> = ({ text }) => {
  const copyValue = useCopy();
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => copyValue(text)}
      aria-label={`${t('copy', 'Copy')}: ${text}`}
      className="inline-flex max-w-full cursor-pointer items-center gap-[10px] self-start rounded-[14px] rounded-es-[4px] bg-pqBoxFocused py-[8px] pe-[10px] ps-[13px] text-start text-[13px] font-[600] leading-[1.4] text-pqText transition-colors hover:bg-pqBrandSoft"
    >
      <span>“{text}”</span>
      <StrokeIcon paths={ICONS.copy} size={14} className="text-pqFocused" />
    </button>
  );
};

/** A small outlined chip with a copy mark, for "Also try". */
export const TryChip: FC<{ text: string }> = ({ text }) => {
  const copyValue = useCopy();
  return (
    <button
      type="button"
      onClick={() => copyValue(text)}
      className="inline-flex h-[32px] cursor-pointer items-center gap-[6px] rounded-full bg-pqPop px-[12px] text-[12.5px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover"
    >
      {text}
      <StrokeIcon paths={ICONS.copy} size={12} className="text-pqSoft" />
    </button>
  );
};

/** Card surface used across the panel. */
export const Card: FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={clsx(
      'flex flex-col rounded-pqLg bg-pqPop shadow-[var(--e1),0_0_0_1px_var(--border)]',
      className
    )}
  >
    {children}
  </div>
);

/** A link out of the app (docs, the site, support), opening a new tab. */
export const OutLink: FC<{
  href: string;
  children: ReactNode;
  className?: string;
}> = ({ href, children, className }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className={clsx(
      'inline-flex items-center gap-[5px] whitespace-nowrap text-[13px] font-[600] text-pqFocused hover:underline',
      className
    )}
  >
    {children}
    <StrokeIcon paths={ICONS.external} size={13} className="opacity-[0.85]" />
  </a>
);

/** The same, as an outlined button for the agent page header. */
export const OutButton: FC<{ href: string; children: ReactNode }> = ({
  href,
  children,
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-[8px] bg-pqPop px-[12px] text-[12.5px] font-[600] text-pqText shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:bg-pqHover"
  >
    {children}
    <StrokeIcon paths={ICONS.external} size={14} className="opacity-[0.8]" />
  </a>
);

/** The small uppercase label over a card's list. */
export const Eyebrow: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="text-[10.5px] font-[600] uppercase tracking-[0.07em] text-pqMuted">
    {children}
  </span>
);
