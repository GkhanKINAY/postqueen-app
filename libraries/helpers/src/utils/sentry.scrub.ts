// What Sentry receives, Sentry keeps. Provider calls carry the customer's
// access token in the query string (the Graph API takes `?access_token=`),
// OAuth callbacks carry `?code=`, and the SDK copies full URLs into span
// attributes, breadcrumbs, the request of every event and log messages. The
// server SDKs also attach the request's cookies and headers, even with
// `sendDefaultPii` off: the `auth` cookie and header hold the session token,
// `Authorization` holds public API keys and MCP bearer tokens, and the
// forwarding headers hold the visitor's IP. These hooks remove all of that
// before anything leaves the process. Server-side scrubbing in Sentry only
// catches what it recognises.

// Dropped by full key name: where the SDK puts a query string on its own,
// and where OpenTelemetry puts the client's address.
const DROPPED_KEYS = new Set([
  'query_string',
  'http.query',
  'url.query',
  'client.address',
  'ip_address',
]);

// Dropped wherever they are one part of a dotted key: the cookies of a
// request, the headers that carry a session or an API key, and the headers
// that carry the visitor's IP. Span attributes spell them
// `http.request.header.x_forwarded_for` and, one per cookie,
// `http.request.header.cookie.<name>`; keys are compared with `-` read as `_`.
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
]);

const dropped = (key: string) => {
  const name = key.toLowerCase().replace(/-/g, '_');
  return (
    DROPPED_KEYS.has(name) ||
    name.split('.').some((part) => DROPPED_PARTS.has(part))
  );
};

// Lines of our own source around a stack frame: public code, not data, and
// rewriting them would only make the frame harder to read.
const SOURCE_KEYS = new Set(['context_line', 'pre_context', 'post_context']);

// An absolute URL anywhere in a string, with a query or fragment to cut.
const ABSOLUTE_URL_QUERY = /\b([a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>`]*)[?#][^\s"'<>`]*/gi;

// A path with a query, as `http.target` and request URLs hold it.
const PATH_QUERY = /^(\/[^\s?#]*)[?#][\s\S]*$/;

const MAX_DEPTH = 24;

const scrub = (node: unknown, depth: number): unknown => {
  if (typeof node === 'string') {
    return node
      .replace(ABSOLUTE_URL_QUERY, '$1')
      .replace(PATH_QUERY, '$1');
  }
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((value) => scrub(value, depth + 1));
  }
  // Only the plain objects Sentry builds. Class instances (an Error attached
  // as extra, a Date) are left as they are, and nothing is changed in place,
  // so no object the application still holds is touched.
  const proto = Object.getPrototypeOf(node);
  if (proto !== Object.prototype && proto !== null) {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !dropped(key))
      .map(([key, value]) => [
        key,
        SOURCE_KEYS.has(key) ? value : scrub(value, depth + 1),
      ])
  );
};

/**
 * A copy of a Sentry event, transaction or log without query strings, URL
 * fragments, cookies, credential headers or the visitor's IP. For
 * `beforeSend`, `beforeSendTransaction` and `beforeSendLog`.
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
