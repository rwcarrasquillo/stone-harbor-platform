import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Eidos Engine — ESLint config.
 *
 * Mirrors the Stone Harbor web app's flat-config shape. This service
 * surface is backend-leaning (cron routes, ingestion endpoint, admin
 * spot-check), so it carries none of the React-hooks rule downgrades
 * the member-facing app needs; defaults stay in force here.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
