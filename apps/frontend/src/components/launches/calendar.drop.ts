/**
 * PUT `/posts/:id/date` `action` for a calendar drop / move.
 *
 * `schedule` promotes the row to QUEUE and starts Temporal. On a DRAFT that
 * is the same as clicking Publish: a now/past slot posts immediately, and a
 * provider failure emails "unknown error". Moving a draft only changes its
 * date until the composer publishes it.
 */
export function dateChangeActionForDrop(
  state?: string
): 'schedule' | 'update' {
  return state === 'DRAFT' ? 'update' : 'schedule';
}
