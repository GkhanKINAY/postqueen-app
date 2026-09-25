import * as Sentry from '@sentry/nextjs';
import { initializeSentryServer } from '@gitroom/react/sentry/initialize.sentry.server';

initializeSentryServer(process.env.NODE_ENV!, process.env.NEXT_PUBLIC_SENTRY_DSN!, [
  // No request bodies: the SDK keeps up to 10 KB of every incoming body even
  // with sendDefaultPii off. Node.js only, so not in the shared initializer,
  // which the edge runtime loads too.
  Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
]);
