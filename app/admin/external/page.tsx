"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { PageAmbience } from "@/app/components/pageAmbience";
import { serif, sans } from "@/lib/fonts";
import { Globe, Plus, Trash } from "@/app/components/icons";
import { Toast, type ToastState } from "@/app/components/toast";

const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type Pillar = "clarity" | "calm" | "strength";

type ExternalContent = {
  id: string;
  source_id: string;
  source_name: string;
  external_url: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  pillar: Pillar | null;
  relevance_score: number | null;
  classification_model: string | null;
  classification_reasoning: string | null;
  external_published_at: string | null;
  fetched_at: string;
  is_published: boolean;
  is_rejected: boolean;
};

type Source = {
  id: string;
  name: string;
  feed_url: string;
  trust_tier: string;
  is_active: boolean;
  last_fetched_at: string | null;
};

const PILLARS: { value: Pillar; label: string; accent: string }[] = [
  { value: "clarity", label: "Clarity", accent: GOLD_DEEP },
  { value: "calm", label: "Calm", accent: MOSS },
  { value: "strength", label: "Strength", accent: GOLD_DEEP },
];

function pillarAccent(p: Pillar | null): string {
  if (p === "calm") return MOSS;
  return GOLD_DEEP;
}

function timeAgo(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export default function AdminExternalReview() {
  const [items, setItems] = useState<ExternalContent[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const fail = (msg: string) => setToast({ tone: "error", text: msg });
  const [authzError, setAuthzError] = useState<string | null>(null);
  const [tab, setTab] = useState<"drafts" | "published" | "rejected">("drafts");
  const [pillarFilter, setPillarFilter] = useState<"all" | Pillar>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMenuOpen, setIngestMenuOpen] = useState(false);

  // ---- Source management state ----
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState({
    name: "",
    base_url: "",
    feed_url: "",
    description: "",
    trust_tier: "standard" as "high" | "standard" | "caution",
  });
  const [addingSource, setAddingSource] = useState(false);

  // ---- LLM source suggestion state ----
  const [suggestions, setSuggestions] = useState<
    Array<{
      name: string;
      base_url: string;
      feed_url: string;
      description: string;
      trust_tier: "high" | "standard" | "caution";
      reasoning?: string;
      feed_validated: boolean;
      feed_status?: number | string;
    }>
  >([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestFocus, setSuggestFocus] = useState("");

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/admin/login";
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      setAuthzError("This page is admin-only.");
      setLoading(false);
      return;
    }

    const [itemsRes, sourcesRes] = await Promise.all([
      supabase
        .from("external_content")
        .select(
          "id, source_id, source_name, external_url, title, summary, image_url, pillar, relevance_score, classification_model, classification_reasoning, external_published_at, fetched_at, is_published, is_rejected",
        )
        .order("fetched_at", { ascending: false })
        .limit(200),
      supabase
        .from("external_sources")
        .select("id, name, feed_url, trust_tier, is_active, last_fetched_at")
        .order("name", { ascending: true }),
    ]);

    setItems((itemsRes.data ?? []) as ExternalContent[]);
    setSources((sourcesRes.data ?? []) as Source[]);
    setLoading(false);
  }

  async function runIngestion(sourceId?: string) {
    setIngesting(true);
    setIngestMenuOpen(false);
    const { error } = await supabase.functions.invoke(
      "ingest-external-content",
      { body: sourceId ? { source_id: sourceId } : {} },
    );
    if (error) fail(`Ingestion failed: ${error.message}`);
    await loadAll();
    setIngesting(false);
  }

  async function approve(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from("external_content")
      .update({
        is_published: true,
        is_rejected: false,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) fail(error.message);
    else await loadAll();
    setBusyId(null);
  }

  async function reject(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from("external_content")
      .update({ is_published: false, is_rejected: true })
      .eq("id", id);
    if (error) fail(error.message);
    else await loadAll();
    setBusyId(null);
  }

  async function unreject(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from("external_content")
      .update({ is_rejected: false })
      .eq("id", id);
    if (error) fail(error.message);
    else await loadAll();
    setBusyId(null);
  }

  async function unpublish(id: string) {
    if (!window.confirm("Move this back to drafts?")) return;
    setBusyId(id);
    const { error } = await supabase
      .from("external_content")
      .update({ is_published: false, approved_at: null })
      .eq("id", id);
    if (error) fail(error.message);
    else await loadAll();
    setBusyId(null);
  }

  async function hardDelete(id: string) {
    if (!window.confirm("Permanently delete this link?")) return;
    setBusyId(id);
    const { error } = await supabase
      .from("external_content")
      .delete()
      .eq("id", id);
    if (error) fail(error.message);
    else await loadAll();
    setBusyId(null);
  }

  async function toggleSource(source: Source) {
    const { error } = await supabase
      .from("external_sources")
      .update({ is_active: !source.is_active })
      .eq("id", source.id);
    if (error) fail(error.message);
    else await loadAll();
  }

  async function addSourceManual() {
    if (!newSource.name.trim() || !newSource.base_url.trim() || !newSource.feed_url.trim()) {
      fail("Name, base URL, and feed URL are all required.");
      return;
    }
    setAddingSource(true);
    const { error } = await supabase.from("external_sources").insert({
      name: newSource.name.trim(),
      base_url: newSource.base_url.trim(),
      feed_url: newSource.feed_url.trim(),
      description: newSource.description.trim() || null,
      trust_tier: newSource.trust_tier,
      is_active: true,
    });
    if (error) fail(error.message);
    else {
      setNewSource({
        name: "",
        base_url: "",
        feed_url: "",
        description: "",
        trust_tier: "standard",
      });
      setShowAddSource(false);
      await loadAll();
    }
    setAddingSource(false);
  }

  async function fetchSuggestions() {
    setSuggesting(true);
    setSuggestions([]);
    const { data, error } = await supabase.functions.invoke(
      "suggest-external-sources",
      { body: suggestFocus ? { focus: suggestFocus, count: 5 } : { count: 5 } },
    );
    if (error) {
      fail(`Suggestion failed: ${error.message}`);
    } else if (data?.suggestions) {
      setSuggestions(data.suggestions);
    }
    setSuggesting(false);
  }

  async function addSuggestion(idx: number) {
    const s = suggestions[idx];
    if (!s) return;
    const { error } = await supabase.from("external_sources").insert({
      name: s.name,
      base_url: s.base_url,
      feed_url: s.feed_url,
      description: s.description,
      trust_tier: s.trust_tier,
      is_active: true,
    });
    if (error) {
      fail(error.message);
      return;
    }
    setSuggestions(suggestions.filter((_, i) => i !== idx));
    await loadAll();
  }

  useEffect(() => {
    loadAll();
  }, []);

  const visible = useMemo(() => {
    return items.filter((it) => {
      const matchesTab =
        tab === "drafts"
          ? !it.is_published && !it.is_rejected
          : tab === "published"
            ? it.is_published
            : it.is_rejected;
      const matchesPillar =
        pillarFilter === "all" || it.pillar === pillarFilter;
      const matchesSource =
        sourceFilter === "all" || it.source_id === sourceFilter;
      return matchesTab && matchesPillar && matchesSource;
    });
  }, [items, tab, pillarFilter, sourceFilter]);

  const counts = useMemo(
    () => ({
      drafts: items.filter((it) => !it.is_published && !it.is_rejected).length,
      published: items.filter((it) => it.is_published).length,
      rejected: items.filter((it) => it.is_rejected).length,
    }),
    [items],
  );

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
            className={`${serif.className} mt-8 text-2xl italic text-stone-700`}
          >
            Loading external content…
          </p>
        </div>
      </main>
    );
  }

  if (authzError) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)] px-6`}
      >
        <div className="max-w-md text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
            Restricted
          </p>
          <h1
            className={`${serif.className} mt-4 text-4xl font-medium text-stone-900`}
          >
            {authzError}
          </h1>
          <Link
            href="/admin"
            className="mt-8 inline-block border border-[#c4934e] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[#a9793d] hover:bg-[#c4934e] hover:text-white"
          >
            Back To Admin
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      {/* Unified harbor ambience — same on every authenticated page */}
      <PageAmbience />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8 md:px-8">
        {/* TOP NAV */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Admin
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Admin · External Content
            </span>
          </Link>
          <div className="flex gap-2">
            <Link
              href="/admin/blog"
              className="border border-stone-300 bg-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d]"
            >
              Internal Blog →
            </Link>
          </div>
        </div>

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-[#a9793d]" />
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                Curated From Trusted Sources
              </p>
            </div>
            <h1
              className={`${serif.className} mt-3 text-5xl font-medium leading-tight text-stone-900 md:text-6xl`}
            >
              External links.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
              RSS feeds from {sources.length} source
              {sources.length === 1 ? "" : "s"} get classified by pillar and
              relevance. Approve what fits; reject what doesn&apos;t.
            </p>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIngestMenuOpen((o) => !o)}
              disabled={ingesting}
              className="group relative inline-flex items-center gap-3 overflow-hidden border border-[#c4934e] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
            >
              {ingesting ? (
                <motion.span
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="h-2 w-2 rounded-full bg-white"
                />
              ) : (
                <Plus size={14} />
              )}
              <span>{ingesting ? "Ingesting…" : "Run Ingestion"}</span>
            </button>
            {ingestMenuOpen && !ingesting && (
              <div className="absolute right-0 top-full z-30 mt-2 w-64 border border-stone-300 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => runIngestion()}
                  className="block w-full border-b border-stone-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:bg-[#f8f4ed]"
                >
                  All active sources
                </button>
                {sources
                  .filter((s) => s.is_active)
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => runIngestion(s.id)}
                      className="block w-full border-b border-stone-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition last:border-b-0 hover:bg-[#f8f4ed]"
                    >
                      {s.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* TABS + FILTERS */}
        <div className="mb-6 flex flex-col gap-4 border-y border-stone-200 bg-white/40 px-5 py-4 backdrop-blur-sm">
          <div className="flex flex-wrap gap-2">
            {(["drafts", "published", "rejected"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="border px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] transition"
                style={{
                  borderColor: tab === t ? GOLD_DEEP : "#e7e5e4",
                  color: tab === t ? GOLD_DEEP : "#57534e",
                  backgroundColor: tab === t ? "white" : "#f8f4ed",
                  boxShadow: tab === t ? `inset 0 0 0 1px ${GOLD_DEEP}` : undefined,
                }}
              >
                {t} ({counts[t]})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPillarFilter("all")}
              className="border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition"
              style={{
                borderColor: pillarFilter === "all" ? GOLD_DEEP : "#e7e5e4",
                color: pillarFilter === "all" ? GOLD_DEEP : "#57534e",
                backgroundColor: pillarFilter === "all" ? "white" : "#f8f4ed",
              }}
            >
              All Pillars
            </button>
            {PILLARS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPillarFilter(p.value)}
                className="border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition"
                style={{
                  borderColor: pillarFilter === p.value ? p.accent : "#e7e5e4",
                  color: pillarFilter === p.value ? p.accent : "#57534e",
                  backgroundColor: pillarFilter === p.value ? "white" : "#f8f4ed",
                }}
              >
                {p.label}
              </button>
            ))}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="border border-stone-300 bg-[#f8f4ed] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-700 outline-none focus:border-[#a9793d]"
            >
              <option value="all">All Sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* LIST */}
        {visible.length === 0 ? (
          <div className="border border-stone-200 bg-white p-8">
            <p
              className={`${serif.className} text-2xl italic text-stone-700`}
            >
              {tab === "drafts"
                ? "Nothing waiting for review."
                : tab === "published"
                  ? "No approved links yet."
                  : "No rejected links."}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              {tab === "drafts"
                ? "Hit Run Ingestion to pull fresh content from active sources."
                : "Approved external links appear on /members-blog."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((it) => {
              const accent = pillarAccent(it.pillar);
              const isBusy = busyId === it.id;
              return (
                <motion.article
                  key={it.id}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.3 }}
                  className="bg-white p-5 transition md:p-6"
                  style={{
                    border: "1px solid #e7e5e4",
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span
                      className="border bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]"
                      style={{ borderColor: accent, color: accent }}
                    >
                      {it.pillar ?? "—"}
                    </span>
                    <span className="border border-stone-300 bg-[#f8f4ed] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600">
                      {it.source_name}
                    </span>
                    {it.relevance_score !== null && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                        {it.relevance_score}% relevant
                      </span>
                    )}
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                      fetched {timeAgo(it.fetched_at)}
                    </span>
                  </div>
                  <a
                    href={it.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${serif.className} block text-2xl font-medium leading-tight text-stone-900 hover:underline md:text-3xl`}
                  >
                    {it.title} ↗
                  </a>
                  {it.summary && (
                    <p className="mt-2 leading-relaxed text-stone-600">
                      {it.summary}
                    </p>
                  )}
                  {it.classification_reasoning && (
                    <details className="mt-3 text-xs text-stone-500">
                      <summary className="cursor-pointer font-bold uppercase tracking-[0.22em] hover:text-[#a9793d]">
                        AI reasoning
                      </summary>
                      <p className="mt-2 italic text-stone-500">
                        {it.classification_reasoning}
                      </p>
                    </details>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {tab === "drafts" && (
                      <>
                        <button
                          type="button"
                          onClick={() => approve(it.id)}
                          disabled={isBusy}
                          className="border px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:scale-105 disabled:opacity-60"
                          style={{ backgroundColor: accent, borderColor: accent }}
                        >
                          {isBusy ? "Approving…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(it.id)}
                          disabled={isBusy}
                          className="border border-stone-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {tab === "published" && (
                      <button
                        type="button"
                        onClick={() => unpublish(it.id)}
                        disabled={isBusy}
                        className="border border-stone-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-stone-400 disabled:opacity-60"
                      >
                        Unpublish
                      </button>
                    )}
                    {tab === "rejected" && (
                      <button
                        type="button"
                        onClick={() => unreject(it.id)}
                        disabled={isBusy}
                        className="border border-stone-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-[#a9793d] hover:text-[#a9793d] disabled:opacity-60"
                      >
                        Move To Drafts
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => hardDelete(it.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-2 border border-stone-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                    >
                      <Trash size={12} /> Delete
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

        {/* SOURCES BLOCK */}
        <div className="mt-10 border border-stone-200 bg-white p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                Active Sources
              </p>
              <h2
                className={`${serif.className} mt-2 text-3xl font-medium text-stone-900`}
              >
                Where these come from.
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowAddSource((v) => !v)}
                className="inline-flex items-center gap-2 border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d]"
              >
                <Plus size={12} /> {showAddSource ? "Cancel" : "Add Manually"}
              </button>
              <button
                type="button"
                onClick={fetchSuggestions}
                disabled={suggesting}
                className="inline-flex items-center gap-2 border border-[#c4934e] bg-[#a9793d] px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
              >
                {suggesting ? (
                  <motion.span
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{
                      duration: 1.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="h-2 w-2 rounded-full bg-white"
                  />
                ) : (
                  <Globe size={12} />
                )}
                {suggesting ? "Asking AI…" : "Suggest Sources"}
              </button>
            </div>
          </div>

          {/* MANUAL ADD FORM */}
          {showAddSource && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-5 grid gap-3 border border-stone-200 bg-[#f8f4ed] p-5 md:grid-cols-2"
            >
              <input
                value={newSource.name}
                onChange={(e) =>
                  setNewSource({ ...newSource, name: e.target.value })
                }
                placeholder="Source name (e.g. APA)"
                className="border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#a9793d]"
              />
              <select
                value={newSource.trust_tier}
                onChange={(e) =>
                  setNewSource({
                    ...newSource,
                    trust_tier: e.target.value as
                      | "high"
                      | "standard"
                      | "caution",
                  })
                }
                className="border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#a9793d]"
              >
                <option value="high">Trust: High</option>
                <option value="standard">Trust: Standard</option>
                <option value="caution">Trust: Caution</option>
              </select>
              <input
                value={newSource.base_url}
                onChange={(e) =>
                  setNewSource({ ...newSource, base_url: e.target.value })
                }
                placeholder="Base URL (https://example.org)"
                className="border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#a9793d] md:col-span-2"
              />
              <input
                value={newSource.feed_url}
                onChange={(e) =>
                  setNewSource({ ...newSource, feed_url: e.target.value })
                }
                placeholder="Feed URL (https://example.org/feed/)"
                className="border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#a9793d] md:col-span-2"
              />
              <input
                value={newSource.description}
                onChange={(e) =>
                  setNewSource({ ...newSource, description: e.target.value })
                }
                placeholder="One-line description (optional)"
                className="border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#a9793d] md:col-span-2"
              />
              <button
                type="button"
                onClick={addSourceManual}
                disabled={addingSource}
                className="border border-[#c4934e] bg-[#a9793d] px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60 md:col-span-2"
              >
                {addingSource ? "Adding…" : "Add Source"}
              </button>
            </motion.div>
          )}

          {/* SUGGESTION FOCUS INPUT */}
          {(suggestions.length > 0 || suggesting) && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <input
                value={suggestFocus}
                onChange={(e) => setSuggestFocus(e.target.value)}
                placeholder="Optional focus (e.g. 'somatic practice', 'fatherhood')"
                className="flex-1 border border-stone-300 bg-[#f8f4ed] px-4 py-2 text-xs outline-none focus:border-[#a9793d]"
              />
              <button
                type="button"
                onClick={fetchSuggestions}
                disabled={suggesting}
                className="border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] disabled:opacity-60"
              >
                Refresh
              </button>
            </div>
          )}

          {/* SUGGESTIONS LIST */}
          {suggestions.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-500">
                AI Suggestions · Validated feeds appear first
              </p>
              {suggestions.map((s, idx) => (
                <div
                  key={`${s.name}-${idx}`}
                  className="bg-[#f8f4ed] p-4"
                  style={{
                    border: "1px solid #e7e5e4",
                    borderLeft: `3px solid ${
                      s.feed_validated ? GOLD_DEEP : "#a05a3c"
                    }`,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-900">{s.name}</span>
                    <span
                      className="text-[9px] font-bold uppercase tracking-[0.22em]"
                      style={{
                        color:
                          s.trust_tier === "high"
                            ? GOLD_DEEP
                            : s.trust_tier === "caution"
                              ? "#a05a3c"
                              : "#586558",
                      }}
                    >
                      {s.trust_tier}
                    </span>
                    <span
                      className="ml-auto text-[10px] font-bold uppercase tracking-[0.22em]"
                      style={{
                        color: s.feed_validated ? GOLD_DEEP : "#a05a3c",
                      }}
                    >
                      {s.feed_validated
                        ? "✓ Feed reachable"
                        : `✗ Feed failed (${s.feed_status})`}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-stone-700">
                    {s.description}
                  </p>
                  {s.reasoning && (
                    <p className="mt-1 text-xs italic text-stone-500">
                      Why: {s.reasoning}
                    </p>
                  )}
                  <p className="mt-2 truncate text-[11px] text-stone-500">
                    {s.feed_url || s.base_url}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => addSuggestion(idx)}
                      disabled={!s.feed_validated}
                      className="border border-[#c4934e] bg-[#a9793d] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        s.feed_validated
                          ? "Add this source"
                          : "Feed URL doesn't resolve — fix manually before adding"
                      }
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSuggestions(
                          suggestions.filter((_, i) => i !== idx),
                        )
                      }
                      className="border border-stone-300 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-stone-400"
                    >
                      Dismiss
                    </button>
                    {!s.feed_validated && s.base_url && (
                      <a
                        href={s.base_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-stone-300 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-[#a9793d]"
                      >
                        Check Site ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EXISTING SOURCES LIST */}
          <div className="mt-6 divide-y divide-stone-200 border-t border-stone-200 pt-2">
            {sources.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-4 py-3"
              >
                <span
                  className="inline-flex items-center gap-2 font-bold text-stone-900"
                  style={{ opacity: s.is_active ? 1 : 0.5 }}
                >
                  {s.name}
                  <span
                    className="text-[9px] font-bold uppercase tracking-[0.22em]"
                    style={{
                      color:
                        s.trust_tier === "high"
                          ? GOLD_DEEP
                          : s.trust_tier === "caution"
                            ? "#a05a3c"
                            : "#586558",
                    }}
                  >
                    {s.trust_tier}
                  </span>
                </span>
                <span className="truncate text-xs text-stone-500">
                  {s.feed_url}
                </span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                  {s.last_fetched_at
                    ? `last run ${timeAgo(s.last_fetched_at)}`
                    : "never run"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleSource(s)}
                  className="border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-[#a9793d]"
                >
                  {s.is_active ? "Pause" : "Activate"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mt-12 border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-10 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Admin · External Content
            </p>
          </div>
          <div className="text-center">
            <p className={`${serif.className} text-base italic text-stone-600`}>
              The harbor is patient.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              Crisis Line
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              <span className="font-bold text-[#a9793d]">988</span> — 24/7. Free.
              Confidential.
            </p>
          </div>
        </div>
      </footer>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </main>
  );
}
