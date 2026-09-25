// What Sentry receives, Sentry keeps. Provider calls carry the customer's
// access token in the query string (the Graph API takes `?access_token=`) or
// in the path (Telegram's `/bot<token>/`), user webhooks carry their secret in
// the path, OAuth callbacks carry `?code=`, and the SDK copies full URLs into
// span attributes, breadcrumbs, the request of every event and log messages.
// The server SDKs also attach the request's cookies and headers, even with
// `sendDefaultPii` off: the `auth` cookie and header hold the session token,
// `Authorization` holds public API keys and MCP bearer tokens, and the
// forwarding headers hold the visitor's IP. These hooks remove all of that
// before anything leaves the process. Server-side scrubbing in Sentry only
// catches what it recognises.

const FILTERED = '[Filtered]';

// Dropped by full key name: where the SDK puts a query string or fragment on
// its own, and where OpenTelemetry puts the client's address.
const DROPPED_KEYS = new Set([
  'query_string',
  'http.query',
  'url.query',
  'http.fragment',
  'url.fragment',
  'client.address',
  'ip_address',
]);

// Dropped wherever they are one part of a dotted key: cookies, the headers
// that carry a session, an API key or the visitor's IP, and fields named like
// a secret. Span attributes spell headers `http.request.header.x_forwarded_for`
// and, one per cookie, `http.request.header.cookie.<name>`; keys are compared
// in lower case with `-` read as `_`.
const DROPPED_PARTS = new Set([
  'cookies',
  'cookie',
  'set_cookie',
  'auth',
  'authorization',
  'proxy_authorization',
  'x_api_key',
  'x_forwarded_for',
  'x_real_ip',
  'forwarded',
  'cf_connecting_ip',
  'true_client_ip',
  'x_client_ip',
  'client_ip',
  'password',
  'passwd',
  'secret',
  'client_secret',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'jwt',
  'credentials',
  'private_key',
  'code_verifier',
]);

// Stack traces, source lines and SDK metadata: our own code and build, not
// request data, and rewriting them would only make a frame harder to read.
const KEPT_KEYS = new Set([
  'stacktrace',
  'context_line',
  'pre_context',
  'post_context',
  'debug_meta',
  'sdk',
]);

const dropped = (key: string) => {
  const name = key.toLowerCase().replace(/-/g, '_');
  return (
    DROPPED_KEYS.has(name) ||
    name.split('.').some((part) => DROPPED_PARTS.has(part))
  );
};

// Every pattern below is linear in the length of the string: bounded
// repetition where two parts could claim the same characters, and nothing
// required after an unbounded run. Sentry cuts long values anyway; this bound
// keeps a huge request path from costing the event loop anything.
const MAX_STRING = 16384;

// scheme://[userinfo@]host/path[?query][#fragment], anywhere in a string.
const ABSOLUTE_URL =
  /\b([a-z][a-z0-9+.-]{0,31}:\/\/)(?:[^\s/?#@"'<>`]{0,256}@)?([^\s/?#"'<>`]*)([^\s?#"'<>`]*)(?:[?#][^\s"'<>`]*)?/gi;

// A string that starts with a path, as `http.target`, request URLs and
// transaction names hold it, or with a method and a path, as span
// descriptions do (`GET /auth/forgot/<token>`). Only the path and its query
// are rewritten.
const LEADING_PATH = /^([A-Z]{3,7} )?(\/[^\s?#"'<>`]*)(?:[?#]\S*)?/;

// Credentials written into text: an Authorization value, a JSON field, a
// form field.
const BEARER = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JSON_SECRET =
  /("(?:password|passwd|secret|client_secret|token|access_token|refresh_token|id_token|api_key|apikey|jwt|authorization|auth|cookie|private_key|code_verifier)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;
const FORM_SECRET =
  /\b(password|passwd|client_secret|access_token|refresh_token|id_token|api_key|apikey)=[^&\s"']+/gi;

// A path segment that looks like a key rather than a name: long, with both
// letters and digits. Telegram's `bot<id>:<token>`, a webhook secret, a
// password-reset token, and also our own ids, which the route names keep.
const secretLike = (segment: string) =>
  segment.length >= 20 && /\d/.test(segment) && /[a-z]/i.test(segment);

const cleanPath = (path: string) =>
  path
    .split('/')
    .map((segment) => (secretLike(segment) ? FILTERED : segment))
    .join('/');

const scrubString = (value: string) =>
  (value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value)
    .replace(
      ABSOLUTE_URL,
      (_, scheme: string, host: string, path: string) =>
        `${scheme}${host}${cleanPath(path)}`
    )
    .replace(
      LEADING_PATH,
      (_, method: string | undefined, path: string) =>
        `${method ?? ''}${cleanPath(path)}`
    )
    .replace(BEARER, `$1 ${FILTERED}`)
    .replace(JSON_SECRET, `$1"${FILTERED}"`)
    .replace(FORM_SECRET, `$1=${FILTERED}`);

const MAX_DEPTH = 24;

const scrub = (node: unknown, depth: number): unknown => {
  if (typeof node === 'string') {
    return scrubString(node);
  }
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (depth > MAX_DEPTH) {
    return FILTERED;
  }
  if (Array.isArray(node)) {
    return node.map((value) => scrub(value, depth + 1));
  }
  // Only the plain objects Sentry builds. Class instances are left as they
  // are, and nothing is changed in place, so no object the application still
  // holds is touched.
  const proto = Object.getPrototypeOf(node);
  if (proto !== Object.prototype && proto !== null) {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !dropped(key))
      .map(([key, value]) => {
        if (KEPT_KEYS.has(key)) {
          return [key, value];
        }
        // A request's body: the password of a sign-in, the text of a post.
        if (key === 'request' && value && typeof value === 'object') {
          const withoutBody = Object.fromEntries(
            Object.entries(value).filter(([name]) => name !== 'data')
          );
          return [key, scrub(withoutBody, depth + 1)];
        }
        return [key, scrub(value, depth + 1)];
      })
  );
};

/**
 * A copy of a Sentry event, transaction or log without query strings, URL
 * fragments or credentials in URLs, cookies, credential headers, request
 * bodies, fields named like a secret, or the visitor's IP. For `beforeSend`,
 * `beforeSendTransaction`, `beforeSendLog` and an event processor.
 */
export const scrubForSentry = <T>(event: T): T => scrub(event, 0) as T;

/**
 * For `beforeBreadcrumb`: console lines ride along on every error event as
 * breadcrumbs, so they follow the same rule as the logs, warnings and errors
 * only. Info and debug lines carry provider responses and user content.
 */
export const consoleWarningsAndErrorsOnly = <
  T extends { category?: string; level?: string }
>(
  breadcrumb: T
): T | null =>
  breadcrumb.category === 'console' &&
  breadcrumb.level !== 'warning' &&
  breadcrumb.level !== 'error'
    ? null
    : breadcrumb;
