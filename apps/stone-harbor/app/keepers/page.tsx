import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { KeepersClient } from "./KeepersClient";

/**
 * Stone Harbor — /keepers (SH-108, Lighthouse Keepers patron surface).
 *
 * Public, member-aware route (brief §7). Phase 2 root page — locale
 * resolves from the NEXT_LOCALE cookie via i18n/request.ts, same as
 * /privacy, /terms, /crisis-resources. Middleware allow-lists "keepers".
 *
 * Server responsibility is deliberately thin: read the
 * app_settings.keepers_enabled flag and 404 the whole surface pre-launch
 * (brief §8.6 — "404 is cleaner if we don't want prospects hitting it").
 *
 * The prospect / active-patron / lapsed branching (brief §7.2–7.4) is
 * resolved CLIENT-side in <KeepersClient>, not here. The app authenticates
 * the browser with @supabase/supabase-js (session in localStorage, not
 * cookies), so a server component cannot read the member's session — the
 * same reason /dashboard is a client surface. This diverges from the
 * shipping prompt's "server component reads session" wording, but matches
 * how auth actually works in this codebase.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Lighthouse Keepers",
    description: "Sustain the harbor — patron support for Stone Harbor.",
    alternates: {
      canonical: "/keepers",
      languages: { en: "/keepers", es: "/es/keepers" },
    },
    // Public marketing surface — indexable (brief §8.8).
    robots: { index: true, follow: true },
  };
}

async function readKeepersEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase
      .from("app_settings")
      .select("keepers_enabled")
      .eq("id", 1)
      .maybeSingle();
    return !!data?.keepers_enabled;
  } catch {
    return false;
  }
}

export default async function KeepersPage() {
  const enabled = await readKeepersEnabled();
  if (!enabled) {
    // Pre-launch: the whole surface 404s. Flip app_settings.keepers_enabled
    // to reveal it (brief §8.6).
    notFound();
  }
  return <KeepersClient />;
}
