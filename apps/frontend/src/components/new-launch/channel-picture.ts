export function channelPlatformIcon(identifier: string): string {
  return identifier === 'youtube'
    ? '/icons/platforms/youtube.svg'
    : `/icons/platforms/${identifier}.png`;
}

/**
 * A platform that allows only its official mark: its own shape and colours,
 * never rounded, cropped, recoloured, dimmed or covered, on one solid
 * background, never under a minimum height, and a link to the channel wherever
 * a click on it does nothing else. Generic catalog, like the labels below.
 */
export interface ChannelBrandMark {
  src: string;
  /** The official monochrome versions, shown while the channel is inactive. */
  whiteSrc: string;
  blackSrc: string;
  /** Width over height. */
  ratio: number;
  minHeight: number;
  /** The channel's page from its id or handle, else the platform's home. */
  link: (channel: string) => string;
}

const BRAND_MARKS: Record<string, ChannelBrandMark> = {
  // YouTube API Services Developer Policies III.F.2 and the YouTube branding
  // guidelines: the files are the official icons from brand.youtube, and "the
  // minimum height for digital media is 20 dp". youtube.svg/png stay the
  // square platform icons the rest of the app draws.
  youtube: {
    src: '/icons/platforms/youtube-mark.svg',
    whiteSrc: '/icons/platforms/youtube-mark-white.svg',
    blackSrc: '/icons/platforms/youtube-mark-black.svg',
    ratio: 396.533 / 277.776,
    minHeight: 20,
    link: (channel) =>
      /^UC[\w-]{22}$/.test(channel)
        ? `https://www.youtube.com/channel/${channel}`
        : /^@[^\s/?#\\]+$/.test(channel)
          ? `https://www.youtube.com/${encodeURI(channel)}`
          : 'https://www.youtube.com',
  },
};

export function channelBrandMark(
  identifier?: string | null
): ChannelBrandMark | undefined {
  const id = String(identifier || '');
  return Object.prototype.hasOwnProperty.call(BRAND_MARKS, id)
    ? BRAND_MARKS[id]
    : undefined;
}

export function isBrandMark(identifier?: string | null): boolean {
  return !!channelBrandMark(identifier);
}

/**
 * The box of a brand mark standing in for a square icon of `size` px: at least
 * as wide as that icon, and never under the mark's minimum height.
 */
export function brandMarkBox(
  mark: ChannelBrandMark,
  size: number
): { width: number; height: number } {
  const width = Math.max(size, mark.minHeight * mark.ratio);
  return {
    width: Math.round(width * 100) / 100,
    height: Math.round((width / mark.ratio) * 100) / 100,
  };
}

/**
 * Where a brand mark goes on a channel avatar of `size` px. It is never drawn
 * under its minimum height or cut by the round face, so it is the face of a
 * channel without a photo only where it fits there (otherwise the face shows
 * the channel's initial), and the badge only on an avatar at least as wide as
 * itself, plate included; next to a smaller avatar it sits beside it.
 * `badge` is the caller's choice, undefined for the default (a badge on a
 * photo, or where the face can't carry the mark).
 */
export function brandMarkPlacement(
  mark: ChannelBrandMark,
  size: number,
  badgeSize: number,
  showPhoto: boolean,
  badge?: boolean
): { face: 'photo' | 'mark' | 'initial'; badge: 'on' | 'beside' | 'none' } {
  const inFace = brandMarkBox(mark, size * 0.64);
  const face = showPhoto
    ? 'photo'
    : Math.hypot(inFace.width, inFace.height) <= size
      ? 'mark'
      : 'initial';
  if (!(badge ?? face !== 'mark')) {
    return { face, badge: 'none' };
  }
  return {
    face,
    badge: brandMarkBox(mark, badgeSize).width + 2 <= size ? 'on' : 'beside',
  };
}

/** Product name for an integration identifier. Generic catalog — not per-provider UI. */
const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  x: 'X',
  twitter: 'X',
  tiktok: 'TikTok',
  'tiktok-business': 'TikTok',
  facebook: 'Facebook',
  instagram: 'Instagram',
  'instagram-standalone': 'Instagram',
  linkedin: 'LinkedIn',
  'linkedin-page': 'LinkedIn',
  threads: 'Threads',
  pinterest: 'Pinterest',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  discord: 'Discord',
  slack: 'Slack',
  telegram: 'Telegram',
  twitch: 'Twitch',
  wrapcast: 'Farcaster',
  warpcast: 'Farcaster',
  gmb: 'Google Business',
  devto: 'Dev.to',
  hashnode: 'Hashnode',
  wordpress: 'WordPress',
  dribbble: 'Dribbble',
  lemmy: 'Lemmy',
  nostr: 'Nostr',
  vk: 'VK',
  listmonk: 'ListMonk',
  moltbook: 'Moltbook',
  whop: 'Whop',
  skool: 'Skool',
  mewe: 'MeWe',
  tumblr: 'Tumblr',
  kick: 'Kick',
};

export function channelPlatformLabel(identifier: string): string {
  const id = String(identifier || '').toLowerCase();
  return PLATFORM_LABELS[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
}

export function isUsableChannelPicture(
  picture?: string | null
): picture is string {
  if (!picture) {
    return false;
  }
  const trimmed = picture.trim();
  if (!trimmed) return false;
  // Backend still serializes the placeholder as `/no-picture.jpg` or a CDN URL
  // that ends with it — both render as the gray silhouette the composer chips
  // used to show.
  return !/no-picture\.jpg(?:\?|$)/i.test(trimmed);
}
