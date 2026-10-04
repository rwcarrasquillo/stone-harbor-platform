// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "./lib/sentryScrub";

Sentry.init({
  dsn: "https://e6578f38514e2170dd8e79227b647c52@o4511498909646848.ingest.us.sentry.io/4511498937499648",

  // SH-160: privacy-first settings (no PII, no logs, scrubbed events,
  // 10% tracing). See lib/sentryScrub.ts.
  ...sentryPrivacyOptions,
});
