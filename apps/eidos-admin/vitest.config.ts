import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Eidos Admin — Vitest config. Pure-logic unit tests colocated with
 * lib/. Node environment; `@/` matches the Next.js tsconfig alias.
 */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
