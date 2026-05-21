"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
import {
  Book,
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
  const meta = PILLAR_META[item.pillar];
  const isExternal = item.kind === "external";
  const sourceBadge = isExternal ? item.source_name : "Stone Harbor Original";
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
            className="inline-flex items-center gap-1.5 border bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ borderColor: meta.accent, color: meta.accent }}
          >
            <meta.Icon
              size={10}
              strokeWidth={1.5}
              style={{ color: meta.accent }}
            />
            {meta.label}
          </span>
          <span
            className="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{
              borderColor: isExternal ? "#d6d3d1" : `${GOLD_DEEP}55`,
              color: isExternal ? "#57534e" : GOLD_DEEP,
              backgroundColor: isExternal ? "#f8f4ed" : "#fbf6ec",
            }}
          >
            {sourceBadge}
          </span>
        </div>
        <h3
          className={`${serif.className} text-2xl font-medium leading-tight text-stone-900 md:text-[1.65rem]`}
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
          <p className="mt-2 line-clamp-3 text-sm italic leading-relaxed text-stone-600">
            {feedSummary(item)}
          </p>
        )}
        <div className="mt-auto pt-4 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
            {formatDate(date)}
          </span>
          <span
            className="text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: meta.accent }}
          >
            {isExternal ? `Read at ${item.source_name} →` : "Read →"}
          </span>
        </div>
      </div>
    </>
  );

  const baseClass =
    "group block flex h-full flex-col bg-white transition hover:bg-[#fdfaf3]";
  const borderStyle = {
    border: "1px solid #e7e5e4",
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
  const meta = PILLAR_META[item.pillar];
  const isExternal = item.kind === "external";
  const sourceBadge = isExternal ? item.source_name : "Stone Harbor Original";
  const date = feedDate(item);

  const inner = (
    <div
      className="grid overflow-hidden bg-white transition hover:bg-[#fdfaf3] md:grid-cols-[1.05fr_0.95fr]"
      style={{
        border: "1px solid #e7e5e4",
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
            className="inline-flex items-center gap-1.5 border bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ borderColor: meta.accent, color: meta.accent }}
          >
            <meta.Icon
              size={11}
              strokeWidth={1.5}
              style={{ color: meta.accent }}
            />
            {meta.label}
          </span>
          <span
            className="border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{
              borderColor: isExternal ? "#d6d3d1" : `${GOLD_DEEP}55`,
              color: isExternal ? "#57534e" : GOLD_DEEP,
              backgroundColor: isExternal ? "#f8f4ed" : "#fbf6ec",
            }}
          >
            {sourceBadge}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
            Featured
          </span>
        </div>
        <h2
          className={`${serif.className} text-4xl font-medium leading-tight text-stone-900 md:text-5xl lg:text-6xl`}
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
          <p className="mt-5 text-base italic leading-relaxed text-stone-600 md:text-lg">
            {feedSummary(item)}
          </p>
        )}
        <div className="mt-auto pt-8 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
            {formatDate(date)}
          </span>
          <span
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em]"
            style={{ color: meta.accent }}
          >
            {isExternal ? `Read at ${item.source_name} →` : "Read this →"}
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
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [externals, setExternals] = useState<ExternalContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStage, setUserStage] = useState<Pillar>("clarity");
  const [filter, setFilter] = useState<"yours" | "all" | Pillar>("all");
  const [sourceMode, setSourceMode] = useState<"all" | "internal" | "external">(
    "all",
  );
  const [openId, setOpenId] = useState<string | null>(null);

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

  // Apply source mode + pillar filter
  const visibleFeed = useMemo<FeedItem[]>(() => {
    let items = allFeed;
    if (sourceMode === "internal")
      items = items.filter((it) => it.kind === "internal");
    if (sourceMode === "external")
      items = items.filter((it) => it.kind === "external");
    if (filter === "yours")
      items = items.filter((it) => it.pillar === userStage);
    else if (filter !== "all")
      items = items.filter((it) => it.pillar === filter);
    return items;
  }, [allFeed, sourceMode, filter, userStage]);

  // FEATURED — internal-first hierarchy.
  // Look in the visible feed for the most recent internal first; if none, fall back to most recent overall.
  const featured = useMemo<FeedItem | null>(() => {
    if (visibleFeed.length === 0) return null;
    const firstInternal = visibleFeed.find((it) => it.kind === "internal");
    return firstInternal ?? visibleFeed[0];
  }, [visibleFeed]);

  // PILLAR SECTIONS — group by pillar, then split into external (images) and
  // internal (gradients). External cards group at the top of each section so
  // image cards never sit next to gradient cards, keeping visual rhythm clean.
  const pillarSections = useMemo<
    {
      pillar: Pillar;
      external: FeedItem[];
      internal: FeedItem[];
      total: number;
    }[]
  >(() => {
    if (!featured) return [];
    const featuredKey = feedId(featured);

    // Which pillars get rendered depends on the active filter.
    let order: Pillar[];
    if (filter === "yours") order = [userStage];
    else if (filter !== "all") order = [filter];
    else {
      // user's stage first, then the other two
      order = [userStage];
      (["clarity", "calm", "strength"] as Pillar[]).forEach((p) => {
        if (p !== userStage) order.push(p);
      });
    }

    return order.map((pillar) => {
      const all = visibleFeed.filter(
        (it) => it.pillar === pillar && feedId(it) !== featuredKey,
      );
      const external = all.filter((it) => it.kind === "external");
      const internal = all.filter((it) => it.kind === "internal");
      return { pillar, external, internal, total: all.length };
    });
  }, [visibleFeed, featured, filter, userStage]);

  // Find the open internal post for the reader overlay
  const openItem = useMemo<FeedItem | null>(() => {
    if (!openId) return null;
    return visibleFeed.find((it) => feedId(it) === openId) ?? null;
  }, [openId, visibleFeed]);

  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7]`}
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
            className={`${serif.className} mt-8 text-2xl italic text-stone-700`}
          >
            Opening the library…
          </p>
        </div>
      </main>
    );
  }

  const stageMeta = PILLAR_META[userStage];

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#f3efe7] text-stone-900`}
    >
      <InactivityGate />
      {/* AMBIENT — subtle (less than reading-focused pages) */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.025]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="newblog-contour"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 60 Q 80 30 160 60 T 320 60"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 200 Q 80 170 160 200 T 320 200"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#newblog-contour)" />
      </svg>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 30% at 92% 4%, rgba(196,147,78,0.14) 0%, rgba(196,147,78,0.04) 40%, transparent 75%)",
        }}
      />

      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-8">
        {/* TOP NAV */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/dashboard"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Dashboard
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Return To Harbor
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-[0.28em] text-stone-500 transition hover:text-[#a9793d]"
          >
            Stone Harbor
          </Link>
        </div>

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
                Members Library
              </p>
            </div>
            <h1
              className={`${serif.className} mt-2 text-4xl font-medium leading-tight text-stone-900 md:text-5xl`}
            >
              Read.
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
            Your path: {stageMeta.label}
          </p>
        </motion.div>

        {/* STICKY FILTER BAR */}
        <div className="sticky top-0 z-20 -mx-4 mb-8 border-y border-stone-200 bg-[#f3efe7]/95 px-4 py-3 backdrop-blur-sm md:-mx-8 md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "yours", "clarity", "calm", "strength"] as const).map(
                (f) => {
                  const isActive = filter === f;
                  let label = "";
                  let accent = GOLD_DEEP;
                  if (f === "all") label = "All";
                  else if (f === "yours") {
                    label = "Your Path";
                    accent = stageMeta.accent;
                  } else {
                    label = PILLAR_META[f].label;
                    accent = PILLAR_META[f].accent;
                  }
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className="border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition"
                      style={{
                        borderColor: isActive ? accent : "#e7e5e4",
                        color: isActive ? accent : "#57534e",
                        backgroundColor: isActive ? "white" : "#f8f4ed",
                      }}
                    >
                      {label}
                    </button>
                  );
                },
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "internal", "external"] as const).map((m) => {
                const isActive = sourceMode === m;
                const label =
                  m === "all"
                    ? "All Sources"
                    : m === "internal"
                      ? "Stone Harbor"
                      : "Trusted Sources";
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSourceMode(m)}
                    className="border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition"
                    style={{
                      borderColor: isActive ? GOLD_DEEP : "#e7e5e4",
                      color: isActive ? GOLD_DEEP : "#57534e",
                      backgroundColor: isActive ? "white" : "#f8f4ed",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* EMPTY STATE */}
        {visibleFeed.length === 0 && (
          <div className="border border-stone-200 bg-white p-10 text-center">
            <p className={`${serif.className} text-3xl italic text-stone-700`}>
              Nothing here yet.
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Try adjusting the filters above, or come back soon.
            </p>
          </div>
        )}

        {/* FEATURED */}
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

        {/* PILLAR SECTIONS — external (images) first, then internal (gradients) */}
        {pillarSections.map((section) => {
          if (section.total === 0) return null;
          const meta = PILLAR_META[section.pillar];
          const isYours = section.pillar === userStage;
          return (
            <motion.section
              key={section.pillar}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="mb-14"
            >
              {/* Pillar header */}
              <div className="mb-5 flex items-end justify-between border-b border-stone-300 pb-3">
                <div className="flex items-center gap-3">
                  <meta.Icon
                    size={20}
                    strokeWidth={1.4}
                    style={{ color: meta.accent }}
                  />
                  <h2
                    className={`${serif.className} text-3xl font-medium text-stone-900 md:text-4xl`}
                  >
                    {meta.label}
                  </h2>
                  {isYours && (
                    <span
                      className="border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em]"
                      style={{
                        borderColor: meta.accent,
                        color: meta.accent,
                      }}
                    >
                      Your Path
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                  {section.total} {section.total === 1 ? "entry" : "entries"}
                </span>
              </div>

              {/* SUBSECTION 1 — External (images first) */}
              {section.external.length > 0 && sourceMode !== "internal" && (
                <div className="mb-8">
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.28em]"
                      style={{ color: meta.accent }}
                    >
                      From Trusted Sources
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
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

              {/* SUBSECTION 2 — Internal (gradients) */}
              {section.internal.length > 0 && sourceMode !== "external" && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-[0.28em]"
                      style={{ color: meta.accent }}
                    >
                      Stone Harbor Original
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
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
            className="relative w-full max-w-3xl bg-white shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="absolute right-4 top-4 z-10 border border-stone-300 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-700 hover:border-[#a9793d]"
            >
              Close ×
            </button>
            <VisualSlot
              pillar={openItem.pillar}
              imageUrl={feedImage(openItem)}
              variant="hero"
            />
            <div className="p-8 md:p-12">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 border bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{
                    borderColor: PILLAR_META[openItem.pillar].accent,
                    color: PILLAR_META[openItem.pillar].accent,
                  }}
                >
                  {PILLAR_META[openItem.pillar].label}
                </span>
                <span
                  className="border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                  style={{
                    borderColor: `${GOLD_DEEP}55`,
                    color: GOLD_DEEP,
                    backgroundColor: "#fbf6ec",
                  }}
                >
                  Stone Harbor Original
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                  {formatDate(feedDate(openItem))}
                </span>
              </div>
              <h1
                className={`${serif.className} text-4xl font-medium leading-tight text-stone-900 md:text-5xl`}
              >
                {openItem.title}
              </h1>
              {feedSummary(openItem) && (
                <p className="mt-4 text-base italic leading-relaxed text-stone-600 md:text-lg">
                  {feedSummary(openItem)}
                </p>
              )}
              <div className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-stone-800 md:text-lg">
                {(openItem as { content: string }).content}
              </div>
            </div>
          </motion.article>
        </div>
      )}

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-10 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Members Library
            </p>
          </div>
          <div className="text-center">
            <p className={`${serif.className} text-base italic text-stone-600`}>
              The harbor is patient.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              If You Are In Crisis
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              Call or text <span className="font-bold text-[#a9793d]">988</span>{" "}
              — 24/7. Free. Confidential.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
