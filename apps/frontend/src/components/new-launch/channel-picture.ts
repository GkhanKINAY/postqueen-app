export function channelPlatformIcon(identifier: string): string {
  return identifier === 'youtube'
    ? '/icons/platforms/youtube.svg'
    : `/icons/platforms/${identifier}.png`;
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
  reddit: 'Reddit',
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
  medium: 'Medium',
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
