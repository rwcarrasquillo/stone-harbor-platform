import { createClient } from "@supabase/supabase-js";
import { sans } from "@/lib/fonts";
import { AboutBackdrop } from "./AboutBackdrop";
import { AboutContent } from "./AboutContent";
import { AboutComingSoon } from "./AboutComingSoon";

/**
 * Stone Harbor — /about (server-gated).
 *
 * Reads app_settings.about_page_published. When true, renders
 * the founder note (AboutContent). When false, renders the
 * placeholder (AboutComingSoon). The admin Dashboard exposes
 * the toggle.
 *
 * Why server-side: we don't want a flash of the published
 * content when the flag is false, or vice versa. Reading on the
 * server means whichever screen the visitor gets is the
 * correct one on first paint.
 *
 * No-cache for now so the founder can flip the flag and see the
 * page change immediately. We can ISR/revalidate this once the
 * page is stable.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About — A patient harbor for men finding their way back",
  description:
    "Why Stone Harbor exists, in the founder's own words. A men's mental wellness platform built from inside the experience it's designed to address.",
};

async function readPublishFlag(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use the anon key — app_settings is admin-readable via RLS
  // anyway, and we only need this one boolean. We don't need
  // (or want) the service-role key on the public surface.
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase
      .from("app_settings")
      .select("about_page_published")
      .eq("id", 1)
      .maybeSingle();
    return !!data?.about_page_published;
  } catch {
    return false;
  }
}

export default async function AboutPage() {
  const published = await readPublishFlag();
  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100`}
    >
      <AboutBackdrop />
      {published ? <AboutContent /> : <AboutComingSoon />}
    </main>
  );
}
