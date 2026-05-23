"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { PageAmbience } from "@/app/components/pageAmbience";
import { useTheme } from "@/app/components/themeProvider";
import { serif, sans } from "@/lib/fonts";

/**
 * Stone Harbor admin — Test results dashboard.
 *
 * Reads from public.test_runs (populated by scripts/ingest-test-results.mjs
 * after each `npm test`, `npm run test:db`, or `npm run test:e2e` run).
 *
 * Surfaces:
 *   - Latest run per suite (unit/db/e2e) with pass/fail summary
 *   - Last 20 runs across all suites, sorted by recency
 *   - Drill-down: click a run to see per-test details
 *
 * RLS already restricts SELECT on test_runs to admins, so even if a
 * non-admin reaches this URL they get an empty list rather than
 * leaked test data.
 */

type TestDetail = {
  name: string;
  file?: string;
  status: "passed" | "failed" | "skipped";
  duration_ms?: number | null;
  error?: string | null;
};

type TestRun = {
  id: string;
  suite: "unit" | "db" | "e2e";
  status: "passed" | "failed" | "partial";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number | null;
  details: { tests?: TestDetail[] } | null;
  commit_sha: string | null;
  triggered_by: "local" | "ci";
  created_at: string;
};

const SUITE_LABELS: Record<TestRun["suite"], string> = {
  unit: "Unit",
  db: "Database",
  e2e: "End-to-end",
};

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function AdminTestsPage() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [authzError, setAuthzError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
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
      const { data } = await supabase
        .from("test_runs")
        .select(
          "id, suite, status, total, passed, failed, skipped, duration_ms, details, commit_sha, triggered_by, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      setRuns((data ?? []) as TestRun[]);
      setLoading(false);
    }
    load();
  }, []);

  // Latest run per suite for the summary strip at the top
  const latestPerSuite = useMemo(() => {
    const map = new Map<TestRun["suite"], TestRun>();
    for (const r of runs) {
      if (!map.has(r.suite)) map.set(r.suite, r);
    }
    return map;
  }, [runs]);

  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]`}
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--sh-text-tertiary)]">
          Loading test runs…
        </p>
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
            className={`${serif.className} mt-3 text-3xl text-[var(--sh-text-primary)]`}
          >
            {authzError}
          </h1>
          <Link
            href="/admin/login"
            className="mt-6 inline-block border border-[#a9793d] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white hover:bg-[#8d6432]"
          >
            Admin Login
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
      <PageAmbience />
      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* HEADER */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#a9793d] transition hover:text-[#8d6432]"
            >
              ← Admin
            </Link>
            <h1
              className={`${serif.className} mt-2 text-4xl font-medium text-[var(--sh-text-primary)] md:text-5xl`}
            >
              Test results.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
              The latest run of each suite plus the last fifty runs across all
              suites. Ingested from <code className="text-[var(--sh-accent-gold)]">npm run test:report</code>.
            </p>
          </div>
        </div>

        {/* LATEST-PER-SUITE STRIP */}
        <div className="mb-10 grid gap-4 md:grid-cols-3">
          {(["unit", "db", "e2e"] as const).map((suite) => {
            const run = latestPerSuite.get(suite);
            return (
              <SuiteCard
                key={suite}
                suite={suite}
                run={run}
                isDusk={isDusk}
              />
            );
          })}
        </div>

        {/* RUN HISTORY */}
        <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-[var(--sh-accent-gold)]">
          Recent runs
        </h2>

        {runs.length === 0 ? (
          <EmptyState isDusk={isDusk} />
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                isDusk={isDusk}
                expanded={expanded === run.id}
                onToggle={() =>
                  setExpanded((prev) => (prev === run.id ? null : run.id))
                }
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SuiteCard({
  suite,
  run,
  isDusk,
}: {
  suite: TestRun["suite"];
  run: TestRun | undefined;
  isDusk: boolean;
}) {
  const label = SUITE_LABELS[suite];
  if (!run) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`border p-5 ${
          isDusk
            ? "border-white/10 bg-black/30"
            : "border-[var(--sh-border-subtle)] bg-white/70"
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
          {label}
        </p>
        <p className="mt-2 text-sm italic text-[var(--sh-text-muted)]">
          No runs yet.
        </p>
      </motion.div>
    );
  }
  const accent = statusColor(run.status);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative border-l-[3px] p-5 ${
        isDusk
          ? "border-white/10 bg-black/30"
          : "border-[var(--sh-border-subtle)] bg-white/70"
      }`}
      style={{ borderLeftColor: accent }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
        {label}
      </p>
      <p
        className="mt-2 text-3xl font-medium"
        style={{ color: accent }}
      >
        {run.passed}
        <span className="text-base text-[var(--sh-text-tertiary)]">
          /{run.total}
        </span>
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
        {run.failed > 0 ? `${run.failed} failing` : "all passing"} ·{" "}
        {formatDuration(run.duration_ms)}
      </p>
      <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
        {formatRelative(run.created_at)} · {run.triggered_by}
      </p>
    </motion.div>
  );
}

function RunRow({
  run,
  isDusk,
  expanded,
  onToggle,
}: {
  run: TestRun;
  isDusk: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const accent = statusColor(run.status);
  const failedTests =
    run.details?.tests?.filter((t) => t.status === "failed") ?? [];

  return (
    <div
      className={`border ${
        isDusk
          ? "border-white/10 bg-black/30"
          : "border-[var(--sh-border-subtle)] bg-white/70"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-[var(--sh-accent-gold)]/[0.04]"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
          {SUITE_LABELS[run.suite]}
        </span>
        <span className="w-32 shrink-0 text-sm" style={{ color: accent }}>
          {run.passed}/{run.total} passed
          {run.failed > 0 && (
            <span className="ml-1 text-[var(--sh-text-tertiary)]">
              · {run.failed} failed
            </span>
          )}
        </span>
        <span className="hidden flex-1 text-xs text-[var(--sh-text-tertiary)] sm:inline">
          {formatDuration(run.duration_ms)}
          {run.commit_sha && ` · ${run.commit_sha.slice(0, 7)}`}
        </span>
        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
          {formatRelative(run.created_at)}
        </span>
        <span
          aria-hidden="true"
          className="ml-2 text-xs text-[var(--sh-text-tertiary)] transition"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div
          className={`border-t px-5 py-4 ${
            isDusk ? "border-white/10" : "border-[var(--sh-border-subtle)]"
          }`}
        >
          {failedTests.length === 0 && run.passed > 0 && (
            <p className="text-xs italic text-[var(--sh-text-muted)]">
              All {run.passed} tests passed. Nothing to dig into.
            </p>
          )}
          {failedTests.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]">
                Failures
              </p>
              {failedTests.map((t, i) => (
                <div
                  key={i}
                  className={`border-l-[3px] border-red-500/60 px-4 py-3 ${
                    isDusk ? "bg-red-950/20" : "bg-red-50/60"
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--sh-text-primary)]">
                    {t.name}
                  </p>
                  {t.file && (
                    <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                      {t.file}
                    </p>
                  )}
                  {t.error && (
                    <pre
                      className={`mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed ${
                        isDusk ? "text-stone-300" : "text-stone-700"
                      }`}
                    >
                      {t.error}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ isDusk }: { isDusk: boolean }) {
  return (
    <div
      className={`border p-10 text-center ${
        isDusk
          ? "border-white/10 bg-black/30"
          : "border-[var(--sh-border-subtle)] bg-white/70"
      }`}
    >
      <p
        className={`${serif.className} text-2xl italic text-[var(--sh-text-secondary)]`}
      >
        No test runs ingested yet.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-tertiary)]">
        Run <code className="text-[var(--sh-accent-gold)]">npm test</code> then{" "}
        <code className="text-[var(--sh-accent-gold)]">npm run test:report</code> to
        write results here. Or run{" "}
        <code className="text-[var(--sh-accent-gold)]">npm run test:all:report</code> to
        execute unit + DB + e2e in sequence and ingest in one shot.
      </p>
    </div>
  );
}

function statusColor(status: TestRun["status"]): string {
  switch (status) {
    case "passed":
      return "#5fa86b";
    case "failed":
      return "#b14a3a";
    case "partial":
      return "#c4934e";
  }
}
