// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "./lib/sentryScrub";

Sentry.init({
  dsn: "https://e6578f38514e2170dd8e79227b647c52@o4511498909646848.ingest.us.sentry.io/4511498937499648",

  // SH-160: privacy-first settings (no PII, no logs, scrubbed events,
  // 10% tracing). See lib/sentryScrub.ts.
  ...sentryPrivacyOptions,

  // Session Replay is off: a mental-wellness app shouldn't record member
  // sessions, even masked. Errors are still captured.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
