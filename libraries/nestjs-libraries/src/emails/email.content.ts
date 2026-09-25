/**
 * What an email says, as data. Callers describe the email here and
 * `email.layout.ts` draws it when it is sent: HTML with light and dark colours,
 * and the plain-text part from the same content.
 *
 * It travels as the `html` argument of the existing send path, behind
 * EMAIL_CONTENT_PREFIX, because that string passes through Temporal workflows
 * and activities whose signatures cannot change. A string without the prefix is
 * still the HTML it always was: emails queued before this shipped, and the
 * frozen workflows that send HTML.
 *
 * This file is workflow code: the digest and streak workflows build content
 * with it inside the Temporal sandbox. Keep it free of imports, of anything
 * that reads the clock or the environment, and of anything that can throw.
 * Links may be app paths ('/launches'); the layout puts FRONTEND_URL in front
 * of them.
 */
export const EMAIL_CONTENT_PREFIX = 'pq-email:v1:';

/** Which sender an email goes out from. See EmailService.sender(). */
export type EmailStream = 'account' | 'notifications';

export type EmailTone = 'brand' | 'ok' | 'warn' | 'danger' | 'streak';

/** Each one is a PNG in apps/frontend/public/email, drawn by scripts/email-icons.mjs. */
export type EmailIcon =
  | 'card'
  | 'check'
  | 'check-check'
  | 'flame'
  | 'help'
  | 'key'
  | 'lock'
  | 'mail'
  | 'mail-check'
  | 'plug'
  | 'power'
  | 'rss'
  | 'shield-alert'
  | 'undo'
  | 'user-cog'
  | 'x-circle';

/** Why the reader got the email, and what they can switch off. */
export type EmailFooter =
  | 'security'
  | 'invite'
  | 'success'
  | 'failure'
  | 'digest'
  | 'streak'
  | 'alert'
  | 'billing'
  | 'internal'
  | 'general';

export interface EmailLink {
  label: string;
  url: string;
}

export interface EmailRow {
  title: string;
  /** Small line above the title, e.g. "Instagram · 9:00 AM". */
  meta?: string;
  text?: string;
  /** A platform icon from /icons/platforms, by provider identifier. */
  platform?: string;
  chip?: { label: string; tone: EmailTone };
  link?: EmailLink;
}

export type EmailBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; code: string; note: string }
  | { type: 'address'; text: string }
  | { type: 'reason'; label: string; text: string }
  | { type: 'callout'; text: string }
  | { type: 'details'; rows: [string, string][] }
  | { type: 'rows'; rows: EmailRow[]; label?: string; tone?: EmailTone }
  | { type: 'button'; link: EmailLink; secondary?: EmailLink }
  | { type: 'fallback'; url: string; note?: string }
  | { type: 'note'; text: string };

export interface EmailContent {
  stream: EmailStream;
  /** The small label next to the logo. */
  category: string;
  /** The line inboxes show after the subject. */
  preheader: string;
  tone: EmailTone;
  icon?: EmailIcon;
  /** A letter tile in place of the icon. */
  initial?: string;
  title: string;
  /** Set in the serif accent after the title. */
  accent?: string;
  /** Plain text. `**word**` is bold; everything else is escaped. */
  lead?: string;
  blocks: EmailBlock[];
  footer: EmailFooter;
  /** Replaces the footer's "why you got this" line. */
  footerText?: string;
}

export const emailContent = (content: EmailContent) =>
  EMAIL_CONTENT_PREFIX + JSON.stringify(content);

export const readEmailContent = (html: string): EmailContent | null => {
  if (typeof html !== 'string' || !html.startsWith(EMAIL_CONTENT_PREFIX)) {
    return null;
  }
  try {
    const content = JSON.parse(html.slice(EMAIL_CONTENT_PREFIX.length));
    // Anything that is not a whole email is sent the way plain HTML is,
    // rather than failing inside the layout.
    return content &&
      typeof content.title === 'string' &&
      Array.isArray(content.blocks)
      ? content
      : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- notices

export type NoticeType = 'success' | 'fail' | 'info';

/** One entry of the hourly publishing summary (digestEmailWorkflowV2). */
export interface DigestItem {
  title: string;
  message: string;
  type: NoticeType;
  link?: string | null;
  /** The whole email, when this item turns out to be the only one of the hour. */
  email?: EmailContent;
  /** How it reads as a line of the summary, when title and message are not enough. */
  row?: EmailRow;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The email for a notice that came with a subject and a message only: the
 * frozen post workflows, and anything that does not describe its own email.
 */
export const noticeEmail = (item: DigestItem): EmailContent => {
  const same = item.message.trim() === item.title.trim();
  const lead = same ? undefined : item.message;
  if (item.type === 'success') {
    return {
      stream: 'notifications',
      category: 'Published',
      preheader: 'It went out on time.',
      tone: 'ok',
      icon: 'check',
      title: item.title,
      blocks: [
        {
          type: 'button',
          link: item.link
            ? { label: 'View post', url: item.link }
            : { label: 'Open calendar', url: '/launches' },
        },
      ],
      footer: 'success',
    };
  }
  if (item.type === 'fail') {
    return {
      stream: 'notifications',
      category: 'Not published',
      preheader: lead || item.title,
      tone: 'danger',
      icon: 'x-circle',
      title: item.title,
      lead,
      blocks: [
        {
          type: 'button',
          link: { label: 'Open calendar', url: item.link || '/launches' },
        },
      ],
      footer: 'failure',
    };
  }
  return {
    stream: 'notifications',
    category: 'Channel alert',
    preheader: lead || item.title,
    tone: 'warn',
    icon: 'plug',
    title: item.title,
    lead,
    blocks: [
      {
        type: 'button',
        link: item.link
          ? { label: 'Open PostQueen', url: item.link }
          : { label: 'Open channels', url: '/channels' },
      },
    ],
    footer: 'alert',
  };
};

/** A published notice's message is its title plus " at <url>"; show the rest only. */
const digestText = (item: DigestItem) => {
  const text = item.message.replace(/\sat\s(https?:\/\/\S+)\s*$/i, '').trim();
  return text && text !== item.title.trim() ? text : undefined;
};

const digestRow = (item: DigestItem): EmailRow =>
  item.row || {
    title: item.title,
    text: digestText(item),
    link: item.link
      ? { label: item.type === 'success' ? 'View' : 'Open', url: item.link }
      : undefined,
  };

export const digestSubject = (items: DigestItem[]) => {
  const live = items.filter((i) => i.type === 'success').length;
  const needs = items.length - live;
  if (live && needs) {
    return `${live} ${plural(live, 'post', 'posts')} went live, ${needs} ${plural(needs, 'needs', 'need')} you`;
  }
  if (live) {
    return `${live} ${plural(live, 'post', 'posts')} went live in the last hour`;
  }
  return `${needs} ${plural(needs, 'update needs', 'updates need')} you`;
};

/**
 * One email for everything that happened in the hour. A single item keeps its
 * own email, so a quiet hour reads like a normal notice.
 */
export const digestEmail = (
  items: DigestItem[],
): { subject: string; content: EmailContent } => {
  if (items.length === 1) {
    const [only] = items;
    return { subject: only.title, content: only.email || noticeEmail(only) };
  }

  const live = items.filter((i) => i.type === 'success');
  const needs = items.filter((i) => i.type !== 'success');
  const blocks: EmailBlock[] = [];
  if (needs.length) {
    blocks.push({
      type: 'rows',
      label: 'Needs you',
      tone: 'danger',
      rows: needs.map(digestRow),
    });
  }
  if (live.length) {
    blocks.push({
      type: 'rows',
      label: 'Went live',
      tone: 'ok',
      rows: live.map(digestRow),
    });
  }
  blocks.push(
    { type: 'button', link: { label: 'Open calendar', url: '/launches' } },
    {
      type: 'note',
      text: 'Publishing updates come as one email an hour at most, so your inbox stays calm. Sign-in and billing emails still come right away.',
    },
  );

  const subject = digestSubject(items);
  return {
    subject,
    content: {
      stream: 'notifications',
      category: 'Last hour',
      preheader: needs.length
        ? `${needs[0].title}.`
        : 'Everything that went out in the last hour.',
      tone: needs.length && !live.length ? 'danger' : 'ok',
      icon: needs.length && !live.length ? 'x-circle' : 'check-check',
      title: live.length
        ? `${live.length} ${plural(live.length, 'post', 'posts')} went`
        : `${needs.length} ${plural(needs.length, 'update needs', 'updates need')} you`,
      accent: live.length ? 'live.' : undefined,
      lead:
        live.length && needs.length
          ? `${needs.length === 1 ? 'One update needs' : `${needs.length} updates need`} you. Here is everything from the last hour.`
          : 'Here is everything from the last hour.',
      blocks,
      footer: 'digest',
    },
  };
};
