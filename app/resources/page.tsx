"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { PageAmbience } from "@/app/components/pageAmbience";
import { useTheme } from "@/app/components/themeProvider";
import { serif, sans } from "@/lib/fonts";
import { ArrowLeft } from "lucide-react";

/**
 * Stone Harbor — /resources.
 *
 * The curated external-reading surface. Reads from external_content
 * (populated daily by the ingest-external-content edge function) and
 * shows only rows the admin team has approved (is_published = true,
 * is_rejected = false).
 *
 * Layout: simple cards grouped by pillar — Clarity / Calm / Strength.
 * Each card links out to the source. The "why this is here" sentence
 * comes from the row's summary (or classification_reasoning as a
 * fallback for older rows).
 *
 * Replaces the previous "Coming Soon" stub. Discoverable from the
 * dashboard's new "Resources" door.
 */

type Pillar = "clarity" | "calm" | "strength";

type ExternalItem = {
  id: string;
  title: string;
  summary: string | null;
  external_url: string;
  source_name: string;
  pillar: Pillar;
  image_url: string | null;
  external_published_at: string | null;
  classification_reasoning: string | null;
};

const PILLAR_META: Record<Pillar, { label: string; description: string }> = {
  clarity: {
    label: "Clarity",
    description: "Seeing the storm for what it was. Naming what happened.",
  },
  calm: {
    label: "Calm",
    description: "The nervous system as a place to come home to.",
  },
  strength: {
    label: "Strength",
    description: "Rebuilding identity, boundaries, the forward motion.",
  },
};

export default function ResourcesPage() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [items, setItems] = useState<ExternalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("external_content")
        .select(
          "id, title, summary, external_url, source_name, pillar, image_url, external_published_at, classification_reasoning",
        )
        .eq("is_published", true)
        .eq("is_rejected", false)
        .order("external_published_at", { ascending: false })
        .limit(60);
      if (error) {
        console.error("[resources] fetch failed:", error.message);
        setItems([]);
        return;
      }
      setItems((data ?? []) as ExternalItem[]);
    } finally {
      setLoading(false);
    }
  }

  const byPillar: Record<Pillar, ExternalItem[]> = {
    clarity: [],
    calm: [],
    strength: [],
  };
  for (const it of items) {
    if (it.pillar && byPillar[it.pillar]) byPillar[it.pillar].push(it);
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      <PageAmbience />

      <header className="relative z-30 px-4 py-5 md:px-10 md:py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition hover:text-[var(--sh-text-primary)] md:text-sm md:tracking-[0.28em]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Dashboard</span>
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)]/80 md:text-sm">
            Resources
          </p>
        </div>
      </header>

      <section className="relative z-20 mx-auto w-full max-w-5xl flex-1 px-5 pb-20 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="pt-6 md:pt-12"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[var(--sh-accent-gold)]">
            Curated
          </p>
          <h1
            className={`${serif.className} mt-3 max-w-3xl text-4xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-5xl`}
          >
            Reading the team has read first.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
            Articles, essays, and talks the team has vetted before they
            appear here. Grouped by the pillar each one tends to speak
            to. Tap any card to open the source in a new tab.
          </p>
          <div className="mt-8 h-px w-16 bg-[var(--sh-accent-gold)]" />
        </motion.div>

        {loading ? (
          <p className="mt-16 text-[var(--sh-text-tertiary)]">…</p>
        ) : items.length === 0 ? (
          <div className="mt-16 max-w-xl">
            <p className="text-base leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
              The resource library is being prepared. Once the team has
              approved the next round of curated reading, it appears here.
              Check back in a few days.
            </p>
          </div>
        ) : (
          <div className="mt-12 space-y-16">
            {(Object.keys(byPillar) as Pillar[]).map((pillar) => {
              const list = byPillar[pillar];
              if (list.length === 0) return null;
              const meta = PILLAR_META[pillar];
              return (
                <section key={pillar}>
                  <div className="mb-5 md:mb-7">
                    <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                      {meta.label}
                    </p>
                    <p
                      className={`${serif.className} mt-1 text-xl italic text-[var(--sh-text-secondary)] md:text-2xl`}
                    >
                      {meta.description}
                    </p>
                  </div>
                  <ul className="space-y-4 md:space-y-5">
                    {list.map((it) => (
                      <li key={it.id}>
                        <a
                          href={it.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`group block rounded-none border p-4 transition md:p-6 ${
                            isDusk
                              ? "border-white/10 bg-black/30 hover:border-[var(--sh-accent-gold)]/40 hover:bg-black/45"
                              : "border-stone-200 bg-white/70 hover:border-[var(--sh-accent-gold)]/40 hover:bg-white"
                          }`}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
                            {it.source_name}
                          </p>
                          <h3
                            className={`${serif.className} mt-2 text-xl font-medium leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
                          >
                            {it.title}
                          </h3>
                          {(it.summary || it.classification_reasoning) && (
                            <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
                              {it.summary ?? it.classification_reasoning}
                            </p>
                          )}
                          <span className="mt-4 inline-block text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)] transition group-hover:text-[var(--sh-text-primary)]">
                            Read at source →
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
