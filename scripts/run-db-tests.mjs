#!/usr/bin/env node
/**
 * Stone Harbor — database test runner.
 *
 * Calls a single Supabase RPC (`_stone_harbor_test_assert_invariants`)
 * which runs every DB-side invariant and returns one row per
 * assertion. The runner turns those rows into the normalized
 * .test-results/db.json shape the ingest script expects.
 *
 * Why RPC instead of psql:
 *   No need for the user to maintain a separate DATABASE_URL — we
 *   reuse the SUPABASE_SERVICE_ROLE_KEY that's already in
 *   .env.local for ingest. The function runs with definer
 *   privileges so it can inspect pg_proc, pg_policies, etc.
 *   regardless of caller role.
 *
 * To add a new DB invariant: edit the SQL function (see migration
 * `test_assert_invariants_rpc`) — append a new RETURN NEXT block.
 * No code change here.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const OUT_DIR = path.join(PROJECT_ROOT, ".test-results");
const OUT_FILE = path.join(OUT_DIR, "db.json");

// Load .env.local — same minimal loader we use for ingest.
async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(
      path.join(PROJECT_ROOT, ".env.local"),
      "utf8",
    );
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No .env.local — caller must export the two vars below.
  }
}
await loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[db-tests] Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        duration_ms: 0,
        tests: [
          {
            name: "env_check",
            status: "failed",
            duration_ms: 0,
            error: "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY not set.",
          },
        ],
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const start = Date.now();

  const { data, error } = await supabase.rpc(
    "_stone_harbor_test_assert_invariants",
  );

  if (error) {
    console.error(`[db-tests] RPC failed: ${error.message}`);
    await fs.writeFile(
      OUT_FILE,
      JSON.stringify(
        {
          duration_ms: Date.now() - start,
          tests: [
            {
              name: "rpc_call",
              status: "failed",
              duration_ms: 0,
              error: error.message,
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const tests = (data ?? []).map((r) => ({
    name: r.name,
    status: r.status,
    duration_ms: r.duration_ms ?? 0,
    error: r.error ?? null,
  }));

  for (const t of tests) {
    const sym = t.status === "passed" ? "✓" : "✗";
    console.log(
      `  ${sym} ${t.name} (${t.duration_ms}ms)` +
        (t.status === "failed" ? `\n    ${t.error}` : ""),
    );
  }

  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const duration_ms = Date.now() - start;

  await fs.writeFile(
    OUT_FILE,
    JSON.stringify({ duration_ms, tests }, null, 2),
  );

  console.log(
    `\n[db-tests] ${passed}/${tests.length} passed` +
      (failed > 0 ? `, ${failed} failed` : "") +
      ` (${duration_ms}ms)`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[db-tests] Fatal:", err);
  process.exit(1);
});
