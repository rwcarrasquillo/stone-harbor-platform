import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * Stone Harbor — Sentry privacy scrubbing (SH-160, review finding 6).
 *
 * Shared by the client, server and edge Sentry configs. Members of a
 * mental-wellness product should never have identity, cookies, headers or
 * query strings (tokens, ids, search text) leave the platform inside an
 * error report. Errors stay diagnosable from the stack trace and path.
 */

function stripQuery(url: string): string {
  return url.split(/[?#]/)[0];
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    delete event.request.data;
    if (event.request.url) event.request.url = stripQuery(event.request.url);
  }
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console output can carry arbitrary app data; don't ship it.
  if (breadcrumb.category === "console") return null;
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = stripQuery(data[key]);
    }
  }
  return breadcrumb;
}

/** Shared, privacy-first options for every Sentry.init. */
export const sentryPrivacyOptions = {
  sendDefaultPii: false,
  // Performance tracing at 10% is plenty for a small app, and every trace
  // carries route metadata.
  tracesSampleRate: 0.1,
  // Sentry Logs would forward console output; keep it off.
  enableLogs: false,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
