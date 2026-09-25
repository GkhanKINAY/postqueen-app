import * as Sentry from '@sentry/nextjs';
import { initializeSentryBasic } from '@gitroom/react/sentry/initialize.sentry.next.basic';

export const setSentryUser = (
  user?: { id: string; email?: string; orgId: string } | null
) => {
  try {
    if (user?.id) {
      Sentry.setUser({
        id: user.id,
        ...(user.email ? { email: user.email } : {}),
      });
      Sentry.setTag('organization.id', user.orgId);
    } else {
      Sentry.setUser(null);
      Sentry.setTag('organization.id', undefined);
    }
  } catch (err) {
    /* never let telemetry break the app */
  }
};

export const initializeSentryClient = (environment: string, dsn: string) =>
  initializeSentryBasic(environment, dsn, {
    integrations: [
      // Add default integrations back
      Sentry.browserTracingIntegration(),
      Sentry.browserProfilingIntegration(),
      // No Session Replay. Upstream recorded 40% of sessions unmasked, which
      // carries post drafts, the API keys and MCP config blocks shown in
      // Settings, and whatever is typed. Even masked, it keeps a session
      // entry in the browser's storage, and the Cookie Policy on
      // postqueen.ai lists everything the app stores.
      Sentry.feedbackIntegration({
        // Disable the injection of the default widget
        autoInject: false,
        showEmail: false,
      }),
    ],

    profilesSampleRate: environment === 'development' ? 1.0 : 0.60,
  });
