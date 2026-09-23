export type AccountPurgeMode = 'off' | 'dry-run' | 'on';

/**
 * What the daily account purge does, from ACCOUNT_PURGE_MODE: "dry-run" counts
 * what it would remove and writes nothing, "on" removes it. Anything else,
 * unset included, is off, so a typo never starts deleting. Read by the backend,
 * which starts the workflow when it boots, and by the orchestrator on every
 * run, so switching mode is an environment change and never a workflow change.
 */
export const accountPurgeMode = (
  value = process.env.ACCOUNT_PURGE_MODE
): AccountPurgeMode => {
  const mode = (value || '').trim().toLowerCase();
  return mode === 'on' || mode === 'dry-run' ? mode : 'off';
};

/** Legal hold: workspace or user ids the purge leaves alone, from ACCOUNT_PURGE_HOLD. */
export const accountPurgeHolds = (value = process.env.ACCOUNT_PURGE_HOLD) =>
  new Set(
    (value || '')
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean)
  );
