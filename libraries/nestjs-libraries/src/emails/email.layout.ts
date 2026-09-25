import type {
  EmailBlock,
  EmailContent,
  EmailFooter,
  EmailLink,
  EmailRow,
  EmailTone,
} from './email.content';

/**
 * Draws an EmailContent as the email people receive: one 600px column of
 * tables with inline styles (what Gmail, Outlook and Apple Mail agree on), the
 * light colours inline and the dark ones in a prefers-color-scheme block plus
 * Outlook.com's [data-ogsc]/[data-ogsb] rules, and a plain-text part from the
 * same content.
 *
 * Kept light on images so it reads as a person's email, not a campaign: the
 * logo, one status icon and platform icons, all PNGs served by this app, and
 * no words inside any of them. No web fonts either: loading one would hand the
 * reader's address to a font host. The site's faces are named first, for the
 * readers who have them, and the system's take over for everyone else.
 */
export interface EmailEnv {
  frontendUrl: string;
  fromName: string;
  supportEmail?: string;
  legalUrl?: string;
  helpUrl?: string;
  postalAddress?: string;
}

const SANS =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";
const MONO =
  "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const LIGHT = {
  bg: '#F7F5FA',
  card: '#FFFFFF',
  line: '#EEEBF3',
  border: '#E6E2EE',
  border2: '#D9D5E2',
  sunken: '#F6F4FA',
  ink: '#15131C',
  text: '#3B3745',
  muted: '#5B5766',
  subtle: '#6E6979',
  link: '#6D28D9',
  mono: '#4C1D95',
};
const DARK: typeof LIGHT = {
  bg: '#0E0C14',
  card: '#15131C',
  line: '#24212D',
  border: '#2C2837',
  border2: '#3B3745',
  sunken: '#1B1823',
  ink: '#F4F2F8',
  text: '#D8D4E2',
  muted: '#ABA5B8',
  subtle: '#9A94AC',
  link: '#C4B5FD',
  mono: '#C4B5FD',
};
const TONES: Record<
  EmailTone,
  { soft: string; ink: string; darkSoft: string; darkInk: string }
> = {
  brand: {
    soft: '#EFE9FD',
    ink: '#6D28D9',
    darkSoft: '#2A2140',
    darkInk: '#C4B5FD',
  },
  ok: {
    soft: '#DCFCE7',
    ink: '#15803D',
    darkSoft: '#12291B',
    darkInk: '#4ADE80',
  },
  warn: {
    soft: '#FEF3C7',
    ink: '#B45309',
    darkSoft: '#2E2410',
    darkInk: '#FBBF24',
  },
  danger: {
    soft: '#FFE4E6',
    ink: '#BE123C',
    darkSoft: '#331620',
    darkInk: '#FB7185',
  },
  streak: {
    soft: '#FFEDD5',
    ink: '#C2410C',
    darkSoft: '#2F1D10',
    darkInk: '#FB923C',
  },
};
const BUTTON = '#7C3AED';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Escaped text, with `**word**` in bold. */
const rich = (s: string) =>
  esc(s).replace(
    /\*\*(.+?)\*\*/g,
    `<strong class="pq-ink" style="font-weight:700;color:${LIGHT.ink};">$1</strong>`,
  );

const plain = (s: string) => String(s ?? '').replace(/\*\*(.+?)\*\*/g, '$1');

/** App paths get the app's address; anything but web and mail links becomes '#'. */
const href = (env: EmailEnv, url: string) => {
  if (url.startsWith('/')) {
    return `${env.frontendUrl}${url}`;
  }
  return /^(https?:|mailto:)/i.test(url) ? url : '#';
};

const asset = (env: EmailEnv, path: string) => `${env.frontendUrl}${path}`;

// ---------------------------------------------------------------- css

const css = () => {
  const dark: string[] = [
    `.pq-bg{background-color:${DARK.bg}!important}`,
    `.pq-card{background-color:${DARK.card}!important;border-color:${DARK.line}!important}`,
    `.pq-sunken{background-color:${DARK.sunken}!important}`,
    `.pq-border{border-color:${DARK.border}!important}`,
    `.pq-dash{border-color:${DARK.border2}!important}`,
    `.pq-rule{background-color:${DARK.line}!important;border-color:${DARK.line}!important}`,
    `.pq-ink{color:${DARK.ink}!important}`,
    `.pq-text{color:${DARK.text}!important}`,
    `.pq-muted{color:${DARK.muted}!important}`,
    `.pq-subtle{color:${DARK.subtle}!important}`,
    `.pq-link{color:${DARK.link}!important}`,
    `.pq-mono{color:${DARK.mono}!important}`,
    `.pq-accent{color:${DARK.link}!important}`,
    ...Object.entries(TONES).flatMap(([k, t]) => [
      `.pq-soft-${k}{background-color:${t.darkSoft}!important}`,
      `.pq-tone-${k}{color:${t.darkInk}!important}`,
      `.pq-dot-${k}{background-color:${t.darkInk}!important}`,
    ]),
  ];
  // Outlook.com marks its dark mode with these attributes instead of the media query.
  const outlook = dark
    .map((rule) => {
      const [sel, body] = rule.split('{');
      const bg = body.includes('background-color');
      return `[data-${bg ? 'ogsb' : 'ogsc'}] ${sel}{${body}`;
    })
    .join('');
  return [
    ':root{color-scheme:light dark;supported-color-schemes:light dark}',
    'body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}',
    'table{border-collapse:separate}img{border:0;outline:none;text-decoration:none}',
    'a{text-decoration:none}',
    '@media (max-width:640px){.pq-container{width:100%!important}.pq-pad{padding:28px 22px 26px!important}' +
      '.pq-title{font-size:25px!important;line-height:1.2!important}.pq-serif{font-size:30px!important}' +
      '.pq-code{font-size:32px!important}.pq-full{width:100%!important}.pq-stack{display:block!important;width:100%!important;box-sizing:border-box}' +
      '.pq-stack a{display:block!important}.pq-gap{display:block!important;width:100%!important;height:12px!important}}',
    `@media (prefers-color-scheme:dark){${dark.join('')}}`,
    outlook,
  ].join('\n');
};

// ---------------------------------------------------------------- parts

const spacer = (h: number) =>
  `<tr><td height="${h}" style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

const tile = (env: EmailEnv, c: EmailContent) => {
  const t = TONES[c.tone];
  const inner = c.initial
    ? `<span class="pq-tone-${c.tone}" style="font:800 21px/48px ${SANS};color:${t.ink};">${esc(c.initial.slice(0, 1).toUpperCase())}</span>`
    : c.icon
      ? `<img src="${asset(env, `/email/${c.icon}-${c.tone}.png`)}" width="24" height="24" alt="" style="display:block;margin:12px auto;width:24px;height:24px;">`
      : '';
  if (!inner) {
    return '';
  }
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td class="pq-soft-${c.tone}" width="48" height="48" align="center" valign="middle" bgcolor="${t.soft}" ` +
    `style="width:48px;height:48px;border-radius:14px;background-color:${t.soft};text-align:center;">${inner}</td></tr></table>`
  );
};

const heading = (c: EmailContent) => {
  const accent = c.accent
    ? ` <span class="pq-accent pq-serif" style="font-family:${SERIF};font-style:italic;font-weight:400;font-size:34px;letter-spacing:-0.01em;color:${LIGHT.link};">${esc(c.accent)}</span>`
    : '';
  return `<h1 class="pq-ink pq-title" style="margin:0;font-family:${SANS};font-size:29px;line-height:1.18;font-weight:800;letter-spacing:-0.03em;color:${LIGHT.ink};">${esc(c.title)}${accent}</h1>`;
};

const paragraph = (text: string, size = 16) =>
  `<p class="pq-text" style="margin:0;font-family:${SANS};font-size:${size}px;line-height:1.65;color:${LIGHT.text};">${rich(text)}</p>`;

const box = (inner: string, extra = '') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
  `<td class="pq-sunken" bgcolor="${LIGHT.sunken}" style="padding:14px 16px;border-radius:14px;background-color:${LIGHT.sunken};${extra}">${inner}</td></tr></table>`;

const chip = (label: string, tone: EmailTone) => {
  const t = TONES[tone];
  return `<span class="pq-soft-${tone} pq-tone-${tone}" style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:${t.soft};color:${t.ink};font:700 12px/18px ${SANS};white-space:nowrap;">${esc(label)}</span>`;
};

const linkButton = (env: EmailEnv, link: EmailLink) =>
  `<a class="pq-link" href="${esc(href(env, link.url))}" style="font:700 13.5px/1.4 ${SANS};color:${LIGHT.link};text-decoration:none;white-space:nowrap;">${esc(link.label)}</a>`;

const row = (env: EmailEnv, r: EmailRow, first: boolean) => {
  const icon = r.platform
    ? `<td width="38" valign="top" style="width:38px;padding-top:2px;"><img src="${asset(env, `/icons/platforms/${encodeURIComponent(r.platform)}.png`)}" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border-radius:7px;"></td>`
    : '';
  const meta = r.meta
    ? `<div class="pq-subtle" style="font:700 12.5px/1.5 ${SANS};color:${LIGHT.subtle};">${esc(r.meta)}</div>`
    : '';
  const text = r.text
    ? `<div class="pq-muted" style="margin-top:2px;font:400 13.5px/1.5 ${SANS};color:${LIGHT.muted};">${esc(r.text)}</div>`
    : '';
  const end = r.chip
    ? chip(r.chip.label, r.chip.tone)
    : r.link
      ? linkButton(env, r.link)
      : '';
  return (
    `<tr><td class="pq-border" style="padding:13px 16px;${first ? '' : `border-top:1px solid ${LIGHT.line};`}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${icon}` +
    `<td valign="top">${meta}<div class="pq-ink" style="font:600 14.5px/1.5 ${SANS};color:${LIGHT.ink};">${esc(r.title)}</div>${text}</td>` +
    (end
      ? `<td width="1" valign="top" align="right" style="padding-left:12px;white-space:nowrap;">${end}</td>`
      : '') +
    `</tr></table></td></tr>`
  );
};

const button = (env: EmailEnv, link: EmailLink, secondary?: EmailLink) => {
  const primary =
    `<td class="pq-full pq-stack" bgcolor="${BUTTON}" align="center" style="border-radius:999px;background-color:${BUTTON};">` +
    `<a href="${esc(href(env, link.url))}" style="display:inline-block;padding:15px 28px;font:700 15.5px/20px ${SANS};color:#FFFFFF;text-decoration:none;border-radius:999px;">${esc(link.label)}&nbsp;&#187;</a></td>`;
  const second = secondary
    ? `<td class="pq-gap" width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>` +
      `<td class="pq-full pq-stack pq-dash" align="center" style="border-radius:999px;border:1.5px solid ${LIGHT.border2};">` +
      `<a class="pq-ink" href="${esc(href(env, secondary.url))}" style="display:inline-block;padding:13px 22px;font:700 15px/20px ${SANS};color:${LIGHT.ink};text-decoration:none;">${esc(secondary.label)}</a></td>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="pq-full"><tr>${primary}${second}</tr></table>`;
};

const block = (env: EmailEnv, b: EmailBlock): string => {
  switch (b.type) {
    case 'text':
      return paragraph(b.text);
    case 'code':
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td class="pq-sunken pq-dash" align="center" bgcolor="${LIGHT.sunken}" style="padding:26px 20px;border-radius:18px;background-color:${LIGHT.sunken};border:1.5px dashed ${LIGHT.border2};">` +
        `<div class="pq-ink pq-code" style="font-family:${MONO};font-size:40px;line-height:1.2;font-weight:600;letter-spacing:0.22em;color:${LIGHT.ink};">${esc(b.code)}</div>` +
        `<div class="pq-muted" style="margin-top:8px;font:600 13px/1.4 ${SANS};color:${LIGHT.muted};">${esc(b.note)}</div></td></tr></table>`
      );
    case 'address':
      return box(
        `<span class="pq-ink" style="font:700 16px/1.5 ${SANS};color:${LIGHT.ink};">${esc(b.text)}</span>`,
      );
    case 'callout':
      return box(
        `<span class="pq-text" style="font:400 14.5px/1.55 ${SANS};color:${LIGHT.text};">${rich(b.text)}</span>`,
      );
    case 'reason': {
      const t = TONES.danger;
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td class="pq-soft-danger" bgcolor="${t.soft}" style="padding:14px 16px;border-radius:14px;background-color:${t.soft};">` +
        `<div class="pq-tone-danger" style="font:800 12.5px/1.5 ${SANS};color:${t.ink};">${esc(b.label)}</div>` +
        `<div class="pq-ink" style="margin-top:3px;font:400 14.5px/1.55 ${SANS};color:${LIGHT.ink};">${esc(b.text)}</div></td></tr></table>`
      );
    }
    case 'details':
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pq-sunken" bgcolor="${LIGHT.sunken}" style="border-radius:16px;background-color:${LIGHT.sunken};">` +
        b.rows
          .map(
            ([k, v], i) =>
              `<tr><td class="pq-subtle pq-border" width="130" valign="top" style="width:130px;padding:12px 16px;${i ? `border-top:1px solid ${LIGHT.line};` : ''}font:600 13.5px/1.5 ${SANS};color:${LIGHT.subtle};">${esc(k)}</td>` +
              `<td class="pq-ink pq-border" valign="top" style="padding:12px 16px 12px 0;${i ? `border-top:1px solid ${LIGHT.line};` : ''}font:600 14.5px/1.5 ${SANS};color:${LIGHT.ink};word-break:break-word;">${esc(v)}</td></tr>`,
          )
          .join('') +
        `</table>`
      );
    case 'rows': {
      const label = b.label
        ? `<div class="pq-tone-${b.tone || 'brand'}" style="margin-bottom:12px;font:800 12px/1.4 ${SANS};letter-spacing:0.1em;text-transform:uppercase;color:${TONES[b.tone || 'brand'].ink};">` +
          `<span class="pq-dot-${b.tone || 'brand'}" style="display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background-color:${TONES[b.tone || 'brand'].ink};"></span>${esc(b.label)}</div>`
        : '';
      return (
        label +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pq-border" style="border:1px solid ${LIGHT.border};border-radius:16px;">` +
        b.rows.map((r, i) => row(env, r, i === 0)).join('') +
        `</table>`
      );
    }
    case 'button':
      return button(env, b.link, b.secondary);
    case 'fallback':
      return (
        `<p class="pq-muted" style="margin:0 0 8px;font:400 13.5px/1.5 ${SANS};color:${LIGHT.muted};">Button not working? Paste this link into your browser.${b.note ? ` ${esc(b.note)}` : ''}</p>` +
        box(
          `<a class="pq-mono" href="${esc(href(env, b.url))}" style="font-family:${MONO};font-size:12.5px;line-height:1.55;color:${LIGHT.mono};text-decoration:none;word-break:break-all;">${esc(href(env, b.url))}</a>`,
          'padding:12px 14px;border-radius:12px;',
        )
      );
    case 'steps':
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
        b.items
          .map(
            (item, i) =>
              `<tr><td width="46" valign="top" style="width:46px;${i < b.items.length - 1 ? 'padding-bottom:18px;' : ''}">` +
              `<div class="pq-soft-brand pq-tone-brand" style="width:32px;height:32px;border-radius:50%;background-color:${TONES.brand.soft};color:${TONES.brand.ink};font:800 14px/32px ${SANS};text-align:center;">${i + 1}</div></td>` +
              `<td valign="top" style="padding-top:5px;${i < b.items.length - 1 ? 'padding-bottom:18px;' : ''}">` +
              `<div class="pq-ink" style="font:800 15.5px/1.4 ${SANS};color:${LIGHT.ink};">${esc(item.title)}</div>` +
              `<div class="pq-text" style="margin-top:3px;font:400 14.5px/1.55 ${SANS};color:${LIGHT.text};">${esc(item.text)}</div></td></tr>`,
          )
          .join('') +
        `</table>`
      );
    case 'note':
      return (
        `<div class="pq-rule" style="height:1px;line-height:1px;font-size:0;background-color:${LIGHT.line};">&nbsp;</div>` +
        `<p class="pq-muted" style="margin:20px 0 0;font:400 13.5px/1.6 ${SANS};color:${LIGHT.muted};">${rich(b.text)}</p>`
      );
  }
};

const FOOTER_WHY: Record<EmailFooter, string> = {
  security:
    'We send this after a sign-in or an account change, to keep your account safe. These emails are always on.',
  invite:
    'You get this because someone invited you to their workspace. If you don’t know them, you can ignore this email.',
  success: 'You get this because success emails are on for your account.',
  failure: 'You get this because failure emails are on for your account.',
  digest:
    'You get this summary because success or failure emails are on for your account.',
  streak: 'You get this because streak emails are on for your account.',
  alert:
    'Channel alerts are always on, because they decide whether your posts go out.',
  billing: 'Billing emails about your plan are always on.',
  internal:
    'Internal. Sent to the support inbox when a customer does something the team should know about.',
  welcome: 'You get this because you just created an account.',
  general: 'You get this because you have an account.',
};
const MANAGE: EmailFooter[] = ['success', 'failure', 'digest', 'streak'];

const footerLines = (env: EmailEnv, c: EmailContent) => {
  const why = c.footerText || FOOTER_WHY[c.footer];
  const manage = MANAGE.includes(c.footer)
    ? {
        label: 'Manage email notifications',
        url: `${env.frontendUrl}/settings?tab=notifications`,
      }
    : undefined;
  const links: EmailLink[] = [
    ...(env.helpUrl ? [{ label: 'Help center', url: env.helpUrl }] : []),
    ...(env.supportEmail
      ? [{ label: 'Contact', url: `mailto:${env.supportEmail}` }]
      : []),
    ...(env.legalUrl
      ? [
          { label: 'Privacy', url: `${env.legalUrl}/privacy-policy` },
          { label: 'Terms', url: `${env.legalUrl}/terms-of-service` },
        ]
      : []),
  ];
  const company = env.postalAddress
    ? `${env.fromName} is made by ${env.postalAddress}.`
    : '';
  return { why, manage, links, company };
};

const footer = (env: EmailEnv, c: EmailContent) => {
  const { why, manage, links, company } = footerLines(env, c);
  const small = `font:400 13px/1.6 ${SANS};color:${LIGHT.muted};`;
  const a = (l: EmailLink, bold = true) =>
    `<a class="pq-link" href="${esc(l.url)}" style="color:${LIGHT.link};font-weight:${bold ? 700 : 600};text-decoration:underline;">${esc(l.label)}</a>`;
  const parts = [
    env.supportEmail && c.footer !== 'internal'
      ? `<p class="pq-muted" style="margin:0 0 14px;${small}">Questions? Reply to this email or write to ${a({ label: env.supportEmail, url: `mailto:${env.supportEmail}` })}.</p>` +
        `<div class="pq-rule" style="height:1px;line-height:1px;font-size:0;background-color:${LIGHT.line};">&nbsp;</div>`
      : '',
    `<p class="pq-muted" style="margin:14px 0 0;${small}">${esc(why)}${manage ? ` ${a(manage)}.` : ''}</p>`,
    links.length
      ? `<p class="pq-muted" style="margin:12px 0 0;${small}">${links
          .map(
            (l) =>
              `<a class="pq-muted" href="${esc(l.url)}" style="color:${LIGHT.muted};font-weight:600;text-decoration:none;">${esc(l.label)}</a>`,
          )
          .join(' &nbsp;·&nbsp; ')}</p>`
      : '',
    company
      ? `<p class="pq-subtle" style="margin:12px 0 0;font:400 12.5px/1.6 ${SANS};color:${LIGHT.subtle};">${esc(company)}</p>`
      : '',
  ];
  return parts.join('');
};

const preheader = (text: string) =>
  `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;">${esc(text)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>`;

const page = (
  env: EmailEnv,
  subject: string,
  c: EmailContent,
  body: string,
) => {
  const logo = asset(env, '/email/logo.png');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(subject)}</title>
<style>
${css()}
</style>
</head>
<body class="pq-bg" style="margin:0;padding:0;background-color:${LIGHT.bg};">
${preheader(c.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pq-bg" bgcolor="${LIGHT.bg}" style="background-color:${LIGHT.bg};">
<tr><td align="center" style="padding:32px 16px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="pq-container" style="width:600px;max-width:600px;">
<tr><td style="padding:0 4px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:8px;"><img src="${logo}" width="30" height="30" alt="${esc(env.fromName)}" style="display:block;width:30px;height:30px;border-radius:8px;"></td>
<td valign="middle" class="pq-ink" style="font:800 21px/1 ${SANS};letter-spacing:-0.035em;color:${LIGHT.ink};">postqueen</td>
</tr></table></td>
<td valign="middle" align="right" class="pq-subtle" style="font:800 11px/1 ${SANS};letter-spacing:0.12em;text-transform:uppercase;color:${LIGHT.subtle};">${esc(c.category)}</td>
</tr></table>
</td></tr>
<tr><td class="pq-card pq-pad" bgcolor="${LIGHT.card}" style="padding:40px 44px 36px;background-color:${LIGHT.card};border:1px solid ${LIGHT.line};border-radius:24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${body}
</table>
</td></tr>
<tr><td style="padding:26px 4px 4px;">${footer(env, c)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

const head = (env: EmailEnv, c: EmailContent) => {
  const t = tile(env, c);
  return (
    (t ? `<tr><td>${t}</td></tr>${spacer(20)}` : '') +
    `<tr><td>${heading(c)}</td></tr>` +
    (c.lead ? `${spacer(12)}<tr><td>${paragraph(c.lead)}</td></tr>` : '')
  );
};

const text = (env: EmailEnv, c: EmailContent) => {
  const out: string[] = [
    c.category.toUpperCase(),
    '',
    `${c.title}${c.accent ? ` ${c.accent}` : ''}`,
  ];
  if (c.lead) {
    out.push('', plain(c.lead));
  }
  for (const b of c.blocks) {
    switch (b.type) {
      case 'text':
      case 'callout':
      case 'note':
        out.push('', plain(b.text));
        break;
      case 'address':
        out.push('', b.text);
        break;
      case 'code':
        out.push('', b.code, b.note);
        break;
      case 'reason':
        out.push('', `${b.label}: ${b.text}`);
        break;
      case 'details':
        out.push('', ...b.rows.map(([k, v]) => `${k}: ${v}`));
        break;
      case 'rows':
        out.push('');
        if (b.label) {
          out.push(b.label.toUpperCase());
        }
        for (const r of b.rows) {
          out.push(
            `- ${r.meta ? `${r.meta}: ` : ''}${r.title}${r.chip ? ` (${r.chip.label})` : ''}`,
          );
          if (r.text) out.push(`  ${r.text}`);
          if (r.link) out.push(`  ${r.link.label}: ${href(env, r.link.url)}`);
        }
        break;
      case 'button':
        out.push('', `${b.link.label}: ${href(env, b.link.url)}`);
        if (b.secondary)
          out.push(`${b.secondary.label}: ${href(env, b.secondary.url)}`);
        break;
      case 'fallback':
        if (b.note) out.push(b.note);
        break;
      case 'steps':
        out.push(
          '',
          ...b.items.map((item, i) => `${i + 1}. ${item.title}: ${item.text}`),
        );
        break;
    }
  }
  const { why, manage, links, company } = footerLines(env, c);
  out.push('', '--');
  if (env.supportEmail && c.footer !== 'internal') {
    out.push(`Questions? Reply to this email or write to ${env.supportEmail}.`);
  }
  out.push(why);
  if (manage) out.push(`${manage.label}: ${manage.url}`);
  if (links.length)
    out.push(
      links
        .map((l) => `${l.label}: ${l.url.replace(/^mailto:/, '')}`)
        .join('\n'),
    );
  if (company) out.push(company);
  return out.join('\n');
};

export const renderEmail = (
  env: EmailEnv,
  subject: string,
  c: EmailContent,
) => {
  const body =
    head(env, c) +
    c.blocks
      .map((b) => `${spacer(24)}<tr><td>${block(env, b)}</td></tr>`)
      .join('');
  return { html: page(env, subject, c, body), text: text(env, c) };
};

/**
 * HTML that predates EmailContent: queued before this shipped, or sent by a
 * workflow that cannot change. It is ours, so it keeps its markup, inside the
 * same frame as everything else.
 */
export const renderLegacyEmail = (
  env: EmailEnv,
  subject: string,
  html: string,
) => {
  const c: EmailContent = {
    stream: 'account',
    category: env.fromName,
    preheader: subject,
    tone: 'brand',
    title: subject,
    blocks: [],
    footer: 'general',
  };
  const body =
    head(env, c) +
    `${spacer(16)}<tr><td class="pq-text" style="font:400 16px/1.65 ${SANS};color:${LIGHT.text};">${html}</td></tr>`;
  const flat = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    html: page(env, subject, c, body),
    text: [subject, '', flat, '', '--', FOOTER_WHY.general].join('\n'),
  };
};
