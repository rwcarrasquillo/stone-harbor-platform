/**
 * Stone Harbor — slug → brand-aligned feature name mapping.
 *
 * Extracted to a standalone pure module so it can be unit-tested
 * without loading React, supabase-js, or anything else that
 * lib/memberUsage.ts pulls in. The mapping itself is also the
 * documentation of what each URL slug means in member-facing
 * language, which makes it useful as a single source of truth.
 *
 * Keep this map in sync with the dashboard tile labels in
 * app/dashboard/page.tsx (the FOUR DOORS section). When the brand
 * voice updates the door names, change them here too so analytics
 * keep speaking the same language.
 */

export const SLUG_TO_FEATURE: Record<string, string> = {
  // Four dashboard doors.
  journal: "Reflect",
  vent: "Vent",
  messages: "Brotherhood",
  meditation: "Breathe",
  // Other authenticated routes.
  "members-blog": "Members Blog",
  dashboard: "Dashboard",
  welcome: "Welcome",
  roadmap: "Roadmap",
  resources: "Resources",
  "start-here": "Start Here",
};

/**
 * Map a URL pathname to a stable feature name. The first
 * path segment drives the lookup; remaining segments are
 * ignored so /journal, /journal/123, /journal?x=1 all bucket
 * to "Reflect".
 *
 * Unmapped slugs are title-cased so the analytics dashboard
 * stays readable when a new route appears before it's
 * registered here (e.g. "some-new-page" → "Some New Page").
 *
 * Empty path "/" maps to "Home".
 */
export function featureForPath(path: string): string {
  const first = path.replace(/^\/+/, "").split("/")[0] ?? "";
  if (first === "") return "Home";
  const mapped = SLUG_TO_FEATURE[first.toLowerCase()];
  if (mapped) return mapped;
  return first
    .toLowerCase()
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}
