/**
 * Finish a two-step (page / channel) connect after the provider OAuth
 * callback. The first POST created the row; this payload picks which page
 * to attach.
 *
 * Do not spread the Google callback query into the body. That object carries
 * `code`, `iss`, `scope` and friends — none of which saveProviderPage reads —
 * and a future `id` query param would overwrite the selected channel id.
 */
export function channelConnectBody(
  selection: Record<string, unknown>,
  state?: string
) {
  return {
    ...selection,
    ...(typeof state === 'string' && state ? { state } : {}),
  };
}

/**
 * Endpoints to try, in order.
 *
 * When `state` is present we are on the OAuth callback page. Prefer the
 * public route: it resolves the org from Redis (`organization:${state}`),
 * which is the org that *started* the connect. The authenticated route uses
 * whatever AuthMiddleware picks from the session / `showorg` cookie, and a
 * Google redirect can land the session on a different org than the one that
 * issued the state — Save then 404s "Integration not found" with nothing
 * on screen, because the picker stays mounted over the error state.
 */
export function channelConnectEndpoints(opts: {
  integrationId: string;
  logged: boolean;
  state?: string;
}): string[] {
  const { integrationId, logged, state } = opts;
  if (!integrationId) {
    return [];
  }
  const auth = `/integrations/provider/${integrationId}/connect`;
  const pub = `/integrations/public/provider/${integrationId}/connect`;
  if (state) {
    return logged ? [pub, auth] : [pub];
  }
  return logged ? [auth] : [];
}

export function shouldTryNextConnectEndpoint(status: number) {
  return status === 401 || status === 403 || status === 404;
}
