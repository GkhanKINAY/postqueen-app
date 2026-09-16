/**
 * Per-post "tell me when this goes live" flag.
 *
 * Stored on the post's provider `settings` JSON as `pq_notify` so it rides
 * the existing create/update path without a schema change. Missing or true
 * keeps today's behaviour: in-app + digested email on a successful publish.
 * `false` skips that success notice. Failures still notify.
 *
 * Frozen post workflows always call `inAppNotification` after `updatePost`.
 * The activity reads this flag off the row `updatePost` just wrote, using the
 * release URL in the success message.
 */
export const PQ_NOTIFY_SETTING = 'pq_notify';

export function postWantsPublishNotice(settings: unknown): boolean {
  let parsed: any = settings;
  if (typeof settings === 'string') {
    try {
      parsed = JSON.parse(settings);
    } catch {
      return true;
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return true;
  }
  return parsed[PQ_NOTIFY_SETTING] !== false;
}

export function publishNoticeReleaseUrl(message: string): string | undefined {
  const match = String(message || '').match(/\sat\s(https?:\/\/\S+)\s*$/i);
  return match?.[1];
}
