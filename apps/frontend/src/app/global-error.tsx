'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';

// The last line of defence: it replaces the root layout, so nothing from the
// app's providers or stylesheet can be assumed here. It used to render
// `next/error`, whose message was invisible against this app's page colours,
// so a crash looked like an empty white page with nothing to click. Inline
// styles and a reload button, and nothing that needs the app around it.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const { sentryDsn } = useVariables();

  useEffect(() => {
    if (!sentryDsn) {
      return;
    }
    const eventId = Sentry.captureException(error);
    Sentry.showReportDialog({
      eventId,
      title: 'Something broke!',
      subtitle: 'Please help us fix the issue by providing some details.',
      labelComments: 'What happened?',
      labelName: 'Your name',
      labelEmail: 'Your email',
      labelSubmit: 'Send Report',
      lang: 'en',
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111113',
          color: '#f4f4f5',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 20px', color: '#a1a1aa', lineHeight: 1.5 }}>
            This page could not be displayed. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 0,
              background: '#7c3aed',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
