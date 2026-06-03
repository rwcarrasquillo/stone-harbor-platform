#!/usr/bin/env node
/**
 * Stone Harbor — orchestrate all three suites + ingest.
 *
 * Runs Vitest, the DB SQL suite, and Playwright in order. Each
 * suite writes its own JSON report into .test-results/. After
 * all three finish (regardless of pass/fail), the ingest script
 * pushes one test_runs row per suite into Supabase so the admin
 * /admin/tests dashboard surfaces the new results.
 *
 * We deliberately do NOT short-circuit on a suite failure — the
 * admin wants to see the full picture of what's broken, not the
 * first thing to break. Exit code at the end reflects whether
 * any suite failed.
 *
 * Spawned by:
 *   - `npm run test:all:report` from the CLI
 *   - The /api/admin/run-tests route (which shells out to the
 *     above via npm).
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const SUITES = [
  { name: "unit", cmd: "npm", args: ["run", "test"] },
  { name: "db",   cmd: "npm", args: ["run", "test:db"] },
  { name: "e2e",  cmd: "npm", args: ["run", "test:e2e"] },
];

function runStep({ name, cmd, args }) {
  return new Promise((resolve) => {
    const started = Date.now();
    console.log(`\n[run-all] ▶︎ ${name}…`);
    const child = spawn(cmd, args, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      const ms = Date.now() - started;
      console.log(
        `[run-all] ${name} finished (exit ${code ?? "?"}) in ${ms}ms`,
      );
      resolve({ name, code: code ?? 1, ms });
    });
    child.on("error", (err) => {
      console.log(`[run-all] ${name} spawn error: ${err.message ?? err}`);
      resolve({ name, code: 1, ms: Date.now() - started });
    });
  });
}

async function main() {
  // Ensure .test-results exists so subsequent steps don't race.
  await fs.mkdir(path.join(PROJECT_ROOT, ".test-results"), { recursive: true });

  const results = [];
  for (const step of SUITES) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runStep(step));
  }

  // Always ingest so partial runs still show up on the dashboard.
  console.log("\n[run-all] ▶︎ ingest…");
  const ingest = await runStep({
    name: "ingest",
    cmd: "node",
    args: ["scripts/ingest-test-results.mjs"],
  });

  const anyFailed =
    results.some((r) => r.code !== 0) || ingest.code !== 0;

  if (anyFailed) {
    console.log(
      "\n[run-all] One or more suites reported failures. The admin dashboard now has the details.",
    );
    process.exit(1);
  }
  console.log("\n[run-all] All suites green. Ingest complete.");
}

main();
