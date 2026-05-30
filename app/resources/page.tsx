"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { PageAmbience } from "@/app/components/pageAmbience";
import { PageTopNav } from "@/app/components/pageTopNav";
import { useTheme } from "@/app/components/themeProvider";
import { serif, sans } from "@/lib/fonts";
import {
  ChevronLeft,
  ChevronRight,
} from "@/app/components/icons";

/**
 * Stone Harbor — /resources.
 *
 * The curated external-reading surface. Reads from external_content
 * (populated daily by the ingest-external-content edge function) and
 * shows only rows the admin team has approved (is_published = true,
 * is_rejected = false).
 *
 * Layout (2026-05-31 refactor): horizontal scroll strips, one per
 * pillar — Clarity / Calm / Strength — with the member's current
 * path first. Each strip uses CSS scroll-snap with peek so the
 * member can see "there's more here" without endless vertical
 * scroll. Mirrors the /members-blog architecture for cross-page
 * consistency. /resources has no internal posts (all external) so
 * the source toggle is omitted, and no featured hero either —
 * the page jumps straight to the strips after the header.
 *
 * Mechanics:
 *   - Each pillar strip ends with a "See all in [pillar]" card
 *   - Clicking it expands the strip into a full grid (in-place)
 *   - Arrows live in the section header next to the See-all link,
 *     never on top of card content
 *   - Position dots below the strip are visual indicators only
 *
 * Cards open the external URL in a new tab (target="_blank"). No
 * modal — these articles live elsewhere and that's by design.
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

function normalizeStage(value: string | null | undefined): Pillar {
  const lower = value?.toLowerCase().trim();
  if (lower === "calm") return "calm";
  if (lower === "strength" || lower === "strenght") return "strength";
  return "clarity";
}

// Inline card used both inside the horizontal strip and in the
// expanded grid view. Same hit target everywhere — opens the
// external article in a new tab.
function ResourceCard({
  item,
  isDusk,
}: {
  item: ExternalItem;
  isDusk: boolean;
}) {
  const t = useTranslations("resources");
  return (
    <a
      href={item.external_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex h-full flex-col rounded-none border p-4 transition md:p-5 ${
        isDusk
          ? "border-white/10 bg-black/30 hover:border-[var(--sh-accent-gold)]/40 hover:bg-black/45"
          : "border-stone-200 bg-white/70 hover:border-[var(--sh-accent-gold)]/40 hover:bg-white"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
        {item.source_name}
      </p>
      <h3
        className={`${serif.className} mt-2 text-xl font-medium leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
      >
        {item.title}
      </h3>
      {(item.summary || item.classification_reasoning) && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
          {item.summary ?? item.classification_reasoning}
        </p>
      )}
      <span className="mt-auto pt-4 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)] transition group-hover:text-[var(--sh-text-primary)]">
        {t("readAtSource")}
      </span>
    </a>
  );
}

export default function ResourcesPage() {
  const t = useTranslations("resources");
  const tPillar = useTranslations("pillar");
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [items, setItems] = useState<ExternalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStage, setUserStage] = useState<Pillar>("clarity");
  const [expandedPillar, setExpandedPillar] = useState<Pillar | null>(null);
  const [activeIndex, setActiveIndex] = useState<Record<Pillar, number>>({
    clarity: 0,
    calm: 0,
    strength: 0,
  });
  const stripRefs = useRef<Record<Pillar, HTMLDivElement | null>>({
    clarity: null,
    calm: null,
    strength: null,
  });
  const sectionRefs = useRef<Record<Pillar, HTMLElement | null>>({
    clarity: null,
    calm: null,
    strength: null,
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("healing_stage")
          .eq("id", user.id)
          .single();
        setUserStage(normalizeStage(profile?.healing_stage));
      }
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

  // Group items by pillar, ordered so the member's current path
  // appears first. Mirrors the /members-blog pillarSections shape.
  const pillarSections = useMemo<
    { pillar: Pillar; items: ExternalItem[] }[]
  >(() => {
    const order: Pillar[] = [userStage];
    (["clarity", "calm", "strength"] as Pillar[]).forEach((p) => {
      if (p !== userStage) order.push(p);
    });
    return order.map((pillar) => ({
      pillar,
      items: items.filter((it) => it.pillar === pillar),
    }));
  }, [items, userStage]);

  // Pull the per-card stride (card width + gap) off the first
  // child of the scroller. 16px addition matches `gap-4`.
  function cardStrideFromContainer(el: HTMLDivElement): number {
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return 0;
    return first.getBoundingClientRect().width + 16;
  }

  function handleStripScroll(pillar: Pillar) {
    return (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const stride = cardStrideFromContainer(el);
      if (!stride) return;
      const idx = Math.round(el.scrollLeft / stride);
      setActiveIndex((s) => (s[pillar] === idx ? s : { ...s, [pillar]: idx }));
    };
  }

  function scrollStrip(pillar: Pillar, direction: "left" | "right") {
    const el = stripRefs.current[pillar];
    if (!el) return;
    const stride = cardStrideFromContainer(el);
    if (!stride) return;
    el.scrollBy({
      left: direction === "left" ? -stride : stride,
      behavior: "smooth",
    });
  }

  function togglePillar(pillar: Pillar) {
    setExpandedPillar((current) => (current === pillar ? null : pillar));
    requestAnimationFrame(() => {
      const sectionEl = sectionRefs.current[pillar];
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      <PageAmbience />

      {/* Canonical TOP NAV — shared component */}
      <PageTopNav />

      {/* Widened from max-w-5xl to max-w-7xl (2026-05-31) so the
          horizontal strips have room to show the peek on wider
          viewports — matches the dashboard/journal/messages/
          members-blog content rhythm. */}
      <section className="relative z-20 mx-auto w-full max-w-7xl flex-1 px-4 pb-20 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="pt-6 md:pt-12"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[var(--sh-accent-gold)]">
            {t("eyebrow")}
          </p>
          <h1
            className={`${serif.className} mt-3 max-w-3xl text-4xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-5xl`}
          >
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
            {t("subtitle")}
          </p>
          <div className="mt-8 h-px w-16 bg-[var(--sh-accent-gold)]" />
        </motion.div>

        {loading ? (
          <p className="mt-16 text-[var(--sh-text-tertiary)]">…</p>
        ) : items.length === 0 ? (
          <div className="mt-16 max-w-xl">
            <p className="text-base leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
              {t("emptyMessage")}
            </p>
          </div>
        ) : (
          <div className="mt-12 space-y-16">
            {pillarSections.map((section) => {
              if (section.items.length === 0) return null;
              // PILLAR_META stays as a structural fallback. Labels and
              // descriptions are localized via the shared `pillar`
              // namespace (tPillar) so the chrome flips with the
              // interface language.
              const pillarLabel = tPillar(section.pillar);
              const pillarSub = tPillar(`${section.pillar}Sub` as
                | "claritySub"
                | "calmSub"
                | "strengthSub");
              const isYours = section.pillar === userStage;
              const isExpanded = expandedPillar === section.pillar;
              const totalSlides = section.items.length + 1; // +1 for "See all" card
              const activeIdx = activeIndex[section.pillar] ?? 0;
              return (
                <motion.section
                  key={section.pillar}
                  ref={(el) => {
                    sectionRefs.current[section.pillar] = el;
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5 }}
                  aria-roledescription="carousel"
                  aria-label={`${pillarLabel} resources`}
                >
                  {/* Pillar header — title left, arrows + See-all right */}
                  <div className="mb-5 flex items-end justify-between border-b border-[var(--sh-border-medium)] pb-3 md:mb-6">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2
                          className={`${serif.className} text-3xl font-medium text-[var(--sh-text-primary)] md:text-4xl`}
                        >
                          {pillarLabel}
                        </h2>
                        {isYours && (
                          <span className="border border-[var(--sh-accent-gold)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)]">
                            {t("yourPathBadge")}
                          </span>
                        )}
                      </div>
                      <p
                        className={`${serif.className} mt-1 text-sm italic text-[var(--sh-text-secondary)] md:text-base`}
                      >
                        {pillarSub}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Strip-mode arrows in the header row so they
                          never sit on top of card content (same
                          pattern shipped to /members-blog). Disabled
                          state at boundary positions keeps the row
                          width stable as the member scrolls. */}
                      {!isExpanded && (
                        <div className="hidden items-center gap-1 md:flex">
                          <button
                            type="button"
                            onClick={() =>
                              scrollStrip(section.pillar, "left")
                            }
                            disabled={activeIdx === 0}
                            aria-label={`Scroll ${pillarLabel} backward`}
                            className={`flex h-7 w-7 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-25 ${
                              isDusk
                                ? "border-white/20 bg-white/[0.05] text-white hover:bg-white/[0.12]"
                                : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-primary)] hover:bg-[#f8f4ed]"
                            }`}
                          >
                            <ChevronLeft size={14} strokeWidth={1.8} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              scrollStrip(section.pillar, "right")
                            }
                            disabled={activeIdx >= totalSlides - 1}
                            aria-label={`Scroll ${pillarLabel} forward`}
                            className={`flex h-7 w-7 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-25 ${
                              isDusk
                                ? "border-white/20 bg-white/[0.05] text-white hover:bg-white/[0.12]"
                                : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-primary)] hover:bg-[#f8f4ed]"
                            }`}
                          >
                            <ChevronRight size={14} strokeWidth={1.8} />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => togglePillar(section.pillar)}
                        className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)] transition hover:text-[var(--sh-accent-gold)]"
                      >
                        {isExpanded
                          ? t("collapse")
                          : t("seeAll", {
                              pillar: pillarLabel,
                              count: section.items.length,
                            })}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    // EXPANDED GRID — same article cards, in a
                    // full grid instead of horizontal strip.
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {section.items.map((it) => (
                        <ResourceCard
                          key={it.id}
                          item={it}
                          isDusk={isDusk}
                        />
                      ))}
                    </div>
                  ) : (
                    // STRIP MODE — horizontal scroller with snap,
                    // trailing "See all" card, dots below.
                    <div>
                      <div
                        ref={(el) => {
                          stripRefs.current[section.pillar] = el;
                        }}
                        onScroll={handleStripScroll(section.pillar)}
                        role="region"
                        aria-label={`${pillarLabel} resources strip`}
                        tabIndex={0}
                        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:-mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
                        style={{ scrollPaddingLeft: "1rem" }}
                      >
                        {section.items.map((it, idx) => (
                          <div
                            key={it.id}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${idx + 1} of ${totalSlides}`}
                            className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-[32%] lg:w-[28%]"
                          >
                            <ResourceCard item={it} isDusk={isDusk} />
                          </div>
                        ))}
                        {/* Trailing "See all" card — same snap rhythm */}
                        <button
                          type="button"
                          onClick={() => togglePillar(section.pillar)}
                          aria-label={t("seeAll", {
                            pillar: pillarLabel,
                            count: section.items.length,
                          })}
                          className={`group flex w-[78%] shrink-0 snap-start flex-col items-center justify-center border border-dashed p-8 text-center transition sm:w-[46%] md:w-[32%] lg:w-[28%] ${
                            isDusk
                              ? "border-white/15 bg-white/[0.02] hover:border-[var(--sh-accent-gold)]/60 hover:bg-white/[0.05]"
                              : "border-[var(--sh-border-medium)] bg-white/40 hover:border-[var(--sh-accent-gold)] hover:bg-white/70"
                          }`}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]">
                            {t("seeAll", {
                              pillar: pillarLabel,
                              count: section.items.length,
                            })}
                          </span>
                          <span
                            className={`${serif.className} mt-3 text-3xl italic text-[var(--sh-text-secondary)]`}
                          >
                            {section.items.length}{" "}
                            {section.items.length === 1
                              ? t("piece")
                              : t("pieces")}
                          </span>
                          <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)] transition group-hover:text-[var(--sh-accent-gold)]">
                            {t("openFullView")}
                          </span>
                        </button>
                      </div>

                      {/* Position dots — visual only */}
                      <div
                        aria-hidden="true"
                        className="mt-3 flex justify-end gap-1.5 pr-1"
                      >
                        {Array.from({ length: totalSlides }).map((_, i) => {
                          const active = i === activeIdx;
                          return (
                            <span
                              key={i}
                              className="h-1.5 w-1.5 rounded-full transition"
                              style={{
                                backgroundColor: active
                                  ? "var(--sh-accent-gold)"
                                  : isDusk
                                    ? "rgba(255,255,255,0.20)"
                                    : "rgba(0,0,0,0.18)",
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
