"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Stone Harbor — Rhythm dashboard tile.
 *
 * Member dashboard entry into /rhythm (SH-40 v1). Quiet card, never
 * shouting. Voice matches The Map's literary-brother register so the
 * two tiles read as siblings rather than competing surfaces.
 *
 * Locale handling: same pattern as TheMapTile — the tile copy is
 * English-only on the dashboard for now (dashboard itself isn't
 * locale-bound), but the href routes to the member's preferred locale
 * via the NEXT_LOCALE cookie. The Rhythm page itself renders in
 * Spanish for ES-preferring members.
 *
 * Gating: this tile is currently always-on for founder-gated members.
 * When the profile `eidos_observation_enabled` opt-in column lands
 * (per SH-40 v2 + the architecture addendum §12.4 item 6), the tile
 * should hide itself when the member has not opted in.
 */

function readLocaleCookie(): "en" | "es" {
  if (typeof document === "undefined") return "en";
  const m = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(document.cookie);
  const v = m?.[1];
  return v === "es" ? "es" : "en";
}

export function RhythmTile() {
  const [locale, setLocale] = useState<"en" | "es">("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocale(readLocaleCookie());
    setMounted(true);
  }, []);

  // Avoid a hydration mismatch on the locale-aware href by waiting
  // until after the client picks up the cookie. The tile is hidden
  // server-side, which is fine — the dashboard already shows /map
  // and other tiles as the primary surface.
  if (!mounted) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className="relative my-10 md:my-12"
    >
      <div className="relative border border-[#586558]/50 bg-[var(--sh-card-bg)] p-6 md:p-8">
        {/* Cooler radial wash than The Map's amber glow — Rhythm is
            about pattern-noticing, not invitation to action. The visual
            difference helps the operator tell the two siblings apart at
            a glance on the dashboard. */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(88,101,88,0.14) 0%, transparent 60%)",
          }}
        />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#586558]">
            Your Rhythm
          </p>
          <h2 className="mt-3 font-serif text-2xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-3xl">
            Your day has a shape.
          </h2>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
            Stone Harbor watches when you write. Not what — just when. After
            a couple of weeks the pattern starts to show, and you can come
            here and see it.
          </p>
          <Link
            href={`/${locale}/rhythm`}
            className="mt-6 inline-block rounded-none border border-[#586558] bg-[#586558] px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#475247]"
          >
            See your rhythm
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
