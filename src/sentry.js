// Error reporting. Without this we only learn about breakage when someone
// files a support request — which means most problems go unreported.
//
// The DSN is not a secret. It's write-only and designed to live in client
// code; it identifies where to send events and can't read anything back.
import * as Sentry from '@sentry/react';

const DSN = 'https://0696814190858dc47ad6713f39cbe831@o4511988923629568.ingest.us.sentry.io/4511988932149248';

export function initSentry() {
  // Skip in dev — local errors are already visible in the console, and
  // filling the dashboard with them makes real reports harder to spot.
  if (import.meta.env.DEV) return;

  Sentry.init({
    dsn: DSN,
    // 'web' or 'desktop' — same bundle, different shell, and it matters when
    // a bug only reproduces in one of them.
    environment: window.location.protocol === 'file:' ? 'desktop' : 'web',
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Attaches the signed-in user to every report, so an error tells you who hit
// it. Email and role only — no permissions, no tokens.
export function setSentryUser(user) {
  if (import.meta.env.DEV) return;
  Sentry.setUser(user ? { id: user.uid, email: user.email, role: user.role } : null);
}
