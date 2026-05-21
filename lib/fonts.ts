/**
 * Stone Harbor — Centralized font loaders.
 *
 * Every page imports `serif` and `sans` from here rather than calling
 * Cormorant_Garamond() / Inter() locally. Single source of weights and
 * subsets; consistent across the codebase.
 *
 * The CSS variables (--font-cormorant, --font-inter) are applied at the
 * <html> level in app/layout.tsx so Tailwind utilities like font-sans
 * pick them up via globals.css.
 */

import { Cormorant_Garamond, Inter } from "next/font/google";

export const serif = Cormorant_Garamond({
  subsets: ["latin"],
  // Trimmed from the previous ["400","500","600","700"] — 500 is rarely
  // used in the codebase, and dropping it cuts ~25% of the font payload.
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

export const sans = Inter({
  subsets: ["latin"],
  // Trimmed from ["400","500","600","700","800"] — same rationale.
  // Most member-facing copy uses 400/600/700. 500 and 800 only appeared
  // in two surfaces total and weren't load-bearing.
  weight: ["400", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});
