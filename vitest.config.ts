import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for Stone Harbor.
 *
 * Scope intentionally narrow: pure logic only. We don't load React,
 * a DOM, or Next.js — those layers belong to Playwright (E2E) and
 * to the actual app. Keeping unit tests pure means every test runs
 * in milliseconds and never breaks because of unrelated UI changes.
 *
 * Test files live under `tests/unit/` and follow `*.test.ts`.
 *
 * Reporters:
 *   - default for terminal readability
 *   - json (via --reporter=json) for the ingest script, which feeds
 *     /admin/tests with a structured summary of each run.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: false,
    // Keep tests honest — no warning-leniency.
    passWithNoTests: false,
    // Per-test timeout. Pure logic shouldn't need more than a few ms.
    testTimeout: 2000,
  },
  resolve: {
    // Mirror the tsconfig "@/" alias so test files can import from
    // application code without relative path soup.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
