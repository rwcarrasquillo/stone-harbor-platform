"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { PageAmbience } from "@/app/components/pageAmbience";
import { serif, sans } from "@/lib/fonts";
import {
  Book,
  Edit as EditIcon,
  Plus,
  Trash,
} from "@/app/components/icons";
import { Toast, type ToastState } from "@/app/components/toast";

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
  category: string | null;
  is_published: boolean;
  is_ai_generated: boolean;
  model: string | null;
  published_at: string | null;
  created_at: string;
};

const PILLARS: { value: Pillar; label: string; accent: string }[] = [
  { value: "clarity", label: "Clarity", accent: GOLD_DEEP },
  { value: "calm", label: "Calm", accent: MOSS },
  { value: "strength", label: "Strength", accent: GOLD_DEEP },
];

function pillarAccent(p: Pillar) {
  return p === "calm" ? MOSS : GOLD_DEEP;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminBlogReview() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState<"all" | Pillar>("all");
  const [tab, setTab] = useState<"drafts" | "published">("drafts");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const fail = (msg: string) => setToast({ tone: "error", text: msg });
  const [draftFields, setDraftFields] = useState<{
    title: string;
    summary: string;
    content: string;
    pillar: Pillar;
  } | null>(null);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [authzError, setAuthzError] = useState<string | null>(null);

  async function loadPosts() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    // Quick admin check — clearer error than RLS rejection.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      setAuthzError("This page is for admin accounts only.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("blog_posts")
      .select(
        "id, title, excerpt, summary, content, pillar, category, is_published, is_ai_generated, model, published_at, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Could not load posts:", error.message);
    }
    setPosts((data ?? []) as BlogPost[]);
    setLoading(false);
  }

  async function generateDrafts(pillar?: Pillar) {
    setGenerating(true);
    setGenerateMenuOpen(false);
    const { error } = await supabase.functions.invoke("generate-blog-posts", {
      body: pillar ? { pillar } : {},
    });
    if (error) {
      fail(`Generation failed: ${error.message}`);
    }
    await loadPosts();
    setGenerating(false);
  }

  async function publishPost(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from("blog_posts")
      .update({
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) fail(error.message);
    else await loadPosts();
    setBusyId(null);
  }

  async function unpublishPost(id: string) {
    if (!window.confirm("Move this post back to drafts?")) return;
    setBusyId(id);
    const { error } = await supabase
      .from("blog_posts")
      .update({ is_published: false, published_at: null })
      .eq("id", id);
    if (error) fail(error.message);
    else await loadPosts();
    setBusyId(null);
  }

  async function deletePost(id: string) {
    if (!window.confirm("Permanently delete this post?")) return;
    setBusyId(id);
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) fail(error.message);
    else await loadPosts();
    setBusyId(null);
  }

  function beginEdit(post: BlogPost) {
    setEditingId(post.id);
    setDraftFields({
      title: post.title,
      summary: post.summary ?? post.excerpt ?? "",
      content: post.content,
      pillar: post.pillar,
    });
  }

  async function saveEdit() {
    if (!editingId || !draftFields) return;
    setBusyId(editingId);
    const { error } = await supabase
      .from("blog_posts")
      .update({
        title: draftFields.title,
        summary: draftFields.summary,
        excerpt: draftFields.summary,
        content: draftFields.content,
        pillar: draftFields.pillar,
      })
      .eq("id", editingId);
    if (error) fail(error.message);
    else {
      setEditingId(null);
      setDraftFields(null);
      await loadPosts();
    }
    setBusyId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftFields(null);
  }

  useEffect(() => {
    loadPosts();
  }, []);

  const visiblePosts = useMemo(() => {
    return posts.filter((p) => {
      const matchesTab = tab === "drafts" ? !p.is_published : p.is_published;
      const matchesPillar = filter === "all" || p.pillar === filter;
      return matchesTab && matchesPillar;
    });
  }, [posts, tab, filter]);

  const draftCount = useMemo(
    () => posts.filter((p) => !p.is_published).length,
    [posts],
  );
  const publishedCount = useMemo(
    () => posts.filter((p) => p.is_published).length,
    [posts],
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
            Loading drafts…
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
            href="/dashboard"
            className="mt-8 inline-block border border-[#c4934e] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[#a9793d] hover:bg-[#c4934e] hover:text-white"
          >
            Back To Dashboard
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
            href="/dashboard"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Dashboard
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Admin · Blog Review
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/external"
              className="border border-stone-300 bg-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
            >
              External Content →
            </Link>
            <Link
              href="/"
              className="text-xs font-bold uppercase tracking-[0.28em] text-stone-500 transition hover:text-[#a9793d]"
            >
              Stone Harbor
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
              <Book size={16} className="text-[#a9793d]" />
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                Admin · Blog Review
              </p>
            </div>
            <h1
              className={`${serif.className} mt-3 text-5xl font-medium leading-tight text-stone-900 md:text-6xl`}
            >
              Posts.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
              Drafts come in from the daily generation run. Read each one,
              edit if it needs help, then publish.
            </p>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setGenerateMenuOpen((o) => !o)}
              disabled={generating}
              className="group relative inline-flex items-center gap-3 overflow-hidden border border-[#c4934e] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
            >
              {generating ? (
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
              <span>
                {generating ? "Generating…" : "Generate Drafts"}
              </span>
            </button>
            {generateMenuOpen && !generating && (
              <div className="absolute right-0 top-full z-30 mt-2 w-56 border border-stone-300 bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => generateDrafts()}
                  className="block w-full border-b border-stone-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:bg-[#f8f4ed]"
                >
                  All three pillars
                </button>
                {PILLARS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => generateDrafts(p.value)}
                    className="block w-full border-b border-stone-200 px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.22em] transition hover:bg-[#f8f4ed] last:border-b-0"
                    style={{ color: p.accent }}
                  >
                    {p.label} only
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* TABS + FILTER */}
        <div className="mb-6 flex flex-col gap-4 border-y border-stone-200 bg-white/40 px-5 py-4 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("drafts")}
              className="border px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] transition"
              style={{
                borderColor: tab === "drafts" ? GOLD_DEEP : "#e7e5e4",
                color: tab === "drafts" ? GOLD_DEEP : "#57534e",
                backgroundColor: tab === "drafts" ? "white" : "#f8f4ed",
                boxShadow:
                  tab === "drafts" ? `inset 0 0 0 1px ${GOLD_DEEP}` : undefined,
              }}
            >
              Drafts ({draftCount})
            </button>
            <button
              type="button"
              onClick={() => setTab("published")}
              className="border px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] transition"
              style={{
                borderColor: tab === "published" ? GOLD_DEEP : "#e7e5e4",
                color: tab === "published" ? GOLD_DEEP : "#57534e",
                backgroundColor: tab === "published" ? "white" : "#f8f4ed",
                boxShadow:
                  tab === "published"
                    ? `inset 0 0 0 1px ${GOLD_DEEP}`
                    : undefined,
              }}
            >
              Published ({publishedCount})
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition"
              style={{
                borderColor: filter === "all" ? GOLD_DEEP : "#e7e5e4",
                color: filter === "all" ? GOLD_DEEP : "#57534e",
                backgroundColor: filter === "all" ? "white" : "#f8f4ed",
              }}
            >
              All
            </button>
            {PILLARS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setFilter(p.value)}
                className="border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition"
                style={{
                  borderColor: filter === p.value ? p.accent : "#e7e5e4",
                  color: filter === p.value ? p.accent : "#57534e",
                  backgroundColor:
                    filter === p.value ? "white" : "#f8f4ed",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* LIST */}
        {visiblePosts.length === 0 ? (
          <div className="border border-stone-200 bg-white p-8">
            <p
              className={`${serif.className} text-2xl italic text-stone-700`}
            >
              {tab === "drafts"
                ? "No drafts to review."
                : "No published posts yet."}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              {tab === "drafts"
                ? "Hit Generate Drafts above to pull fresh content."
                : "Approve a draft to publish it."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visiblePosts.map((post) => {
              const isEditing = editingId === post.id;
              const accent = pillarAccent(post.pillar);
              const isBusy = busyId === post.id;
              return (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4 }}
                  className="bg-white p-6 transition"
                  style={{
                    border: "1px solid #e7e5e4",
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span
                      className="border bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                      style={{ borderColor: accent, color: accent }}
                    >
                      {post.pillar}
                    </span>
                    {post.is_ai_generated && (
                      <span className="border border-stone-300 bg-[#f8f4ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                        AI · {post.model}
                      </span>
                    )}
                    {post.is_published ? (
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.22em]"
                        style={{ color: accent }}
                      >
                        ✓ Published {post.published_at && formatDateTime(post.published_at)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                        Draft · created {formatDateTime(post.created_at)}
                      </span>
                    )}
                  </div>

                  {isEditing && draftFields ? (
                    <div className="space-y-4">
                      <input
                        value={draftFields.title}
                        onChange={(e) =>
                          setDraftFields({ ...draftFields, title: e.target.value })
                        }
                        className="w-full border border-stone-300 bg-[#f8f4ed] px-4 py-3 text-xl outline-none focus:border-[#a9793d]"
                        placeholder="Title"
                      />
                      <input
                        value={draftFields.summary}
                        onChange={(e) =>
                          setDraftFields({
                            ...draftFields,
                            summary: e.target.value,
                          })
                        }
                        className="w-full border border-stone-300 bg-[#f8f4ed] px-4 py-3 text-sm outline-none focus:border-[#a9793d]"
                        placeholder="One-line summary"
                      />
                      <select
                        value={draftFields.pillar}
                        onChange={(e) =>
                          setDraftFields({
                            ...draftFields,
                            pillar: e.target.value as Pillar,
                          })
                        }
                        className="w-full border border-stone-300 bg-[#f8f4ed] px-4 py-3 text-sm outline-none focus:border-[#a9793d]"
                      >
                        {PILLARS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={draftFields.content}
                        onChange={(e) =>
                          setDraftFields({
                            ...draftFields,
                            content: e.target.value,
                          })
                        }
                        rows={18}
                        className="w-full resize-y border border-stone-300 bg-[#f8f4ed] px-4 py-3 font-mono text-sm outline-none focus:border-[#a9793d]"
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={isBusy}
                          className="border border-[#c4934e] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
                        >
                          {isBusy ? "Saving…" : "Save Changes"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="border border-stone-300 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-stone-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2
                        className={`${serif.className} text-3xl font-medium leading-tight text-stone-900 md:text-4xl`}
                      >
                        {post.title}
                      </h2>
                      {(post.summary || post.excerpt) && (
                        <p className="mt-2 text-sm italic leading-relaxed text-stone-600">
                          {post.summary || post.excerpt}
                        </p>
                      )}
                      <details className="mt-4 border-t border-stone-200 pt-3">
                        <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.22em] text-stone-500 hover:text-[#a9793d]">
                          Read full body
                        </summary>
                        <p className="mt-4 whitespace-pre-wrap leading-relaxed text-stone-700">
                          {post.content}
                        </p>
                      </details>

                      <div className="mt-5 flex flex-wrap gap-3">
                        {!post.is_published ? (
                          <button
                            type="button"
                            onClick={() => publishPost(post.id)}
                            disabled={isBusy}
                            className="border px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:scale-105 disabled:opacity-60"
                            style={{
                              backgroundColor: accent,
                              borderColor: accent,
                            }}
                          >
                            {isBusy ? "Publishing…" : "Publish"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => unpublishPost(post.id)}
                            disabled={isBusy}
                            className="border border-stone-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-stone-400 disabled:opacity-60"
                          >
                            Unpublish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => beginEdit(post)}
                          className="inline-flex items-center gap-2 border border-stone-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:border-[#a9793d] hover:text-[#a9793d]"
                        >
                          <EditIcon size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePost(post.id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 border border-stone-300 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                        >
                          <Trash size={12} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mt-12 border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-10 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Admin Console
            </p>
          </div>
          <div className="text-center">
            <p className={`${serif.className} text-base italic text-stone-600`}>
              The harbor is patient.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              If Anyone Is In Crisis
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
