import * as Sentry from '@sentry/nextjs';
import {
  consoleWarningsAndErrorsOnly,
  scrubForSentry,
} from '@gitroom/helpers/utils/sentry.scrub';

export const initializeSentryBasic = (environment: string, dsn: string, extension: any) => {
  if (!dsn) {
    return;
  }

  const ignorePatterns = [
    /^Failed to fetch$/,
    /^Failed to fetch .*/i,
    /^Load failed$/i,
    /^Load failed .*/i,
    /^NetworkError when attempting to fetch resource\.$/i,
    /^NetworkError when attempting to fetch resource\. .*/i,
    /^Object captured as promise rejection with keys: code, message$/i,
    /^Called on script loaded before session recording is available$/i,
    /^Failed to connect to MetaMask$/i,
    /^MetaMask extension not found$/i,
    /^undefined is not an object \(evaluating '\w+\.progress'\)$/i,
  ];

  // Browser wallet extensions (Phantom, MetaMask, etc.) reject with a plain
  // { code, message } object instead of an Error when the user closes their popup.
  // Those rejections happen inside the extension's injected script, not in our code.
  const isWalletExtensionRejection = (exception: unknown) =>
    !!exception &&
    typeof exception === 'object' &&
    !(exception instanceof Error) &&
    'code' in exception &&
    'message' in exception;

  try {
    Sentry.init({
      initialScope: {
        tags: {
          service: 'frontend',
          component: 'nextjs',
        },
        contexts: {
          app: {
            name: 'PostQueen Frontend',
            version: process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0',
          },
        },
      },
      integrations: [
        Sentry.consoleLoggingIntegration({ levels: ['log', 'info', 'warn', 'error', 'debug', 'assert', 'trace'] }),
      ],
      environment: environment || 'development',
      spotlight: process.env.SENTRY_SPOTLIGHT === '1',
      dsn,
      // Off: on the Next.js server this attaches request cookies, and the
      // `auth` cookie is the session token; in the browser it stores the
      // visitor's IP. The signed-in user is attached by setSentryUser instead.
      sendDefaultPii: false,
      ...extension,
      debug: environment === 'development',
      tracesSampleRate: 0.1,
      // OAuth codes in URLs and the session cookie; see sentry.scrub.
      beforeBreadcrumb: consoleWarningsAndErrorsOnly,
      beforeSendTransaction: (event) => scrubForSentry(event),

      beforeSend(event, hint) {
        if (isWalletExtensionRejection(hint?.originalException)) {
          return null; // Ignore the event
        }

        if (event.exception && event.exception.values) {
          for (const exception of event.exception.values) {
            if (exception.value) {
              for (const pattern of ignorePatterns) {
                if (pattern.test(exception.value)) {
                  return null; // Ignore the event
                }
              }
            }
          }
        }

        // No crash-report dialog: Sentry's is English-only, not RTL, and it
        // opened on every captured exception, including ones the page
        // recovered from.
        return scrubForSentry(event); // Send the event to Sentry
      },
    });
  } catch (err) {
    // Log initialization errors
    // eslint-disable-next-line no-console
    console.error('Sentry.init failed:', err);
  }
};
