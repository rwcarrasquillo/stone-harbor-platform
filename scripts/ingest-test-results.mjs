#!/usr/bin/env node
/**
 * Stone Harbor — ingest test results into the test_runs table.
 *
 * Reads JSON reports produced by Vitest, the Playwright JSON
 * reporter, and the DB test runner, then upserts a row per suite
 * into public.test_runs. The /admin/tests page reads from there.
 *
 * Usage:
 *   node scripts/ingest-test-results.mjs
 *
 * The script looks for these files (any may be absent):
 *   .test-results/unit.json   — from `npm test -- --reporter=json --outputFile=...`
 *   .test-results/db.json     — from `npm run test:db`
 *   .test-results/e2e.json    — from `npm run test:e2e`
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (admin key — never expose to clients)
 *
 * Optional:
 *   STONE_HARBOR_COMMIT_SHA    (CI usually provides this)
 *   STONE_HARBOR_TRIGGERED_BY  ('local' | 'ci', defaults 'local')
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const RESULTS_DIR = ".test-results";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[ingest] Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const triggeredBy =
  process.env.STONE_HARBOR_TRIGGERED_BY === "ci" ? "ci" : "local";
const commitSha = (() => {
  if (process.env.STONE_HARBOR_COMMIT_SHA) return process.env.STONE_HARBOR_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
})();

/**
 * Insert one row into test_runs via the Supabase REST API. Using
 * fetch directly keeps the script dependency-free (no @supabase/js
 * import needed here).
 */
async function insertRun(run) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/test_runs`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(run),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ingest failed (${res.status}): ${body}`);
  }
}

/**
 * Parse a Vitest JSON report into a normalized run summary.
 * Vitest's JSON format groups tests under `testResults[].assertionResults[]`.
 */
function parseVitestReport(report) {
  const tests = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const file of report.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      const status = a.status === "passed" ? "passed"
        : a.status === "failed" ? "failed"
        : "skipped";
      if (status === "passed") passed++;
      else if (status === "failed") failed++;
      else skipped++;
      tests.push({
        name: `${(a.ancestorTitles ?? []).join(" › ")} › ${a.title}`.trim(),
        file: path.relative(process.cwd(), file.name ?? ""),
        status,
        duration_ms: a.duration ?? null,
        error: status === "failed"
          ? (a.failureMessages ?? []).join("\n").slice(0, 4000)
          : null,
      });
    }
  }
  const total = passed + failed + skipped;
  return {
    suite: "unit",
    status: failed > 0 ? "failed" : passed > 0 ? "passed" : "partial",
    total,
    passed,
    failed,
    skipped,
    duration_ms: Math.round(
      report.testResults?.reduce(
        (acc, file) => acc + (file.endTime - file.startTime || 0),
        0,
      ) ?? 0,
    ),
    details: { tests },
  };
}

/**
 * Parse a Playwright JSON report.
 */
function parsePlaywrightReport(report) {
  const tests = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const walk = (suites) => {
    for (const s of suites ?? []) {
      walk(s.suites);
      for (const spec of s.specs ?? []) {
        for (const t of spec.tests ?? []) {
          for (const r of t.results ?? []) {
            const status = r.status === "passed" ? "passed"
              : r.status === "failed" || r.status === "timedOut" ? "failed"
              : "skipped";
            if (status === "passed") passed++;
            else if (status === "failed") failed++;
            else skipped++;
            tests.push({
              name: spec.title,
              file: spec.file,
              status,
              duration_ms: r.duration ?? null,
              error: status === "failed"
                ? (r.errors?.[0]?.message ?? r.error?.message ?? "").slice(0, 4000)
                : null,
            });
          }
        }
      }
    }
  };
  walk(report.suites);
  const total = passed + failed + skipped;
  return {
    suite: "e2e",
    status: failed > 0 ? "failed" : passed > 0 ? "passed" : "partial",
    total,
    passed,
    failed,
    skipped,
    duration_ms: report.stats?.duration ?? null,
    details: { tests },
  };
}

/**
 * Parse the simple DB test runner output (our own JSON shape).
 */
function parseDbReport(report) {
  const tests = report.tests ?? [];
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    if (t.status === "passed") passed++;
    else if (t.status === "failed") failed++;
  }
  const total = tests.length;
  return {
    suite: "db",
    status: failed > 0 ? "failed" : passed > 0 ? "passed" : "partial",
    total,
    passed,
    failed,
    skipped: 0,
    duration_ms: report.duration_ms ?? null,
    details: { tests },
  };
}

async function readMaybe(file) {
  try {
    const raw = await fs.readFile(path.join(RESULTS_DIR, file), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const parsers = [
    { file: "unit.json", parser: parseVitestReport },
    { file: "db.json", parser: parseDbReport },
    { file: "e2e.json", parser: parsePlaywrightReport },
  ];
  let ingested = 0;
  for (const { file, parser } of parsers) {
    const report = await readMaybe(file);
    if (!report) {
      console.log(`[ingest] No ${file} report found, skipping.`);
      continue;
    }
    const run = parser(report);
    run.commit_sha = commitSha;
    run.triggered_by = triggeredBy;
    await insertRun(run);
    ingested++;
    console.log(
      `[ingest] ${run.suite}: ${run.passed}/${run.total} passed` +
        (run.failed > 0 ? `, ${run.failed} failed` : "") +
        (run.skipped > 0 ? `, ${run.skipped} skipped` : "") +
        ` (${run.duration_ms ?? "?"}ms)`,
    );
  }
  console.log(`[ingest] Wrote ${ingested} test_runs row(s).`);
}

main().catch((err) => {
  console.error("[ingest] Fatal:", err);
  process.exit(1);
});
