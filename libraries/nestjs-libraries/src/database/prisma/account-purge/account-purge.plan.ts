// What the account purge removes, in which order, and what it keeps. Kept
// apart from the service so a spec can load it without the storage providers,
// and so the plan reads in one place: every table a deleted organization or
// user leaves behind is either in a step below or in PURGE_KEEP with a reason.

export type AccountPurgeKind = 'quiesce' | 'organization' | 'user';
export type AccountPurgeTarget = { kind: AccountPurgeKind; id: string };

// Owner decisions still open. Each is one value here.
//
// How long a deleted account's content stays before it is removed. Leaves
// time to undo a deletion made by mistake on our side, from the soft-deleted
// rows, and still lands well inside the 30 days the policy promises.
export const PURGE_GRACE_DAYS = 3;
// A deleted member's comments in a workspace that is still in use: 'keep'
// leaves them under the scrubbed user row, which carries no name or email;
// 'delete' removes them with the rest of the account.
export const MEMBER_COMMENTS_IN_LIVE_WORKSPACES: 'keep' | 'delete' = 'keep';

// An organization still unpurged this long after deletion is logged as overdue.
export const PURGE_OVERDUE_DAYS = 10;
// Rows per table per call, file removals at once, keys per shared-key query.
export const PURGE_BATCH = 500;
export const FILE_BATCH = 50;
export const KEY_BATCH = 100;
// Copilot threads handled per call, with everything keyed by them.
export const THREAD_BATCH = 100;
// A dry-run reads every row and looks up every file key in one call, so it
// stops reading after this long and logs what it counted as partial, well
// inside the activity's ten minutes.
export const DRY_RUN_BUDGET_MS = 5 * 60 * 1000;

export const daysAgo = (days: number, now = new Date()) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/**
 * Children before parents. A step that still has rows after its batch ends the
 * call, so a parent is only reached once nothing points at it any more, and a
 * reference the plan missed makes Postgres refuse the delete instead of it
 * cascading. `update` steps only null a pointer on another organization's row.
 */
export const ORGANIZATION_PURGE_STEPS = [
  { step: 'comments', model: 'Comments' },
  { step: 'tagsPosts', model: 'TagsPosts' },
  { step: 'errors', model: 'Errors' },
  { step: 'snapshots', model: 'PostMetricSnapshot' },
  { step: 'postLinks', model: 'Post', update: true },
  { step: 'posts', model: 'Post', files: true },
  { step: 'integrationWebhooks', model: 'IntegrationsWebhooks' },
  { step: 'webhooks', model: 'Webhooks' },
  { step: 'plugs', model: 'Plugs' },
  { step: 'plugData', model: 'ExisingPlugData' },
  { step: 'media', model: 'Media', files: true },
  { step: 'customers', model: 'Customer' },
  { step: 'tags', model: 'Tags' },
  { step: 'sets', model: 'Sets', files: true },
  { step: 'signatures', model: 'Signatures', files: true },
  { step: 'autoposts', model: 'AutoPost' },
  { step: 'thirdParty', model: 'ThirdParty' },
  { step: 'notifications', model: 'Notifications' },
  { step: 'creditAllocations', model: 'CreditAllocation' },
  { step: 'credits', model: 'Credits' },
  { step: 'creditGrants', model: 'CreditGrant' },
  { step: 'github', model: 'GitHub' },
  { step: 'clips', model: 'ClippingClip', files: true },
  { step: 'clippings', model: 'Clipping', files: true },
  { step: 'oauthAuthorizations', model: 'OAuthAuthorization' },
  { step: 'oauthApps', model: 'OAuthApp' },
  { step: 'subscription', model: 'Subscription' },
  { step: 'members', model: 'UserOrganization' },
  { step: 'threads', model: 'mastra_threads', files: true },
  { step: 'copilotResources', model: 'mastra_resources' },
] as const;

export type OrganizationPurgeStep =
  (typeof ORGANIZATION_PURGE_STEPS)[number]['step'];

// The Mastra resources an organization's Copilot threads are filed under,
// as MastraService.resourceId names them: the Copilot page and the Create
// Post rail.
export const copilotResourceIds = (organizationId: string) => [
  organizationId,
  `${organizationId}:composer`,
];

// Copilot rows keyed by one of the organization's threads, removed with the
// thread in the `threads` step, or by its resource ids in `copilotResources`.
export const COPILOT_PURGE_MODELS = [
  'mastra_threads',
  'mastra_messages',
  'mastra_thread_state',
  'mastra_background_tasks',
  'mastra_observational_memory',
  'mastra_scorers',
  'mastra_knowledge_activity',
  'mastra_knowledge_cursors',
  'mastra_knowledge_records',
  'mastra_workflow_snapshot',
  'mastra_resources',
] as const;

export const USER_PURGE_STEPS = [
  { step: 'userAuthorizations', model: 'OAuthAuthorization' },
  { step: 'items', model: 'ItemUser' },
  { step: 'agencyNiches', model: 'SocialMediaAgencyNiche' },
  { step: 'agency', model: 'SocialMediaAgency' },
  { step: 'memberComments', model: 'Comments' },
  { step: 'identities', model: 'UserIdentity' },
] as const;

export type UserPurgeStep = (typeof USER_PURGE_STEPS)[number]['step'];

/** Tables the purge leaves in place on purpose. */
export const PURGE_KEEP: Record<string, string> = {
  Organization:
    'Tombstone: keeps paymentId for Stripe invoices, refunds and webhooks, and every foreign key into it valid. Name, description and API key are scrubbed.',
  User: 'Tombstone: keeps comments and legacy marketplace rows pointing at a row with no name, email or provider id.',
  Integration:
    'Tombstone: keeps the md5 of rootInternalId that the trial check reads across organizations. Name, profile, picture, platform user id and credentials are scrubbed.',
  UsedCodes:
    'Billing markers keyed by Stripe invoice and session ids, read by the founding-fee logic. No personal data.',
  MessagesGroup:
    'Legacy marketplace: links two users or organizations, so it is shared by construction.',
  Orders: 'Legacy marketplace, shared by construction.',
  PayoutProblems:
    'Legacy marketplace, shared by construction. Its pointer at a purged post is nulled in postLinks.',
  mastra_ai_spans:
    '@@ignore: Prisma cannot address it. Empty while no Mastra observability is configured; check the count before turning the purge on.',
  mastra_notifications:
    '@@ignore: Prisma cannot address it. Unused by the agent here; check the count before turning the purge on.',
};

export type OrganizationGuardState = {
  deletedAt: Date | null;
  purgedAt: Date | null;
  activeMembers: number;
  subscription: { isLifetime: boolean } | null;
};

/**
 * Why an organization must not be touched, or null. Re-read on every call:
 * account deletion only removes an organization with no other active member,
 * so one showing up means something restored it. A subscription row that is
 * not a local lifetime entitlement means the cancel at deletion did not
 * finish, and the Stripe link has to stay until it does.
 */
export const organizationSkipReason = (
  org: OrganizationGuardState | null,
  options: {
    held: boolean;
    graceEndsBefore?: Date;
    billingEnabled: boolean;
  }
) => {
  if (!org) {
    return 'missing';
  }
  if (!org.deletedAt) {
    return 'not-deleted';
  }
  if (org.purgedAt) {
    return 'purged';
  }
  if (options.held) {
    return 'hold';
  }
  if (options.graceEndsBefore && org.deletedAt > options.graceEndsBefore) {
    return 'grace';
  }
  if (org.activeMembers > 0) {
    return 'active-member';
  }
  if (
    options.billingEnabled &&
    org.subscription &&
    !org.subscription.isLifetime
  ) {
    return 'subscription';
  }
  return null;
};

export type UserGuardState = {
  deletedAt: Date | null;
  purgedAt: Date | null;
  liveMemberships: number;
};

export const userSkipReason = (
  user: UserGuardState | null,
  options: { held: boolean; graceEndsBefore: Date }
) => {
  if (!user) {
    return 'missing';
  }
  if (!user.deletedAt) {
    return 'not-deleted';
  }
  if (user.purgedAt) {
    return 'purged';
  }
  if (options.held) {
    return 'hold';
  }
  if (user.deletedAt > options.graceEndsBefore) {
    return 'grace';
  }
  if (user.liveMemberships > 0) {
    return 'live-membership';
  }
  return null;
};

// The object name a saved URL ends in. Storage keys are flat, so this is what
// another row has to contain to still be using the file, whichever host it
// was saved under.
export const fileKeyOf = (url: string) =>
  url.split(/[?#]/)[0].split('/').pop() || '';

// Every http(s) URL in a piece of text: HTML post content, a JSON settings
// blob, thread metadata. Trailing punctuation from the surrounding sentence is
// not part of it.
export const urlsInText = (text: string | null | undefined) =>
  (text || '')
    .match(/https?:\/\/[^\s"'<>()\\]+/g)
    ?.map((url) => url.replace(/[.,;:!?]+$/, '')) || [];

// Post.image is a JSON array of { path, thumbnail, url }. Anything else, or
// JSON that does not parse, is scanned as text instead of being skipped.
export const postImageUrls = (image: string | null | undefined) => {
  if (!image) {
    return [];
  }
  try {
    const parsed = JSON.parse(image);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.flatMap((item) =>
      item && typeof item === 'object'
        ? [item.path, item.thumbnail, item.url].filter(
            (value): value is string => typeof value === 'string' && !!value
          )
        : []
    );
  } catch {
    return urlsInText(image);
  }
};

/**
 * The URLs this storage wrote, one per object. Everything else (another
 * host, a path that is not a key this storage would write) is never a
 * candidate for deletion.
 */
export const ownFiles = (
  urls: string[],
  isOwnFile: (url: string) => boolean
) => {
  const files = new Map<string, string>();
  for (const url of urls) {
    if (!url || !isOwnFile(url)) {
      continue;
    }
    const key = fileKeyOf(url);
    if (key && !files.has(key)) {
      files.set(key, url);
    }
  }
  return files;
};

// Which of these keys appear anywhere in these values.
export const keysUsedIn = (
  keys: string[],
  values: (string | null | undefined)[]
) => {
  const used = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    for (const key of keys) {
      if (value.includes(key)) {
        used.add(key);
      }
    }
  }
  return used;
};

// "posts=12 media=3", zeros left out, for the one log line per call.
export const purgeCountsLine = (counts: Record<string, number>) =>
  Object.entries(counts)
    .filter(([, count]) => count)
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
