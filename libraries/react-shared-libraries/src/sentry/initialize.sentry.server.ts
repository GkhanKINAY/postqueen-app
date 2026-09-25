import * as Sentry from '@sentry/nextjs';
import { initializeSentryBasic } from '@gitroom/react/sentry/initialize.sentry.next.basic';

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export const initializeSentryServer = (
  environment: string,
  dsn: string,
  integrations?: SentryOptions['integrations']
) => initializeSentryBasic(environment, dsn, integrations ? { integrations } : {});
