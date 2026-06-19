"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { ComponentType } from "react";

/**
 * Stone Harbor — /members-blog (production, the Letters surface).
 *
 * Stone Harbor originals only. External curated content moved to
 * `/resources` in the same ship (2026-06-18). Before the split the
 * two surfaces overlapped — both showed external articles — and
 * neither carried a clean signal about voice. After the split:
 *
 *   /members-blog → "Letters from the harbor" — original writing
 *                   from the editorial team, in Harbor Voice. The
 *                   harbor writes letters.
 *   /resources    → "What we found worth your time" — external
 *                   curated reading. The harbor reads with you.
 *
 * The metaphor shift from "library/books" to "letters" carries real
 * weight: a library is a collection, a letter is intimate and sent
 * with intention. Reading a letter from someone who knows your story
 * is a different kind of reading than browsing a shelf. The voice
 * signature — "The harbor writes letters." — only lands when the
 * surface delivers on that promise.
 *
 * Composition (top → bottom):
 *   - Brand header (anchor + "Stone Harbor · Letters" → /dashboard)
 *   - Anchor strip (eyebrow LETTERS + serif title "From the harbor."
 *     + Your-Path indicator in the stage accent)
 *   - Featured hero card (top internal letter, two-column layout)
 *   - Three pillar strips with STRIP_LIMIT cap + See-all expansion
 *   - Reader overlay (full letter content, in-place)
 *   - Horizon mark + voice signature ("The harbor writes letters.")
 *
 * Visual differentiation from /resources:
 *   /resources renders lean text-only cards (no visual slot, no hero)
 *   to feel like a reading list. /members-blog keeps the gradient
 *   visual slot and the featured hero so original letters carry the
 *   editorial weight they deserve — they're the harbor's own writing
 *   and should sit on the page like commissioned pieces, not feed
 *   items. The cards even look like envelopes from a distance.
 *
 * Mobile-parallel from day one — every breakpoint sits in the same
 * JSX via Tailwind's md: prefix.
 *
 * Tracked under SH-67 (the Letters split). See CHANGELOG entry
 * 2026-06-18 for the architectural reasoning behind the split.
 */

const GOLD_DEEP = "#a9793d";
const GOLD_DEEP_RGB = "169,121,61";
const MOSS = "#586558";
const MOSS_RGB = "88,101,88";

/**
 * Maximum cards visible in a pillar strip before the "See all"
 * affordance gates the rest. Six matches /resources so the two
 * library surfaces behave consistently — restraint as a structural
 * promise the voice signature can rest on.
 */
const STRIP_LIMIT = 6;

type Pillar = "clarity" | "calm" | "strength";

type BlogPost = {
  id: string;
  title: string;
  excerpt: string | null;
  summary: string | null;
  content: string;
  pillar: Pillar;
  published_at: string | null;
  created_at: string;
};

const PILLAR_META: Record<
  Pillar,
  { accent: string; accentRgb: string; Icon: ComponentType<IconProps> }
> = {
  clarity: { accent: GOLD_DEEP, accentRgb: GOLD_DEEP_RGB, Icon: Eye },
  calm: { accent: MOSS, accentRgb: MOSS_RGB, Icon: Wave },
  strength: { accent: GOLD_DEEP, accentRgb: GOLD_DEEP_RGB, Icon: Mountain },
};

function normalizeStage(value: string | null | undefined): Pillar {
  const lower = value?.toLowerCase().trim();
  if (lower === "calm") return "calm";
  if (lower === "strength" || lower === "strenght") return "strength";
  return "clarity";
}

function postDate(post: BlogPost): string | null {
  return post.published_at ?? post.created_at;
}

function postSummary(post: BlogPost): string | null {
  return post.summary ?? post.excerpt;
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ──────────────────────────────────────────────
   VISUAL SLOT — pillar gradient + soft contour pattern
   The visual is decorative, not photographic. Letters from the
   harbor don't carry hero photography; the slot is a frame that
   tells you what pillar the letter belongs to.
   ────────────────────────────────────────────── */

function VisualSlot({
  pillar,
  variant = "card",
}: {
  pillar: Pillar;
  variant?: "hero" | "card" | "strip";
}) {
  const meta = PILLAR_META[pillar];
  const aspect =
    variant === "hero"
      ? "aspect-[4/3] md:aspect-auto md:h-full"
      : "aspect-[16/10]";

  const iconSize = variant === "hero" ? 120 : variant === "strip" ? 72 : 64;
  return (
    <div
      className={`${aspect} relative overflow-hidden`}
      style={{
        background: `linear-gradient(135deg, ${meta.accent}26 0%, ${meta.accent}12 50%, ${meta.accent}05 100%)`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <meta.Icon
          size={iconSize}
          strokeWidth={1.1}
          style={{ color: meta.accent, opacity: 0.5 }}
        />
      </div>
      {/* Soft contour pattern — barely visible, gives the gradient
          texture so it doesn't read as flat color */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id={`slot-c-${pillar}-${variant}`}
            x="0"
            y="0"
            width="160"
            height="160"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 40 Q 40 20 80 40 T 160 40"
              fill="none"
              stroke={meta.accent}
              strokeWidth="1"
            />
            <path
              d="M0 90 Q 40 70 80 90 T 160 90"
              fill="none"
              stroke={meta.accent}
              strokeWidth="1"
            />
            <path
              d="M0 140 Q 40 120 80 140 T 160 140"
              fill="none"
              stroke={meta.accent}
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={`url(#slot-c-${pillar}-${variant})`}
        />
      </svg>
    </div>
  );
}

/* ──────────────────────────────────────────────
   LETTER CARD — used in strips and grid
   ────────────────────────────────────────────── */

function LetterCard({
  post,
  onOpen,
}: {
  post: BlogPost;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const meta = PILLAR_META[post.pillar];
  const tCard = useTranslations("membersBlog");
  const tPillar = useTranslations("pillar");
  const pillarLabel = tPillar(post.pillar);
  const date = postDate(post);

  // Card chrome — neutral subtle border, no thick colored left bar.
  // Engraved-gold lens hairlines fade in at top + bottom on hover,
  // tinted to the letter's pillar accent.
  const baseClass = isDusk
    ? "group relative block flex h-full min-h-[420px] flex-col bg-black/30 backdrop-blur-sm transition hover:bg-white/[0.06] text-left w-full"
    : "group relative block flex h-full min-h-[420px] flex-col bg-white transition hover:bg-[#fdfaf3] text-left w-full";
  const borderStyle = {
    border: isDusk ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e7e5e4",
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      className={baseClass}
      style={borderStyle}
    >
      {/* Hover hairlines */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      >
        <HairlineLens
          position="top"
          theme={isDusk ? "dusk" : "sunlit"}
          accentRgb={meta.accentRgb}
        />
      </span>
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      >
        <HairlineLens
          position="bottom"
          theme={isDusk ? "dusk" : "sunlit"}
          accentRgb={meta.accentRgb}
        />
      </span>

      <VisualSlot pillar={post.pillar} variant="strip" />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Pillar chip — no border, just the icon + accent-colored
              uppercase label. The chip's job is purely structural
              (which pillar?), not decorative. */}
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em]"
            style={{ color: meta.accent }}
          >
            <meta.Icon
              size={11}
              strokeWidth={1.5}
              style={{ color: meta.accent }}
            />
            {pillarLabel}
          </span>
        </div>
        <h3
          className={`${serif.className} line-clamp-2 text-2xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-[1.65rem]`}
        >
          {post.title}
        </h3>
        {postSummary(post) && (
          <p className="mt-2 line-clamp-3 text-sm italic leading-relaxed text-[var(--sh-text-secondary)]">
            {postSummary(post)}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
            {formatDate(date)}
          </span>
          <span
            className="text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: meta.accent }}
          >
            {tCard("readMore")}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────
   HERO LETTER — featured letter, two-column on desktop
   ────────────────────────────────────────────── */

function HeroLetter({
  post,
  onOpen,
}: {
  post: BlogPost;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const meta = PILLAR_META[post.pillar];
  const tCard = useTranslations("membersBlog");
  const tPillar = useTranslations("pillar");
  const pillarLabel = tPillar(post.pillar);
  const date = postDate(post);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full text-left"
    >
      <div
        className={`group relative grid overflow-hidden transition md:grid-cols-[1.05fr_0.95fr] ${
          isDusk
            ? "bg-black/30 backdrop-blur-sm hover:bg-white/[0.06]"
            : "bg-white hover:bg-[#fdfaf3]"
        }`}
        style={{
          border: isDusk
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid #e7e5e4",
        }}
      >
        {/* Featured hero hairlines — always visible because the hero
            IS the featured slot. The lens treatment is the featured
            signal at rest, not a hover affordance. */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 z-10"
          aria-hidden="true"
        >
          <HairlineLens
            position="top"
            theme={isDusk ? "dusk" : "sunlit"}
            accentRgb={meta.accentRgb}
          />
        </span>
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
          aria-hidden="true"
        >
          <HairlineLens
            position="bottom"
            theme={isDusk ? "dusk" : "sunlit"}
            accentRgb={meta.accentRgb}
          />
        </span>

        <VisualSlot pillar={post.pillar} variant="hero" />
        <div className="flex flex-col p-6 md:p-10">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em]"
              style={{ color: meta.accent }}
            >
              <meta.Icon
                size={11}
                strokeWidth={1.5}
                style={{ color: meta.accent }}
              />
              {pillarLabel}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
              {tCard("featured")}
            </span>
          </div>
          <h2
            className={`${serif.className} text-3xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-5xl lg:text-6xl`}
          >
            {post.title}
          </h2>
          {postSummary(post) && (
            <p className="mt-5 text-base italic leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
              {postSummary(post)}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-6 md:pt-8">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
              {formatDate(date)}
            </span>
            <span
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em]"
              style={{ color: meta.accent }}
            >
              {tCard("readMore")}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ──────────────────────────────────────────────
   MAIN PAGE
   ────────────────────────────────────────────── */

export default function NewMembersBlogPage() {
  const t = useTranslations("membersBlog");
  const tPillar = useTranslations("pillar");
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStage, setUserStage] = useState<Pillar>("clarity");
  const [openId, setOpenId] = useState<string | null>(null);
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

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    const { data: gateRow } = await supabase
      .from("profiles")
      .select("suspended_at")
      .eq("id", user.id)
      .single();
    if (gateRow?.suspended_at) {
      window.location.href = "/suspended";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("healing_stage")
      .eq("id", user.id)
      .single();
    const stage = normalizeStage(profile?.healing_stage);
    setUserStage(stage);

    // Internal Stone Harbor originals only. External curated content
    // moved to /resources in the same ship (the Letters split). The
    // `consumer = 'stone_harbor'` filter is defense-in-depth on top
    // of M5 RLS, so cross-app blog rows (eg The Long Light's future
    // table) never leak in even if a future row misses its RLS scope.
    const { data, error } = await supabase
      .from("blog_posts")
      .select(
        "id, title, excerpt, summary, content, pillar, published_at, created_at",
      )
      .eq("is_published", true)
      .eq("consumer", "stone_harbor")
      .order("published_at", { ascending: false, nullsFirst: false });

    if (error) console.error("posts:", error.message);
    setPosts((data ?? []) as BlogPost[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const sortedPosts = useMemo<BlogPost[]>(() => {
    return [...posts].sort((a, b) => {
      const at = postDate(a) ? new Date(postDate(a)!).getTime() : 0;
      const bt = postDate(b) ? new Date(postDate(b)!).getTime() : 0;
      return bt - at;
    });
  }, [posts]);

  // Featured letter — most recent overall. Sits ABOVE the pillar
  // strips and is excluded from them, so the editor's leading thought
  // always has its own slot.
  const featured = useMemo<BlogPost | null>(() => {
    return sortedPosts[0] ?? null;
  }, [sortedPosts]);

  // PILLAR SECTIONS — one entry per pillar (always all three),
  // ordered so the member's current path appears first. Excludes
  // the featured letter.
  const pillarSections = useMemo<
    { pillar: Pillar; items: BlogPost[]; total: number }[]
  >(() => {
    const featuredId = featured?.id ?? null;
    const order: Pillar[] = [userStage];
    (["clarity", "calm", "strength"] as Pillar[]).forEach((p) => {
      if (p !== userStage) order.push(p);
    });
    return order.map((pillar) => {
      const items = sortedPosts.filter(
        (it) => it.pillar === pillar && it.id !== featuredId,
      );
      return { pillar, items, total: items.length };
    });
  }, [sortedPosts, featured, userStage]);

  const openItem = useMemo<BlogPost | null>(() => {
    if (!openId) return null;
    return sortedPosts.find((it) => it.id === openId) ?? null;
  }, [openId, sortedPosts]);

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

  // ───── Loading state ─────
  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]`}
      >
        <div className="flex flex-col items-center">
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="h-24 w-24 rounded-full border border-[#c4934e]/30"
            style={{
              background:
                "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
            }}
          />
          <p
            className={`${serif.className} mt-8 text-2xl italic text-[var(--sh-text-secondary)]`}
          >
            {t("loadingLibrary")}
          </p>
        </div>
      </main>
    );
  }

  const stageAccent = PILLAR_META[userStage].accent;

  return (
    <div
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        {/* ===== Top brand header ===== */}
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

        {/* ===== Anchor strip ===== */}
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
            className="mt-3 text-[10px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: stageAccent }}
          >
            {t("yourPath", { pillar: tPillar(userStage) })}
          </p>
        </section>

        {/* ===== Body ===== */}
        <main className="flex flex-1 flex-col items-center px-4 pb-10 pt-6 md:px-10 md:pb-14 md:pt-10">
          <div className="w-full max-w-[1200px]">
            {/* EMPTY STATE — sparse library reads honest. */}
            {sortedPosts.length === 0 && (
              <div
                className={`border p-10 text-center ${
                  isDusk
                    ? "border-white/10 bg-black/30 backdrop-blur-sm"
                    : "border-[var(--sh-border-subtle)] bg-white"
                }`}
              >
                <p
                  className={`${serif.className} text-3xl italic text-[var(--sh-text-secondary)]`}
                >
                  {t("emptyTitle")}
                </p>
                <p className="mt-2 text-sm text-[var(--sh-text-tertiary)]">
                  {t("emptySub")}
                </p>
              </div>
            )}

            {/* FEATURED HERO — top internal letter */}
            {featured && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-12"
              >
                <HeroLetter
                  post={featured}
                  onOpen={() => setOpenId(featured.id)}
                />
              </motion.div>
            )}

            {/* PILLAR STRIPS */}
            {pillarSections.map((section) => {
              if (section.total === 0) return null;
              const meta = PILLAR_META[section.pillar];
              const pillarLabel = tPillar(section.pillar);
              const isYours = section.pillar === userStage;
              const isExpanded = expandedPillar === section.pillar;
              const hasMore = section.items.length > STRIP_LIMIT;
              const stripSlides = hasMore
                ? section.items.slice(0, STRIP_LIMIT)
                : section.items;
              const totalSlides =
                stripSlides.length + (hasMore ? 1 : 0);
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
                  className="mb-12 md:mb-14"
                  aria-roledescription="carousel"
                  aria-label={t("carouselAria", { pillar: pillarLabel })}
                >
                  {/* Pillar header */}
                  <div className="mb-5 flex items-end justify-between gap-3 border-b border-[var(--sh-border-medium)] pb-3">
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
                        <span
                          className="text-[9px] font-bold uppercase tracking-[0.28em]"
                          style={{ color: meta.accent }}
                        >
                          {t("yourPathBadge")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {!isExpanded && hasMore && (
                        <div className="hidden items-center gap-1 md:flex">
                          <button
                            type="button"
                            onClick={() => scrollStrip(section.pillar, "left")}
                            disabled={activeIdx === 0}
                            aria-label={t("scrollBack", { pillar: pillarLabel })}
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
                            onClick={() => scrollStrip(section.pillar, "right")}
                            disabled={activeIdx >= totalSlides - 1}
                            aria-label={t("scrollForward", {
                              pillar: pillarLabel,
                            })}
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
                                count: section.total,
                              })}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded ? (
                    // EXPANDED GRID — single grid of every letter in
                    // this pillar. No external/internal split because
                    // every letter is internal now.
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {section.items.map((it) => (
                        <LetterCard
                          key={it.id}
                          post={it}
                          onOpen={() => setOpenId(it.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="relative">
                      <div
                        ref={(el) => {
                          stripRefs.current[section.pillar] = el;
                        }}
                        onScroll={handleStripScroll(section.pillar)}
                        role="region"
                        aria-label={t("stripAria", { pillar: pillarLabel })}
                        tabIndex={0}
                        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:-mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
                        style={{ scrollPaddingLeft: "1rem" }}
                      >
                        {stripSlides.map((it, idx) => (
                          <div
                            key={it.id}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={t("slideAria", {
                              index: idx + 1,
                              total: totalSlides,
                            })}
                            className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-[32%] lg:w-[28%]"
                          >
                            <LetterCard
                              post={it}
                              onOpen={() => setOpenId(it.id)}
                            />
                          </div>
                        ))}
                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => togglePillar(section.pillar)}
                            aria-label={t("seeAllAria", {
                              count: section.total,
                              pillar: pillarLabel,
                            })}
                            className={`group flex w-[78%] shrink-0 snap-start flex-col items-center justify-center border border-dashed p-8 text-center transition sm:w-[46%] md:w-[32%] lg:w-[28%] ${
                              isDusk
                                ? "border-white/15 bg-white/[0.02] hover:border-[var(--sh-accent-gold)]/60 hover:bg-white/[0.05]"
                                : "border-[var(--sh-border-medium)] bg-white/40 hover:border-[var(--sh-accent-gold)] hover:bg-white/70"
                            }`}
                          >
                            <span
                              className="text-[10px] font-bold uppercase tracking-[0.28em]"
                              style={{ color: meta.accent }}
                            >
                              {t("seeAllShort", { pillar: pillarLabel })}
                            </span>
                            <span
                              className={`${serif.className} mt-3 text-3xl italic text-[var(--sh-text-secondary)]`}
                            >
                              {section.total}{" "}
                              {section.total === 1 ? t("piece") : t("pieces")}
                            </span>
                            <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)] transition group-hover:text-[var(--sh-accent-gold)]">
                              {t("openFullView")}
                            </span>
                          </button>
                        )}
                      </div>

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
                                  ? meta.accent
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
        </main>

        {/* ===== Horizon mark + voice signature ===== */}
        <LettersHorizonMark voiceSignature={t("voiceSignature")} />
      </div>

      {/* READER OVERLAY for letters */}
      {openItem && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10 backdrop-blur-sm"
          onClick={() => setOpenId(null)}
        >
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`relative w-full max-w-3xl shadow-[0_30px_120px_rgba(0,0,0,0.45)] ${
              isDusk
                ? "border border-white/10 bg-[#0f0c0a] backdrop-blur-md"
                : "bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className={`absolute right-4 top-4 z-10 border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition hover:border-[var(--sh-accent-gold)] ${
                isDusk
                  ? "border-white/15 bg-white/[0.06] text-[var(--sh-text-secondary)]"
                  : "border-[var(--sh-border-medium)] bg-white text-[var(--sh-text-secondary)]"
              }`}
            >
              {t("closeReader")}
            </button>
            <VisualSlot pillar={openItem.pillar} variant="hero" />
            <div className="p-6 md:p-12">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em]"
                  style={{ color: PILLAR_META[openItem.pillar].accent }}
                >
                  {tPillar(openItem.pillar)}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                  {formatDate(postDate(openItem))}
                </span>
              </div>
              <h1
                className={`${serif.className} text-3xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-5xl`}
              >
                {openItem.title}
              </h1>
              {postSummary(openItem) && (
                <p className="mt-4 text-base italic leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
                  {postSummary(openItem)}
                </p>
              )}
              <div className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-[var(--sh-text-primary)] md:text-lg">
                {openItem.content}
              </div>
            </div>
          </motion.article>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================

/**
 * Horizon mark for the /members-blog (Letters) foot.
 *
 * Same composition as the other harbor surfaces — engraved-gold rule
 * pair + breathing anchor + italic voice signature.
 */
function LettersHorizonMark({
  voiceSignature,
}: {
  voiceSignature: string;
}) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const goldHex = theme === "sunlit" ? "#a9793d" : "#c4934e";
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
          <AnchorMark size={20} shaftHeight={42} fill={goldHex} />
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
