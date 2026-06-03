"use client";
import Link from "next/link";
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
  Book,
  ChevronLeft,
  ChevronRight,
  Eye,
  Mountain,
  Wave,
  type IconProps,
} from "@/app/components/icons";
import type { ComponentType } from "react";

const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

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

type ExternalContent = {
  id: string;
  title: string;
  summary: string | null;
  external_url: string;
  source_name: string;
  pillar: Pillar;
  image_url: string | null;
  external_published_at: string | null;
  approved_at: string | null;
};

type FeedItem =
  | ({ kind: "internal" } & BlogPost)
  | ({ kind: "external" } & ExternalContent);

const PILLAR_META: Record<
  Pillar,
  { label: string; accent: string; Icon: ComponentType<IconProps> }
> = {
  clarity: { label: "Clarity", accent: GOLD_DEEP, Icon: Eye },
  calm: { label: "Calm", accent: MOSS, Icon: Wave },
  strength: { label: "Strength", accent: GOLD_DEEP, Icon: Mountain },
};

function normalizeStage(value: string | null | undefined): Pillar {
  const lower = value?.toLowerCase().trim();
  if (lower === "calm") return "calm";
  if (lower === "strength" || lower === "strenght") return "strength";
  return "clarity";
}

function feedDate(item: FeedItem): string | null {
  return item.kind === "internal"
    ? item.published_at
    : (item.external_published_at ?? item.approved_at);
}

function feedId(item: FeedItem): string {
  return item.kind === "internal" ? `int-${item.id}` : `ext-${item.id}`;
}

function feedImage(item: FeedItem): string | null {
  return item.kind === "external" ? item.image_url : null;
}

function feedSummary(item: FeedItem): string | null {
  return item.summary ?? (item.kind === "internal" ? item.excerpt : null);
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
   VISUAL SLOT — image OR gradient+icon placeholder
   ────────────────────────────────────────────── */

function VisualSlot({
  pillar,
  imageUrl,
  variant = "card",
}: {
  pillar: Pillar;
  imageUrl: string | null;
  variant?: "hero" | "card" | "strip";
}) {
  const meta = PILLAR_META[pillar];
  const aspect =
    variant === "hero"
      ? "aspect-[4/3] md:aspect-auto md:h-full"
      : variant === "strip"
        ? "aspect-[16/10]"
        : "aspect-[16/10]";

  if (imageUrl) {
    return (
      <div className={`${aspect} relative overflow-hidden bg-stone-100`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            // hide broken images and fall back to gradient via parent
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <div className="absolute right-3 top-3">
          <meta.Icon
            size={variant === "hero" ? 24 : 16}
            strokeWidth={1.4}
            style={{ color: "white", opacity: 0.85 }}
          />
        </div>
      </div>
    );
  }

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
      {/* Subtle contour overlay */}
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
   CARD — used in strips and grid
   ────────────────────────────────────────────── */

function FeedCard({
  item,
  onOpen,
  variant = "card",
}: {
  item: FeedItem;
  onOpen: () => void;
  variant?: "card" | "strip";
}) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const meta = PILLAR_META[item.pillar];
  const isExternal = item.kind === "external";
  const tCard = useTranslations("membersBlog");
  const tPillar = useTranslations("pillar");
  const pillarLabel = tPillar(item.pillar);
  const sourceBadge = isExternal
    ? item.source_name
    : tCard("stoneHarborOriginal");
  const date = feedDate(item);

  const content = (
    <>
      <VisualSlot
        pillar={item.pillar}
        imageUrl={feedImage(item)}
        variant={variant}
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{
              borderColor: meta.accent,
              color: meta.accent,
              backgroundColor: isDusk
                ? "rgba(255,255,255,0.05)"
                : "#ffffff",
            }}
          >
            <meta.Icon
              size={10}
              strokeWidth={1.5}
              style={{ color: meta.accent }}
            />
            {pillarLabel}
          </span>
          <span
            className="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{
              borderColor: isExternal
                ? isDusk
                  ? "rgba(255,255,255,0.15)"
                  : "#d6d3d1"
                : `${GOLD_DEEP}55`,
              color: isExternal
                ? isDusk
                  ? "rgba(255,255,255,0.65)"
                  : "#57534e"
                : GOLD_DEEP,
              backgroundColor: isExternal
                ? isDusk
                  ? "rgba(255,255,255,0.04)"
                  : "#f8f4ed"
                : isDusk
                  ? "rgba(196,147,78,0.12)"
                  : "#fbf6ec",
            }}
          >
            {sourceBadge}
          </span>
        </div>
        <h3
          className={`${serif.className} text-2xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-[1.65rem]`}
        >
          {item.title}
          {isExternal && (
            <span
              className="ml-1 text-base font-normal"
              style={{ color: meta.accent }}
            >
              ↗
            </span>
          )}
        </h3>
        {feedSummary(item) && (
          <p className="mt-2 line-clamp-3 text-sm italic leading-relaxed text-[var(--sh-text-secondary)]">
            {feedSummary(item)}
          </p>
        )}
        <div className="mt-auto pt-4 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
            {formatDate(date)}
          </span>
          <span
            className="text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: meta.accent }}
          >
            {isExternal
              ? tCard("readAtSourceName", { source: item.source_name })
              : tCard("readMore")}
          </span>
        </div>
      </div>
    </>
  );

  const baseClass = isDusk
    ? "group block flex h-full flex-col bg-black/30 backdrop-blur-sm transition hover:bg-white/[0.06]"
    : "group block flex h-full flex-col bg-white transition hover:bg-[#fdfaf3]";
  const borderStyle = {
    border: isDusk ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e7e5e4",
    borderLeft: `3px solid ${meta.accent}`,
  };

  if (isExternal) {
    return (
      <a
        href={item.external_url}
        target="_blank"
        rel="noopener noreferrer"
        className={baseClass}
        style={borderStyle}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${baseClass} text-left w-full`}
      style={borderStyle}
    >
      {content}
    </button>
  );
}

/* ──────────────────────────────────────────────
   HERO CARD — featured item, two-column on desktop
   ────────────────────────────────────────────── */

function HeroCard({ item, onOpen }: { item: FeedItem; onOpen: () => void }) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const meta = PILLAR_META[item.pillar];
  const isExternal = item.kind === "external";
  const tCard = useTranslations("membersBlog");
  const tPillar = useTranslations("pillar");
  const pillarLabel = tPillar(item.pillar);
  const sourceBadge = isExternal
    ? item.source_name
    : tCard("stoneHarborOriginal");
  const date = feedDate(item);

  const inner = (
    <div
      className={`grid overflow-hidden transition md:grid-cols-[1.05fr_0.95fr] ${
        isDusk
          ? "bg-black/30 backdrop-blur-sm hover:bg-white/[0.06]"
          : "bg-white hover:bg-[#fdfaf3]"
      }`}
      style={{
        border: isDusk
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid #e7e5e4",
        borderLeft: `3px solid ${meta.accent}`,
      }}
    >
      <VisualSlot
        pillar={item.pillar}
        imageUrl={feedImage(item)}
        variant="hero"
      />
      <div className="flex flex-col p-7 md:p-10">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{
              borderColor: meta.accent,
              color: meta.accent,
              backgroundColor: isDusk ? "rgba(255,255,255,0.05)" : "#ffffff",
            }}
          >
            <meta.Icon
              size={11}
              strokeWidth={1.5}
              style={{ color: meta.accent }}
            />
            {pillarLabel}
          </span>
          <span
            className="border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{
              borderColor: isExternal
                ? isDusk
                  ? "rgba(255,255,255,0.15)"
                  : "#d6d3d1"
                : `${GOLD_DEEP}55`,
              color: isExternal
                ? isDusk
                  ? "rgba(255,255,255,0.65)"
                  : "#57534e"
                : GOLD_DEEP,
              backgroundColor: isExternal
                ? isDusk
                  ? "rgba(255,255,255,0.04)"
                  : "#f8f4ed"
                : isDusk
                  ? "rgba(196,147,78,0.12)"
                  : "#fbf6ec",
            }}
          >
            {sourceBadge}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
            {tCard("featured")}
          </span>
        </div>
        <h2
          className={`${serif.className} text-4xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-5xl lg:text-6xl`}
        >
          {item.title}
          {isExternal && (
            <span
              className="ml-2 text-2xl font-normal md:text-3xl"
              style={{ color: meta.accent }}
            >
              ↗
            </span>
          )}
        </h2>
        {feedSummary(item) && (
          <p className="mt-5 text-base italic leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
            {feedSummary(item)}
          </p>
        )}
        <div className="mt-auto pt-8 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
            {formatDate(date)}
          </span>
          <span
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: meta.accent }}
          >
            {isExternal
              ? tCard("readAtSourceName", { source: item.source_name })
              : tCard("readMore")}
          </span>
        </div>
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a
        href={item.external_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      {inner}
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
  const [externals, setExternals] = useState<ExternalContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStage, setUserStage] = useState<Pillar>("clarity");
  // Source toggle (segmented control). Replaces the earlier three-chip
  // filter row. "all" reads "Both" in the UI.
  const [sourceMode, setSourceMode] = useState<"all" | "internal" | "external">(
    "all",
  );
  const [openId, setOpenId] = useState<string | null>(null);
  // Which pillar's strip is expanded into a full grid view (null = all
  // three are in horizontal-strip mode). Click "See all in [pillar]"
  // to set, "Collapse" to clear.
  const [expandedPillar, setExpandedPillar] = useState<Pillar | null>(null);
  // Active card index per strip — drives the dot position indicator.
  // Visual only; not used for navigation logic.
  const [activeIndex, setActiveIndex] = useState<Record<Pillar, number>>({
    clarity: 0,
    calm: 0,
    strength: 0,
  });
  // Refs to each strip's scroll container, used by the desktop arrows
  // to scrollBy() one card-width per click. Set via the ref callback
  // on the scroller div.
  const stripRefs = useRef<Record<Pillar, HTMLDivElement | null>>({
    clarity: null,
    calm: null,
    strength: null,
  });
  // Section refs so the "See all" / "Collapse" toggle can scroll the
  // header back into view, avoiding a jarring jump when the
  // collapsed strip and expanded grid have very different heights.
  // Typed as HTMLElement because framer-motion's `motion.section`
  // forwards a generic Element ref.
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
    // Suspension gate
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

    const [postsRes, externalsRes] = await Promise.all([
      supabase
        .from("blog_posts")
        .select(
          "id, title, excerpt, summary, content, pillar, published_at, created_at",
        )
        .eq("is_published", true)
        .order("published_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("external_content")
        .select(
          "id, title, summary, external_url, source_name, pillar, image_url, external_published_at, approved_at",
        )
        .eq("is_published", true)
        .eq("is_rejected", false)
        .order("external_published_at", {
          ascending: false,
          nullsFirst: false,
        }),
    ]);

    if (postsRes.error) console.error("posts:", postsRes.error.message);
    if (externalsRes.error)
      console.error("externals:", externalsRes.error.message);

    setPosts((postsRes.data ?? []) as BlogPost[]);
    setExternals((externalsRes.data ?? []) as ExternalContent[]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const allFeed = useMemo<FeedItem[]>(() => {
    const internal: FeedItem[] = posts.map((p) => ({
      kind: "internal" as const,
      ...p,
    }));
    const external: FeedItem[] = externals.map((e) => ({
      kind: "external" as const,
      ...e,
    }));
    const combined = [...internal, ...external].sort((a, b) => {
      const ad = feedDate(a);
      const bd = feedDate(b);
      const at = ad ? new Date(ad).getTime() : 0;
      const bt = bd ? new Date(bd).getTime() : 0;
      return bt - at;
    });
    return combined;
  }, [posts, externals]);

  // Apply source mode only. Pillar filtering happens at the strip
  // level — every strip always renders, and the source mode just
  // narrows what kinds of items each strip can show.
  const visibleFeed = useMemo<FeedItem[]>(() => {
    let items = allFeed;
    if (sourceMode === "internal")
      items = items.filter((it) => it.kind === "internal");
    if (sourceMode === "external")
      items = items.filter((it) => it.kind === "external");
    return items;
  }, [allFeed, sourceMode]);

  // FEATURED — internal-first hierarchy.
  // Look in the visible feed for the most recent internal first; if none, fall back to most recent overall.
  const featured = useMemo<FeedItem | null>(() => {
    if (visibleFeed.length === 0) return null;
    const firstInternal = visibleFeed.find((it) => it.kind === "internal");
    return firstInternal ?? visibleFeed[0];
  }, [visibleFeed]);

  // PILLAR SECTIONS — one entry per pillar (always all three),
  // ordered so the member's current path appears first. The strip
  // mode reads `items` (a single mixed-source stream sorted by date).
  // The expanded grid mode reads the `external` and `internal`
  // splits so the two visual styles stay grouped (image cards above
  // gradient cards, preserving the page's visual rhythm).
  const pillarSections = useMemo<
    {
      pillar: Pillar;
      items: FeedItem[];
      external: FeedItem[];
      internal: FeedItem[];
      total: number;
    }[]
  >(() => {
    const featuredKey = featured ? feedId(featured) : null;
    const order: Pillar[] = [userStage];
    (["clarity", "calm", "strength"] as Pillar[]).forEach((p) => {
      if (p !== userStage) order.push(p);
    });
    return order.map((pillar) => {
      const items = visibleFeed.filter(
        (it) => it.pillar === pillar && feedId(it) !== featuredKey,
      );
      const external = items.filter((it) => it.kind === "external");
      const internal = items.filter((it) => it.kind === "internal");
      return { pillar, items, external, internal, total: items.length };
    });
  }, [visibleFeed, featured, userStage]);

  // Find the open internal post for the reader overlay
  const openItem = useMemo<FeedItem | null>(() => {
    if (!openId) return null;
    return visibleFeed.find((it) => feedId(it) === openId) ?? null;
  }, [openId, visibleFeed]);

  // Pull the per-card width (including gap) off the actual first
  // child of the scroller. Computed every time so it survives
  // viewport-resize rebalancing of the responsive width classes.
  // The 16px addition matches the `gap-4` between cards.
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
    // Smoothly bring the pillar header into view on the next frame —
    // the layout has just changed height, so we wait for the paint
    // before measuring.
    requestAnimationFrame(() => {
      const sectionEl = sectionRefs.current[pillar];
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

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

  const stageMeta = PILLAR_META[userStage];

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      {/* Unified harbor ambience — same on every authenticated page */}
      <PageAmbience />

      {/* Canonical TOP NAV — shared component, see pageTopNav.tsx */}
      <PageTopNav />

      <section className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 pb-12 md:px-8">
        {/* HEADER — compact */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <Book size={14} className="text-[#a9793d]" />
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                {t("eyebrow")}
              </p>
            </div>
            <h1
              className={`${serif.className} mt-2 text-4xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-5xl`}
            >
              {t("title")}
            </h1>
          </div>
          <p
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: stageMeta.accent }}
          >
            <stageMeta.Icon
              size={12}
              strokeWidth={1.5}
              style={{ color: stageMeta.accent }}
            />
            {t("yourPath", { pillar: tPillar(userStage) })}
          </p>
        </motion.div>

        {/* SOURCE TOGGLE — small segmented control, replaces the
            earlier three-row sticky filter bar. Pillar filtering is
            now expressed structurally by the three strips below, so
            this control only narrows source kind. Not sticky on
            purpose — once chosen, the source rarely changes
            mid-session and a permanent band added visual noise. */}
        <div className="mb-10 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-muted)]">
            {t("sourceLabel")}
          </span>
          <div
            role="radiogroup"
            aria-label={t("sourceLabel")}
            className={`inline-flex border ${
              isDusk
                ? "border-white/12 bg-white/[0.03]"
                : "border-[#e7e5e4] bg-[#f8f4ed]"
            }`}
          >
            {(
              [
                { value: "all", labelKey: "sourceBoth" },
                { value: "internal", labelKey: "sourceInternal" },
                { value: "external", labelKey: "sourceExternal" },
              ] as const
            ).map((opt) => {
              const isActive = sourceMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setSourceMode(opt.value)}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition"
                  style={{
                    color: isActive
                      ? GOLD_DEEP
                      : isDusk
                        ? "rgba(255,255,255,0.65)"
                        : "#57534e",
                    backgroundColor: isActive
                      ? isDusk
                        ? "rgba(255,255,255,0.08)"
                        : "white"
                      : "transparent",
                  }}
                >
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* EMPTY STATE */}
        {visibleFeed.length === 0 && (
          <div
            className={`border p-10 text-center ${
              isDusk
                ? "border-white/10 bg-black/30 backdrop-blur-sm"
                : "border-[var(--sh-border-subtle)] bg-white"
            }`}
          >
            <p className={`${serif.className} text-3xl italic text-[var(--sh-text-secondary)]`}>
              {t("emptyTitle")}
            </p>
            <p className="mt-2 text-sm text-[var(--sh-text-tertiary)]">
              {t("emptySub")}
            </p>
          </div>
        )}

        {/* FEATURED — full-width hero card. Lives ABOVE the pillar
            strips and is NOT included in them, so the editor's chosen
            leading thought always has its own slot. */}
        {featured && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <HeroCard
              item={featured}
              onOpen={() => setOpenId(feedId(featured))}
            />
          </motion.div>
        )}

        {/* PILLAR STRIPS — one per pillar, ordered so the member's
            current path appears first. Each strip is a horizontal
            scroller with snap, position dots, and (on desktop) hover
            arrows. Click "See all in [pillar]" to expand the strip
            into a full grid of every article in that pillar. */}
        {pillarSections.map((section) => {
          if (section.total === 0) return null;
          const meta = PILLAR_META[section.pillar];
          // Use the shared pillar namespace for the label so chrome
          // flips with the interface language; PILLAR_META.label stays
          // as a structural fallback.
          const pillarLabel = tPillar(section.pillar);
          const isYours = section.pillar === userStage;
          const isExpanded = expandedPillar === section.pillar;
          // Strip "slides" include all items in date order PLUS a
          // trailing "See all" card. The dot count includes that
          // trailing card so the dots match scroll positions exactly.
          const stripSlides = section.items;
          const totalSlides = stripSlides.length + 1; // +1 for the See-all card
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
              className="mb-14"
              aria-roledescription="carousel"
              aria-label={t("carouselAria", { pillar: pillarLabel })}
            >
              {/* Pillar header */}
              <div className="mb-5 flex items-end justify-between border-b border-[var(--sh-border-medium)] pb-3">
                <div className="flex items-center gap-3">
                  <meta.Icon
                    size={20}
                    strokeWidth={1.4}
                    style={{ color: meta.accent }}
                  />
                  <h2
                    className={`${serif.className} text-3xl font-medium text-[var(--sh-text-primary)] md:text-4xl`}
                  >
                    {pillarLabel}
                  </h2>
                  {isYours && (
                    <span
                      className="border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em]"
                      style={{
                        borderColor: meta.accent,
                        color: meta.accent,
                      }}
                    >
                      {t("yourPathBadge")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Strip-mode arrows live in the header row so they
                      never sit on top of card content (their previous
                      position at the strip's left/right edges put
                      them over article previews where the faded
                      chevrons were invisible). Disabled state at
                      boundary positions keeps the row width stable
                      as the member scrolls — hiding them would
                      cause the header to reflow on every scroll. */}
                  {!isExpanded && (
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
                        aria-label={t("scrollForward", { pillar: pillarLabel })}
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
                      : t("seeAll", { pillar: pillarLabel, count: section.total })}
                  </button>
                </div>
              </div>

              {isExpanded ? (
                // EXPANDED GRID VIEW — same external-above-internal
                // rhythm as the previous full-page layout, but scoped
                // to one pillar at a time.
                <>
                  {section.external.length > 0 &&
                    sourceMode !== "internal" && (
                      <div className="mb-8">
                        <div className="mb-3 flex items-center gap-2">
                          <span
                            className="text-[10px] font-bold uppercase tracking-[0.28em]"
                            style={{ color: meta.accent }}
                          >
                            {t("fromTrustedSources")}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                            · {section.external.length}
                          </span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {section.external.map((it) => (
                            <FeedCard
                              key={feedId(it)}
                              item={it}
                              variant="strip"
                              onOpen={() => setOpenId(feedId(it))}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  {section.internal.length > 0 &&
                    sourceMode !== "external" && (
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <span
                            className="text-[10px] font-bold uppercase tracking-[0.28em]"
                            style={{ color: meta.accent }}
                          >
                            {t("stoneHarborOriginal")}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                            · {section.internal.length}
                          </span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {section.internal.map((it) => (
                            <FeedCard
                              key={feedId(it)}
                              item={it}
                              variant="strip"
                              onOpen={() => setOpenId(feedId(it))}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                </>
              ) : (
                // STRIP MODE — horizontal scroller with snap, dots,
                // and (desktop only) hover arrows.
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
                        key={feedId(it)}
                        role="group"
                        aria-roledescription="slide"
                        aria-label={t("slideAria", { index: idx + 1, total: totalSlides })}
                        className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-[32%] lg:w-[28%]"
                      >
                        <FeedCard
                          item={it}
                          variant="strip"
                          onOpen={() => setOpenId(feedId(it))}
                        />
                      </div>
                    ))}
                    {/* Trailing "See all" affordance — same dimensions
                        as a card so it sits inside the snap rhythm. */}
                    <button
                      type="button"
                      onClick={() => togglePillar(section.pillar)}
                      aria-label={t("seeAllAria", { count: section.total, pillar: pillarLabel })}
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
                  </div>

                  {/* Position dots — visual indicator only, not
                      clickable. One dot per slide (including the
                      trailing "See all" card). */}
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
      </section>

      {/* READER OVERLAY for internal posts */}
      {openItem && openItem.kind === "internal" && (
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
            <VisualSlot
              pillar={openItem.pillar}
              imageUrl={feedImage(openItem)}
              variant="hero"
            />
            <div className="p-8 md:p-12">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{
                    borderColor: PILLAR_META[openItem.pillar].accent,
                    color: PILLAR_META[openItem.pillar].accent,
                    backgroundColor: isDusk
                      ? "rgba(255,255,255,0.05)"
                      : "#ffffff",
                  }}
                >
                  {tPillar(openItem.pillar)}
                </span>
                <span
                  className="border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{
                    borderColor: `${GOLD_DEEP}55`,
                    color: GOLD_DEEP,
                    backgroundColor: isDusk
                      ? "rgba(196,147,78,0.12)"
                      : "#fbf6ec",
                  }}
                >
                  {t("stoneHarborOriginal")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                  {formatDate(feedDate(openItem))}
                </span>
              </div>
              <h1
                className={`${serif.className} text-4xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-5xl`}
              >
                {openItem.title}
              </h1>
              {feedSummary(openItem) && (
                <p className="mt-4 text-base italic leading-relaxed text-[var(--sh-text-secondary)] md:text-lg">
                  {feedSummary(openItem)}
                </p>
              )}
              <div className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-[var(--sh-text-primary)] md:text-lg">
                {(openItem as { content: string }).content}
              </div>
            </div>
          </motion.article>
        </div>
      )}

    </main>
  );
}
