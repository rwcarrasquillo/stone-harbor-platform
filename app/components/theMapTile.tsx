"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — The Map dashboard tile.
 *
 * A quiet card surfaced on the member dashboard that introduces or
 * resumes The Map. Reads /api/map/state to decide which CTA to show:
 *
 *   • No session            → "Begin your map"
 *   • In progress / paused  → "Continue your map"
 *   • Complete, no chapter  → "Assemble your Operating Manual"
 *   • Chapter generated     → "Open your Operating Manual"
 *
 * Locale handling: the dashboard itself is English-only for now, but
 * the Map lives under the [locale] segment. We read the NEXT_LOCALE
 * cookie (set by next-intl's middleware when the member chooses
 * Spanish on a public page) and route to the matching locale. This
 * keeps a Spanish-preferring member's experience consistent even
 * though the dashboard doesn't yet localize itself.
 */

type MapState = {
  session: {
    status: "not_started" | "in_progress" | "paused" | "complete";
  } | null;
  chapters: Array<{ chapterNumber: number }>;
};

function readLocaleCookie(): "en" | "es" {
  if (typeof document === "undefined") return "en";
  const m = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(document.cookie);
  const v = m?.[1];
  return v === "es" ? "es" : "en";
}

export function TheMapTile() {
  const [state, setState] = useState<MapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState<"en" | "es">("en");

  useEffect(() => {
    setLocale(readLocaleCookie());
    void load();
  }, []);

  async function load() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      const resp = await fetch("/api/map/state", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (resp.ok) setState(await resp.json());
    } catch {
      // If the API is unreachable, just hide the tile rather than
      // showing an error on the dashboard. The Map is opt-in; a brief
      // unavailability shouldn't push noise into the harbor.
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;

  const hasChapter1 = state?.chapters?.some((c) => c.chapterNumber === 1);
  const status = state?.session?.status ?? null;
  const inProgress = status === "in_progress" || status === "paused";
  const complete = status === "complete";

  // Copy is intentionally in literary-brother voice, English on the
  // dashboard for now. The destination page picks up the member's
  // locale and renders in Spanish if that's their preference.
  const { eyebrow, headline, body, cta, href } = (() => {
    if (hasChapter1) {
      return {
        eyebrow: "Your Operating Manual",
        headline: "Chapter 1 is ready when you are.",
        body:
          "Read on the days that ask for it. The harbor remembers what you wrote.",
        cta: "Open the manual",
        href: `/${locale}/map/operating-manual`,
      };
    }
    if (complete) {
      return {
        eyebrow: "The Map · Week 1",
        headline: "You finished the first walk.",
        body:
          "Chapter 1 of your Operating Manual is waiting to be assembled. Five seconds, then it's yours.",
        cta: "Assemble Chapter 1",
        href: `/${locale}/map`,
      };
    }
    if (inProgress) {
      return {
        eyebrow: "The Map",
        headline: "You're partway through.",
        body:
          "Pick up where you left off. The next short session is waiting.",
        cta: "Continue your map",
        href: `/${locale}/map`,
      };
    }
    return {
      eyebrow: "The Map",
      headline: "Find the ground beneath you.",
      body:
        "Three short sessions, then a personal document you keep — your Operating Manual. The Map is for clarity, not diagnosis.",
      cta: "Begin your map",
      href: `/${locale}/map/begin`,
    };
  })();

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="relative my-10 md:my-12"
    >
      <div className="relative border border-[#c4934e]/40 bg-[var(--sh-card-bg)] p-6 md:p-8">
        {/* Warm radial wash so the tile reads as inviting, not stark.
            Matches the dawn-glow ambience used elsewhere. */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,147,78,0.10) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
            {eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-2xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-3xl">
            {headline}
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
            {body}
          </p>
          <Link
            href={href}
            className="mt-6 inline-block rounded-none border border-[#c4934e] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432]"
          >
            {cta}
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
