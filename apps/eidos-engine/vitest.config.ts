import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Eidos Engine — Vitest config.
 *
 * Pure-logic unit tests colocated with the modules they cover
 * (lib/**​/*.test.ts). Node environment, no JSDOM — none of these
 * tests need browser globals. The `@/` alias matches the Next.js
 * tsconfig path so import statements work identically in both.
 */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
