// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "./lib/sentryScrub";

Sentry.init({
  dsn: "https://e6578f38514e2170dd8e79227b647c52@o4511498909646848.ingest.us.sentry.io/4511498937499648",

  // SH-160: privacy-first settings (no PII, no logs, scrubbed events,
  // 10% tracing). See lib/sentryScrub.ts.
  ...sentryPrivacyOptions,
});
