"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";
import {
  Anchor as AnchorIcon,
  Book,
  Edit as EditIcon,
  Eye,
  Globe,
  Logout,
  Mountain,
  User as UserIcon,
  Wave,
} from "@/app/components/icons";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type AdminStats = {
  total_members: number;
  new_members_week: number;
  new_members_month: number;
  total_journal_entries: number;
  total_member_posts: number;
  total_messages: number;
  total_conversations: number;
  draft_posts: number;
  published_posts: number;
  total_steps_completed: number;
  clarity_count: number;
  calm_count: number;
  strength_count: number;
};

type DraftPost = {
  id: string;
  title: string;
  summary: string | null;
  excerpt: string | null;
  pillar: "clarity" | "calm" | "strength";
  is_ai_generated: boolean;
  created_at: string;
};

type GenLog = {
  id: string;
  pillar: string | null;
  status: string;
  message: string | null;
  created_at: string;
};

type ExternalCounts = {
  drafts: number;
  published: number;
  rejected: number;
  total_sources: number;
  active_sources: number;
};

type AppSettings = {
  registration_open: boolean;
  closed_headline: string | null;
  closed_message: string | null;
  waitlist_enabled: boolean;
  updated_at: string | null;
};

type WaitlistEntry = {
  id: string;
  email: string;
  first_name: string | null;
  source: string | null;
  notified_at: string | null;
  created_at: string;
};

function pillarAccent(p: "clarity" | "calm" | "strength") {
  return p === "calm" ? MOSS : GOLD_DEEP;
}

function timeAgo(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export default function AdminDashboard() {
  const [adminName, setAdminName] = useState<string>("Admin");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [logs, setLogs] = useState<GenLog[]>([]);
  const [externalCounts, setExternalCounts] = useState<ExternalCounts | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [authzError, setAuthzError] = useState<string | null>(null);

  // Registration gate
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [waitlistTotal, setWaitlistTotal] = useState(0);
  const [togglingGate, setTogglingGate] = useState(false);
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  async function toggleRegistration() {
    if (!appSettings) return;
    setTogglingGate(true);
    setGateMessage(null);
    const next = !appSettings.registration_open;
    const { error } = await supabase
      .from("app_settings")
      .update({
        registration_open: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setTogglingGate(false);
    if (error) {
      setGateMessage(`Could not update: ${error.message}`);
      return;
    }
    setAppSettings({ ...appSettings, registration_open: next });
    setGateMessage(
      next
        ? "Registration is now OPEN. New members can sign up."
        : "Registration is now CLOSED. New signups will be redirected to the waitlist.",
    );
    // Auto-clear the message after a few seconds.
    setTimeout(() => setGateMessage(null), 5000);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

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
      .select("display_name, role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      setAuthzError(
        "This account does not have admin access. Sign in with an admin account.",
      );
      setLoading(false);
      return;
    }

    setAdminName(profile?.display_name || "Admin");

    const [
      statsRes,
      draftsRes,
      logsRes,
      externalRes,
      settingsRes,
      waitlistRes,
      waitlistCountRes,
    ] = await Promise.all([
      supabase.rpc("get_admin_stats"),
      supabase
        .from("blog_posts")
        .select(
          "id, title, summary, excerpt, pillar, is_ai_generated, created_at",
        )
        .eq("is_published", false)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("blog_generation_logs")
        .select("id, pillar, status, message, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.rpc("get_external_content_counts"),
      supabase
        .from("app_settings")
        .select(
          "registration_open, closed_headline, closed_message, waitlist_enabled, updated_at",
        )
        .eq("id", 1)
        .single(),
      supabase
        .from("waitlist_signups")
        .select("id, email, first_name, source, notified_at, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("waitlist_signups")
        .select("id", { count: "exact", head: true }),
    ]);

    const row = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
    if (row) setStats(row as AdminStats);
    setDrafts((draftsRes.data ?? []) as DraftPost[]);
    setLogs((logsRes.data ?? []) as GenLog[]);

    const extRow = Array.isArray(externalRes.data)
      ? externalRes.data[0]
      : externalRes.data;
    if (extRow) setExternalCounts(extRow as ExternalCounts);

    if (settingsRes.data) setAppSettings(settingsRes.data as AppSettings);
    setWaitlist((waitlistRes.data ?? []) as WaitlistEntry[]);
    setWaitlistTotal(waitlistCountRes.count ?? 0);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const pillarTotal = stats
    ? stats.clarity_count + stats.calm_count + stats.strength_count
    : 0;

  const pillarBreakdown = useMemo(() => {
    if (!stats || pillarTotal === 0) {
      return [
        { label: "Clarity", count: 0, percent: 0, accent: GOLD_DEEP },
        { label: "Calm", count: 0, percent: 0, accent: MOSS },
        { label: "Strength", count: 0, percent: 0, accent: GOLD_DEEP },
      ];
    }
    return [
      {
        label: "Clarity",
        count: stats.clarity_count,
        percent: Math.round((stats.clarity_count / pillarTotal) * 100),
        accent: GOLD_DEEP,
      },
      {
        label: "Calm",
        count: stats.calm_count,
        percent: Math.round((stats.calm_count / pillarTotal) * 100),
        accent: MOSS,
      },
      {
        label: "Strength",
        count: stats.strength_count,
        percent: Math.round((stats.strength_count / pillarTotal) * 100),
        accent: GOLD_DEEP,
      },
    ];
  }, [stats, pillarTotal]);

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
            Loading admin console…
          </p>
        </div>
      </main>
    );
  }

  if (authzError) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7] px-6`}
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
          <div className="mt-8 flex justify-center gap-3">
            <a
              href="/admin/login"
              className="border border-[#c4934e] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white hover:bg-[#8d6432]"
            >
              Admin Login
            </a>
            <a
              href="/dashboard"
              className="border border-stone-300 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 hover:border-[#a9793d]"
            >
              Member Dashboard
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#f3efe7] text-stone-900`}
    >
      {/* AMBIENT */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.035]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="admindash-contour"
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
              d="M0 130 Q 80 100 160 130 T 320 130"
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
        <rect width="100%" height="100%" fill="url(#admindash-contour)" />
      </svg>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 88% 8%, rgba(196,147,78,0.18) 0%, rgba(196,147,78,0.06) 40%, transparent 75%)",
        }}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* TOP NAV — strong admin marker */}
        <div
          className="mb-6 border-l-[3px] bg-white/40 px-5 py-4 backdrop-blur-sm"
          style={{ borderLeftColor: GOLD_DEEP }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a
              href="/"
              className="group flex flex-col leading-none no-underline"
            >
              <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
                Stone Harbor
              </span>
              <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.22em] text-[#a9793d]/70">
                Admin Console · {adminName}
              </span>
            </a>
            <div className="flex flex-wrap gap-2">
              <a
                href="/admin/blog"
                className="group relative inline-flex items-center gap-2 overflow-hidden border border-stone-300 bg-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
              >
                <Book size={12} />
                Blog Review
                {stats && stats.draft_posts > 0 && (
                  <span
                    className="ml-1 border bg-[#f3efe7] px-1.5 py-0.5 text-[10px] font-black"
                    style={{
                      borderColor: GOLD_DEEP,
                      color: GOLD_DEEP,
                    }}
                  >
                    {stats.draft_posts}
                  </span>
                )}
              </a>
              <a
                href="/admin/external"
                className="group relative inline-flex items-center gap-2 overflow-hidden border border-stone-300 bg-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
              >
                <Globe size={12} />
                External Content
                {externalCounts && externalCounts.drafts > 0 && (
                  <span
                    className="ml-1 border bg-[#f3efe7] px-1.5 py-0.5 text-[10px] font-black"
                    style={{
                      borderColor: GOLD_DEEP,
                      color: GOLD_DEEP,
                    }}
                  >
                    {externalCounts.drafts}
                  </span>
                )}
              </a>
              <a
                href="/dashboard"
                className="border border-stone-300 bg-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
              >
                Member View
              </a>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 border border-stone-300 bg-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] hover:bg-white"
              >
                <Logout size={12} />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
            Overview
          </p>
          <h1
            className={`${serif.className} mt-3 text-5xl font-medium leading-tight text-stone-900 md:text-6xl`}
          >
            The harbor at a glance.
          </h1>
        </motion.div>

        {/* REGISTRATION GATE — kill switch + waitlist viewer */}
        <RegistrationGatePanel
          settings={appSettings}
          waitlist={waitlist}
          waitlistTotal={waitlistTotal}
          onToggle={toggleRegistration}
          toggling={togglingGate}
          message={gateMessage}
        />

        {/* KEY METRICS GRID */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        >
          <StatCard
            label="Members"
            value={stats?.total_members ?? 0}
            sub={`+${stats?.new_members_week ?? 0} this week`}
            Icon={UserIcon}
          />
          <StatCard
            label="Journal Entries"
            value={stats?.total_journal_entries ?? 0}
            sub="All-time"
            Icon={EditIcon}
          />
          <StatCard
            label="Member Posts"
            value={stats?.total_member_posts ?? 0}
            sub={`${stats?.total_conversations ?? 0} conversations`}
            Icon={AnchorIcon}
          />
          <StatCard
            label="Published Posts"
            value={stats?.published_posts ?? 0}
            sub={`${stats?.draft_posts ?? 0} awaiting review`}
            Icon={Book}
            highlight={!!(stats && stats.draft_posts > 0)}
          />
          <StatCard
            label="External Links"
            value={externalCounts?.published ?? 0}
            sub={`${externalCounts?.drafts ?? 0} drafts · ${externalCounts?.active_sources ?? 0}/${externalCounts?.total_sources ?? 0} sources`}
            Icon={Globe}
            highlight={!!(externalCounts && externalCounts.drafts > 0)}
          />
        </motion.div>

        {/* SECOND ROW: PILLAR DISTRIBUTION + GROWTH */}
        <div className="mb-8 grid gap-3 lg:grid-cols-3">
          {/* Pillar distribution — 2 cols */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="border border-stone-200 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)] lg:col-span-2"
          >
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Pillar Distribution
            </p>
            <h2
              className={`${serif.className} mt-2 text-3xl font-medium text-stone-900`}
            >
              Where members stand.
            </h2>
            <div className="mt-6 space-y-4">
              {pillarBreakdown.map((p) => {
                const Icon =
                  p.label === "Clarity"
                    ? Eye
                    : p.label === "Calm"
                      ? Wave
                      : Mountain;
                return (
                  <div key={p.label}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span
                        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em]"
                        style={{ color: p.accent }}
                      >
                        <Icon
                          size={12}
                          strokeWidth={1.5}
                          style={{ color: p.accent }}
                        />
                        {p.label}
                      </span>
                      <span className="text-xs font-bold text-stone-500">
                        {p.count} · {p.percent}%
                      </span>
                    </div>
                    <div className="h-[6px] w-full bg-stone-200">
                      <div
                        className="h-[6px] transition-all duration-700"
                        style={{
                          width: `${p.percent}%`,
                          backgroundColor: p.accent,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Growth & engagement */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="border border-stone-200 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)]"
          >
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Growth
            </p>
            <h2
              className={`${serif.className} mt-2 text-3xl font-medium text-stone-900`}
            >
              Last 30 days.
            </h2>
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                  New Members
                </p>
                <p
                  className={`${serif.className} mt-1 text-3xl italic text-[#a9793d]`}
                >
                  {stats?.new_members_month ?? 0}
                </p>
              </div>
              <div className="border-t border-stone-200 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                  Total Messages
                </p>
                <p
                  className={`${serif.className} mt-1 text-3xl italic text-stone-700`}
                >
                  {stats?.total_messages ?? 0}
                </p>
              </div>
              <div className="border-t border-stone-200 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                  Roadmap Steps Completed
                </p>
                <p
                  className={`${serif.className} mt-1 text-3xl italic text-stone-700`}
                >
                  {stats?.total_steps_completed ?? 0}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* THIRD ROW: DRAFTS + GENERATION LOG */}
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Drafts pending review */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="border border-stone-200 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                  Drafts Awaiting Review
                </p>
                <h2
                  className={`${serif.className} mt-1 text-2xl font-medium text-stone-900`}
                >
                  {drafts.length === 0
                    ? "Nothing pending."
                    : `${drafts.length} ${drafts.length === 1 ? "draft" : "drafts"} ready.`}
                </h2>
              </div>
              <a
                href="/admin/blog"
                className="text-xs font-bold uppercase tracking-[0.22em] text-[#a9793d] transition hover:text-[#8d6432]"
              >
                Open Review →
              </a>
            </div>
            {drafts.length === 0 ? (
              <p className="text-sm text-stone-500">
                Generate fresh drafts from the Blog Review page.
              </p>
            ) : (
              <div className="space-y-3">
                {drafts.map((d) => {
                  const accent = pillarAccent(d.pillar);
                  return (
                    <a
                      key={d.id}
                      href="/admin/blog"
                      className="block border border-stone-200 bg-[#f8f4ed] p-4 transition hover:border-[#a9793d]/40"
                      style={{ borderLeft: `3px solid ${accent}` }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="border bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em]"
                          style={{
                            borderColor: accent,
                            color: accent,
                          }}
                        >
                          {d.pillar}
                        </span>
                        {d.is_ai_generated && (
                          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                            AI
                          </span>
                        )}
                        <span className="ml-auto text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                          {timeAgo(d.created_at)}
                        </span>
                      </div>
                      <p
                        className={`${serif.className} text-xl font-medium leading-tight text-stone-900`}
                      >
                        {d.title}
                      </p>
                      {(d.summary || d.excerpt) && (
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600">
                          {d.summary || d.excerpt}
                        </p>
                      )}
                    </a>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Generation log */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="border border-stone-200 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)]"
          >
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Generation Log
            </p>
            <h2
              className={`${serif.className} mt-1 text-2xl font-medium text-stone-900`}
            >
              Recent runs.
            </h2>
            {logs.length === 0 ? (
              <p className="mt-4 text-sm text-stone-500">
                No generation attempts yet. Drafts will appear in the log once
                you run the function.
              </p>
            ) : (
              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-2">
                {logs.map((log) => {
                  const ok = log.status === "success";
                  return (
                    <div
                      key={log.id}
                      className="border-l-[3px] bg-[#f8f4ed] px-4 py-2.5 text-xs"
                      style={{
                        borderLeftColor: ok ? GOLD_DEEP : "#a05a3c",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase tracking-[0.22em] text-stone-700">
                          {log.pillar ?? "—"} · {log.status}
                        </span>
                        <span className="text-[10px] font-bold text-stone-400">
                          {timeAgo(log.created_at)}
                        </span>
                      </div>
                      {log.message && (
                        <p
                          className="mt-1 leading-relaxed text-stone-500"
                          title={log.message}
                        >
                          {log.message.length > 120
                            ? log.message.slice(0, 120) + "…"
                            : log.message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
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
              Crisis Line
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              <span className="font-bold text-[#a9793d]">988</span> — 24/7.
              Free. Confidential.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
  Icon,
  highlight = false,
}: {
  label: string;
  value: number;
  sub: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div
      className="border bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
      style={{
        borderColor: highlight ? GOLD : "#e7e5e4",
        borderLeftWidth: highlight ? "3px" : "1px",
        borderLeftColor: highlight ? GOLD_DEEP : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-500">
          {label}
        </p>
        <Icon size={14} className="text-[#a9793d]" />
      </div>
      <p
        className={`${serif.className} mt-3 text-4xl font-medium italic text-stone-900`}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-xs text-stone-500">{sub}</p>
    </div>
  );
}

/* ──────────────────────────────────────────────
   REGISTRATION GATE PANEL
   - Big visible toggle for opening / closing signups.
   - Shows recent waitlist captures.
   - Color shifts based on state so the admin can never
     miss whether the door is open or closed at a glance.
   ────────────────────────────────────────────── */

function RegistrationGatePanel({
  settings,
  waitlist,
  waitlistTotal,
  onToggle,
  toggling,
  message,
}: {
  settings: AppSettings | null;
  waitlist: WaitlistEntry[];
  waitlistTotal: number;
  onToggle: () => void;
  toggling: boolean;
  message: string | null;
}) {
  const open = settings?.registration_open !== false;
  const stateColor = open ? MOSS : "#b14a3a";
  const stateLabel = open ? "OPEN" : "CLOSED";
  const stateBlurb = open
    ? "New members can sign up. The harbor is admitting."
    : "Signups are paused. Visitors see the waitlist instead.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.05 }}
      className="mb-8 grid gap-3 lg:grid-cols-[1.4fr_1fr]"
    >
      {/* MAIN GATE CARD */}
      <div
        className="border-l-[3px] bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
        style={{ borderLeftColor: stateColor }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-500">
              Registration Gate
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: stateColor }}
              />
              <h3
                className={`${serif.className} text-3xl font-medium italic`}
                style={{ color: stateColor }}
              >
                {stateLabel}
              </h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              {stateBlurb}
            </p>
            {settings?.updated_at && (
              <p className="mt-2 text-[11px] text-stone-400">
                Last changed{" "}
                {new Date(settings.updated_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
            <button
              type="button"
              disabled={toggling || !settings}
              onClick={onToggle}
              className="inline-flex items-center justify-center gap-2 border px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] transition disabled:opacity-50"
              style={{
                backgroundColor: open ? "#fff" : "#a9793d",
                color: open ? "#7a3327" : "#fff",
                borderColor: open ? "#b14a3a" : "#a9793d",
              }}
            >
              {toggling
                ? "Saving…"
                : open
                  ? "Close The Harbor"
                  : "Open The Harbor"}
            </button>
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400 md:text-right">
              Effective immediately
            </p>
          </div>
        </div>

        {message && (
          <div
            className="mt-5 border-l-2 bg-stone-50 px-4 py-3 text-xs font-semibold text-stone-700"
            style={{ borderLeftColor: stateColor }}
          >
            {message}
          </div>
        )}
      </div>

      {/* WAITLIST PANEL */}
      <div className="border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-500">
            Waitlist
          </p>
          <p
            className={`${serif.className} text-3xl font-medium italic text-stone-900`}
          >
            {waitlistTotal.toLocaleString()}
          </p>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          {waitlist.length > 0
            ? `Latest ${waitlist.length} of ${waitlistTotal} captured`
            : "No captures yet"}
        </p>

        <div className="mt-4 max-h-[260px] overflow-y-auto">
          {waitlist.length === 0 ? (
            <p className="py-6 text-center text-xs text-stone-400">
              Visitors who hit /register while closed will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {waitlist.map((w) => (
                <li
                  key={w.id}
                  className="flex items-baseline justify-between py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-800">
                      {w.first_name ? `${w.first_name} · ` : ""}
                      <span className="font-normal text-stone-600">
                        {w.email}
                      </span>
                    </p>
                  </div>
                  <p className="ml-3 shrink-0 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                    {timeAgo(w.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </motion.div>
  );
}
