/**
 * Turns whatever a publish threw into a line a user can read.
 *
 * Errors cross the Temporal workflow→activity boundary as JSON, and
 * `Error.message` is inherited and non-enumerable — it does not survive
 * `JSON.stringify`. What does survive on an ActivityFailure is
 * `cause.failure.message`, so reading only `message` produced '' for every real
 * provider error. Storing the raw object instead is worse: kilobytes of nested
 * ProtoFailure including stack traces, and `Post.error` is rendered straight
 * into a tooltip on the calendar.
 */
export const extractPostErrorMessage = (err: any): string => {
  const raw =
    typeof err === 'string'
      ? err
      : err?.message ||
        err?.cause?.message ||
        err?.cause?.failure?.message ||
        err?.failure?.message ||
        '';

  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 300);
};

/**
 * Display side of the same field. Rows written before the extractor above went
 * in hold a serialized failure object, which is unreadable and leaks internals
 * — fall back to the generic message for those.
 */
export const postErrorText = (error: any, fallback: string): string => {
  const text = typeof error === 'string' ? error.trim() : '';
  if (!text || text.startsWith('{') || text.startsWith('[')) {
    return fallback;
  }

  return text;
};
