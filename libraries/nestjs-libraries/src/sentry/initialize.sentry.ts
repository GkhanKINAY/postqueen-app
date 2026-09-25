import * as Sentry from '@sentry/nestjs';
import { capitalize } from 'lodash';
import {
  consoleWarningsAndErrorsOnly,
  scrubForSentry,
} from '@gitroom/helpers/utils/sentry.scrub';

export const setSentryUserContext = (params: {
  userId?: string;
  email?: string;
  orgId?: string;
  paymentId?: string | null;
}) => {
  try {
    Sentry.setUser(
      params.userId
        ? { id: params.userId, ...(params.email ? { email: params.email } : {}) }
        : null
    );
    if (params.orgId) {
      Sentry.setTag('organization.id', params.orgId);
    }
    if (params.paymentId?.startsWith('cus_')) {
      Sentry.setTag('stripe.customer_id', params.paymentId);
    }
  } catch (err) {
    /* never let telemetry break a request */
  }
};

export const initializeSentry = (appName: string, allowLogs = false) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return null;
  }

  // SENTRY_ENVIRONMENT first: the production image runs the backend and the
  // orchestrator without NODE_ENV, which would file every event under
  // "development" and profile every sampled trace.
  const environment =
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';

  // Required here rather than imported at the top: `@sentry/profiling-node`
  // pulls a prebuilt native binding, and it has none for every Node release —
  // on Node 25 the process dies on load. A top-level import made that fatal for
  // installs with no Sentry configured at all, which is most self-hosted ones.
  // Now nothing is loaded unless a DSN is set, and a missing binding degrades
  // to "no profiling" instead of "no server".
  let profiling: any = null;
  try {
    // The `require` is the point of the comment above — it has to stay lazy.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    profiling = require('@sentry/profiling-node').nodeProfilingIntegration();
  } catch {
    profiling = null;
  }

  try {
    Sentry.init({
      initialScope: {
        tags: {
          service: appName,
          component: 'nestjs',
        },
        contexts: {
          app: {
            name: `PostQueen ${capitalize(appName)}`,
          },
        },
      },
      environment,
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      spotlight: process.env.SENTRY_SPOTLIGHT === '1',
      integrations: [
        // Add our Profiling integration
        ...(profiling ? [profiling] : []),
        // No request bodies: the SDK keeps up to 10 KB of every incoming
        // body even with sendDefaultPii off, sign-in passwords included.
        Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
        // Warnings and errors only: info and debug lines carry provider
        // responses and user content, and they are in the pm2 logs anyway.
        Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
        // Spans and token counts, not the prompts and answers: those are the
        // customer's posts and Copilot conversations.
        Sentry.openAIIntegration({
          recordInputs: false,
          recordOutputs: false,
        }),
      ],
      tracesSampler: ({ name, attributes, normalizedRequest, inheritOrSampleWith }) => {
        const path = String(
          normalizedRequest?.url || attributes?.['http.target'] || attributes?.['url.path'] || name || ''
        );
        const method = String(
          normalizedRequest?.method || attributes?.['http.request.method'] || attributes?.['http.method'] || ''
        );
        // MCP stream GETs are declined with 405; never trace them
        if (method === 'GET' && /^(https?:\/\/[^/]+)?\/mcp(\/|-oauth|\?|$)/.test(path)) {
          return 0;
        }
        return inheritOrSampleWith(
          path.includes('/public/v1/analytics/') ? 0.01 : 0.1
        );
      },
      enableLogs: true,
      // Access tokens in URLs, session cookies and API keys; see sentry.scrub.
      beforeBreadcrumb: consoleWarningsAndErrorsOnly,
      beforeSend: (event) => scrubForSentry(event),
      beforeSendTransaction: (event) => scrubForSentry(event),
      beforeSendLog: (log) => scrubForSentry(log),

      // Profiling
      profileSessionSampleRate: environment === 'development' ? 1.0 : 0.2,
      profileLifecycle: 'trace',
    });
  } catch (err) {
    console.log(err);
  }
  return true;
};
