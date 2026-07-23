"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { AnchorMark } from "@/app/components/anchorMark";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme } from "@/app/components/themeProvider";
import { serif, sans } from "@/lib/fonts";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Mountain,
  Wave,
  type IconProps,
} from "@/app/components/icons";

/**
 * Stone Harbor — /resources (production, harbor vocabulary).
 *
 * The curated external-reading surface. Reads from external_content
 * (populated daily by the ingest-external-content edge function) and
 * shows only rows the admin team has approved (is_published = true,
 * is_rejected = false).
 *
 * Layout: horizontal scroll strips, one per pillar —
 * Clarity / Calm / Strength — with the member's current path first.
 * Each strip uses CSS scroll-snap with peek so the member can see
 * "there's more here" without endless vertical scroll. Mirrors the
 * /letters architecture for cross-page consistency. /resources
 * has no internal posts (all external) so the source toggle is
 * omitted, and no featured hero either — the page jumps straight to
 * the strips after the anchor strip.
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
 *
 * Harbor vocabulary applied (2026-06-18):
 *   - Brand header (anchor + "Stone Harbor · Resources" → /dashboard)
 *   - Anchor strip with eyebrow + title + subtitle
 *   - Horizon mark + voice signature ("The harbor reads with you.")
 *   - Mobile-parallel from day one (same JSX, md: breakpoints).
 *
 * Tracked under SH-65 (Harbor vocabulary — simple trio).
 */

const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

/**
 * Maximum cards visible in a pillar strip before the "See all"
 * affordance gates the rest.
 *
 * 6 is the harbor's chosen cap — at desktop (28% card width) that's
 * roughly two scroll positions to see everything; on mobile (78%) it's
 * six swipes, bounded but explorable. The cap reinforces editorial
 * curation: the strip is a quick-glance affordance, not a feed. The
 * trailing "See all in [pillar] (N) →" card opens the full grid when
 * a member wants the complete collection. Pillars with ≤6 items show
 * everything inline and no "See all" appears — the cap is a ceiling,
 * not a floor.
 *
 * The voice signature for this surface — "The harbor reads with you"
 * — depends on visible restraint. Eternal horizontal scroll would
 * undercut the line.
 */
const STRIP_LIMIT = 6;

type Pillar = "clarity" | "calm" | "strength";

// Each pillar pairs an icon with its accent color. Same shape as the
// PILLAR_META on /letters so the two library surfaces render
// pillar identity the same way: small accent-colored icon next to a
// white serif italic H2. The icon carries the color signal so the
// title itself can stay editorially restrained.
const PILLAR_META: Record<
  Pillar,
  { accent: string; Icon: ComponentType<IconProps> }
> = {
  clarity: { accent: GOLD_DEEP, Icon: Eye },
  calm: { accent: MOSS, Icon: Wave },
  strength: { accent: GOLD_DEEP, Icon: Mountain },
};

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

function normalizeStage(value: string | null | undefined): Pillar {
  const lower = value?.toLowerCase().trim();
  if (lower === "calm") return "calm";
  if (lower === "strength" || lower === "strenght") return "strength";
  return "clarity";
}

// Inline card used both inside the horizontal strip and in the
// expanded grid view. Same hit target everywhere — opens the
// external article in a new tab.
//
// Hover treatment: engraved-gold lens hairlines fade in at the top
// and bottom of whichever card the cursor is over. Same hover-follows-
// cursor pattern as /messages conversation cards and /letters
// FeedCard, scoped to brand gold (the cards aren't pillar-tinted on
// /resources — pillar identity sits in the strip header above).
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
      className={`group relative flex h-full min-h-[240px] flex-col rounded-none border p-4 transition md:min-h-[260px] md:p-5 ${
        isDusk
          ? "border-white/10 bg-black/30 hover:bg-black/45"
          : "border-stone-200 bg-white/70 hover:bg-white"
      }`}
    >
      {/* Hover hairlines — opacity-fade in on group-hover. The CSS
          duration matches the FeedCard treatment on /letters so
          the cards feel like one family across the library + resources
          surfaces. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      >
        <HairlineLens position="top" theme={isDusk ? "dusk" : "sunlit"} />
      </span>
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      >
        <HairlineLens position="bottom" theme={isDusk ? "dusk" : "sunlit"} />
      </span>
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
        {item.source_name}
      </p>
      {/* Bounded variation — long titles clamp to 3 lines with a
          graceful ellipsis, long summaries clamp to 3 lines. Combined
          with min-h above, neighboring cards in a row read as close
          to uniform without forcing rigid pixel heights or truncating
          short titles unfairly. */}
      <h3
        className={`${serif.className} mt-2 line-clamp-3 text-xl font-medium leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
      >
        {item.title}
      </h3>
      {(item.summary || item.classification_reasoning) && (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
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
  // appears first. Mirrors the /letters pillarSections shape.
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
    <div
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        {/* ===== Top brand header =====
            Anchor + "Stone Harbor · Resources" → /dashboard. Mobile
            shrinks padding + crumb text, hides the right-side back link
            (the breadcrumb already carries the affordance). */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-4 py-4 md:px-10 md:py-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 md:gap-3"
            aria-label="Stone Harbor — Dashboard"
          >
            <AnchorMark size={28} />
            <span
              className={`${serif.className} text-[16px] italic tracking-[-0.012em] text-[var(--sh-text-primary)] md:text-[20px]`}
            >
              Stone Harbor
            </span>
            <span className="text-[14px] text-[var(--sh-text-muted)] md:text-[16px]">
              ·
            </span>
            <span
              className={`${serif.className} text-[16px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)] md:text-[20px]`}
            >
              {t("brandCrumb")}
            </span>
          </Link>

          <Link
            href="/dashboard"
            style={{ outline: "none", outlineOffset: 0 }}
            className={`${sans.className} hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)] md:block`}
          >
            ← Dashboard
          </Link>
        </header>

        {/* ===== Anchor strip =====
            Eyebrow + serif title + subtitle. Centered on the page axis.
            Mobile collapses title from 24 → 20 and tightens vertical
            padding. The subtitle wraps onto two lines on a phone,
            which is fine. */}
        <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-4 py-6 text-center md:px-10 md:py-8">
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {t("eyebrow")}
          </p>
          <p
            className={`${serif.className} mt-2 text-[20px] italic font-medium tracking-[-0.01em] md:text-[24px]`}
          >
            {t("title")}
          </p>
          <p
            className={`${sans.className} mt-3 max-w-2xl text-[12px] leading-relaxed text-[var(--sh-text-secondary)] md:text-[13px]`}
          >
            {t("subtitle")}
          </p>
        </section>

        {/* ===== Body =====
            Three pillar strips centered inside max-w-[1200px] (the
            harbor's common reading-width for card grids). Mobile keeps
            the same horizontal scroll snap rhythm but reduces outer
            padding. */}
        <main className="flex flex-1 flex-col items-center px-4 pb-10 pt-6 md:px-10 md:pb-14 md:pt-10">
          <div className="w-full max-w-[1200px]">
            {loading ? (
              // Soft loading state — breathing pulse + serif phrase,
              // same pattern as /journal, /messages, /lineage.
              <div className="flex flex-col items-center py-20">
                <motion.div
                  animate={{
                    scale: [1, 1.18, 1],
                    opacity: [0.6, 0.95, 0.6],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="h-20 w-20 rounded-full border border-[var(--sh-accent-gold-dusk)]/30"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
                  }}
                />
                <p
                  className={`${serif.className} mt-6 text-lg italic text-[var(--sh-text-secondary)]`}
                >
                  {t("eyebrow")}…
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="mx-auto mt-8 max-w-xl text-center">
                <p className="text-base leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
                  {t("emptyMessage")}
                </p>
              </div>
            ) : (
              <div className="space-y-12 md:space-y-16">
                {pillarSections.map((section) => {
                  if (section.items.length === 0) return null;
                  const meta = PILLAR_META[section.pillar];
                  const pillarLabel = tPillar(section.pillar);
                  const pillarSub = tPillar(`${section.pillar}Sub` as
                    | "claritySub"
                    | "calmSub"
                    | "strengthSub");
                  const isYours = section.pillar === userStage;
                  const isExpanded = expandedPillar === section.pillar;
                  // STRIP_LIMIT cap. `hasMore` controls whether the
                  // trailing "See all" card renders, whether the
                  // header "See all" link + chevron arrows appear,
                  // and what the dot indicator counts. Pillars with
                  // ≤6 items get a clean strip with no expand
                  // affordance — there's nothing meaningful to
                  // expand to.
                  const hasMore = section.items.length > STRIP_LIMIT;
                  const visibleItems = hasMore
                    ? section.items.slice(0, STRIP_LIMIT)
                    : section.items;
                  const totalSlides =
                    visibleItems.length + (hasMore ? 1 : 0);
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
                      {/* Pillar header — title left, arrows + See-all right.
                          Mobile drops the arrow cluster (members can swipe). */}
                      <div className="mb-5 flex items-end justify-between gap-3 border-b border-[var(--sh-border-medium)] pb-3 md:mb-6">
                        <div>
                          {/* Pillar header — accent-colored icon on
                              the left carries the color signal; the
                              H2 stays editorial white serif italic.
                              Same composition as /letters so the
                              two library surfaces read as one family. */}
                          <div className="flex items-center gap-2 md:gap-3">
                            <meta.Icon
                              size={20}
                              strokeWidth={1.4}
                              style={{ color: meta.accent }}
                            />
                            <h2
                              className={`${serif.className} text-2xl font-medium text-[var(--sh-text-primary)] md:text-4xl`}
                            >
                              {pillarLabel}
                            </h2>
                            {isYours && (
                              // No box, no rectangle. Uppercase
                              // tracked label in the pillar accent so
                              // the "your path" cue tracks the same
                              // color as the icon on its left.
                              <span
                                className="text-[9px] font-bold uppercase tracking-[0.28em]"
                                style={{ color: meta.accent }}
                              >
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
                          {!isExpanded && hasMore && (
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
                                    : "border-[var(--sh-border-medium)] bg-[var(--sh-bg-card-tinted)] text-[var(--sh-text-primary)] hover:bg-[var(--sh-bg-card-tinted-hover)]"
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
                                    : "border-[var(--sh-border-medium)] bg-[var(--sh-bg-card-tinted)] text-[var(--sh-text-primary)] hover:bg-[var(--sh-bg-card-tinted-hover)]"
                                }`}
                              >
                                <ChevronRight size={14} strokeWidth={1.8} />
                              </button>
                            </div>
                          )}
                          {/* Header "See all" / "Collapse" only
                              renders when there's something beyond
                              the strip to reveal — pillars that fit
                              in 6 cards don't need an expand toggle. */}
                          {(hasMore || isExpanded) && (
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
                          )}
                        </div>
                      </div>

                      {isExpanded ? (
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
                            {visibleItems.map((it, idx) => (
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
                            {hasMore && (
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
                            )}
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
          </div>
        </main>

        {/* ===== Horizon mark + voice signature ===== */}
        <ResourcesHorizonMark voiceSignature={t("voiceSignature")} />
      </div>
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================

/**
 * Horizon mark for the /resources foot.
 *
 * Same composition as the other harbor surfaces — engraved-gold rule
 * pair + breathing anchor + italic voice signature. Inlined here
 * while the four nearly-identical implementations remain
 * ungeneralized; the eventual HarborHorizonMark component will absorb
 * all of them.
 */
function ResourcesHorizonMark({
  voiceSignature,
}: {
  voiceSignature: string;
}) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const lineShadow =
    theme === "sunlit"
      ? "0 1px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.28)";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center border-t border-[var(--sh-border-subtle)] px-4 pb-10 pt-8 md:px-10">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, rgba(${goldRgb},${lineAlphaInner}) 100%)`,
            boxShadow: lineShadow,
          }}
        />

        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill="var(--sh-accent-gold)" />
        </motion.div>

        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, rgba(${goldRgb},${lineAlphaInner}) 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, transparent 100%)`,
            boxShadow: lineShadow,
          }}
        />
      </motion.div>

      <p
        className={`${serif.className} mt-5 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {voiceSignature}
      </p>
    </div>
  );
}
