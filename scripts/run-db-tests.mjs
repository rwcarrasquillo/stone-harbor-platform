#!/usr/bin/env node
/**
 * Stone Harbor — database test runner.
 *
 * Each SQL test file under tests/db/ is a transaction that asserts
 * one thing via PostgreSQL's standard mechanisms (e.g., `do $$ begin
 * ... if (...) then raise exception 'fail'; end if; end $$;`). The
 * outer transaction rolls back so no test mutates real data.
 *
 * The runner executes each file via the Supabase pg-meta endpoint
 * (we use direct SQL via the supabase-js client). For local runs
 * without supabase-js installed in the script, we shell out to psql
 * using $DATABASE_URL.
 *
 * Output: .test-results/db.json
 *   {
 *     "duration_ms": 1234,
 *     "tests": [
 *       { "name": "match_pairing_creates_row", "status": "passed", "duration_ms": 12 },
 *       { "name": "rls_blocks_other_users", "status": "failed",
 *         "error": "Expected...", "duration_ms": 8 }
 *     ]
 *   }
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run test:db
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const TESTS_DIR = "tests/db";
const OUT_DIR = ".test-results";
const OUT_FILE = path.join(OUT_DIR, "db.json");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "[db-tests] DATABASE_URL not set. Provide a Postgres connection string with admin access (e.g., the Supabase project's direct-connection URI).",
  );
  process.exit(1);
}

async function listTests() {
  try {
    const entries = await fs.readdir(TESTS_DIR);
    return entries
      .filter((f) => f.endsWith(".test.sql"))
      .sort()
      .map((f) => path.join(TESTS_DIR, f));
  } catch {
    return [];
  }
}

/**
 * Run a single SQL test file. Each file is expected to be wrapped
 * in its own transaction + rollback so any test data created is
 * cleaned up automatically. A non-zero psql exit means the test
 * raised an exception, which we treat as a failure.
 */
function runOne(file) {
  const start = Date.now();
  try {
    execSync(`psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f ${file}`, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      name: path.basename(file, ".test.sql"),
      status: "passed",
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: path.basename(file, ".test.sql"),
      status: "failed",
      duration_ms: Date.now() - start,
      error: (err.stderr?.toString() ?? err.message ?? "").slice(0, 4000),
    };
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const files = await listTests();
  if (files.length === 0) {
    console.log(`[db-tests] No tests found in ${TESTS_DIR}.`);
    await fs.writeFile(OUT_FILE, JSON.stringify({ duration_ms: 0, tests: [] }, null, 2));
    return;
  }
  const start = Date.now();
  const results = [];
  for (const file of files) {
    const result = runOne(file);
    const symbol = result.status === "passed" ? "✓" : "✗";
    console.log(
      `  ${symbol} ${result.name} (${result.duration_ms}ms)` +
        (result.status === "failed" ? `\n    ${result.error}` : ""),
    );
    results.push(result);
  }
  const duration_ms = Date.now() - start;
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  await fs.writeFile(
    OUT_FILE,
    JSON.stringify({ duration_ms, tests: results }, null, 2),
  );
  console.log(
    `\n[db-tests] ${passed}/${results.length} passed` +
      (failed > 0 ? `, ${failed} failed` : "") +
      ` (${duration_ms}ms)`,
  );
  if (failed > 0) process.exit(1);
}

main();
