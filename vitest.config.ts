import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Stone Harbor — Vitest config.
 *
 * Pure logic only — components are NOT in the unit suite (we use
 * Playwright for behavioral testing). The happy-dom environment
 * provides a minimal window/localStorage for the user-progress
 * preview-override tests; everything else runs in plain Node.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.ts"],
    reporters: ["default", "json"],
    outputFile: { json: ".test-results/unit.json" },
  },
});
