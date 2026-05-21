#!/usr/bin/env node
/**
 * Stone Harbor — PWA icon generator.
 *
 * Takes the master anchor SVG and produces every icon size the PWA
 * spec, the manifest, and iOS need. Run once whenever the master
 * artwork changes.
 *
 * Usage:
 *   npm install --save-dev sharp
 *   node scripts/generate-pwa-icons.mjs
 *
 * Inputs:
 *   app/favicon-anchor.svg          (master, 512x512 viewBox preferred)
 *
 * Outputs (all written to public/icons/):
 *   icon-192.png                    (any-purpose, manifest)
 *   icon-192-maskable.png           (maskable safe zone — 80% inset, dark bg)
 *   icon-384.png
 *   icon-512.png
 *   icon-512-maskable.png
 *   apple-touch-icon.png            (180×180 — iOS home screen)
 *   apple-splash-1290x2796.png      (iPhone 15 Pro Max)
 *   apple-splash-1179x2556.png      (iPhone 15)
 *   apple-splash-1170x2532.png      (iPhone 13/14)
 *   apple-splash-1125x2436.png      (iPhone X/11 Pro/12 mini)
 *
 * Design notes:
 *   - Maskable icons need a "safe zone" — Android draws them inside a
 *     circle and can crop up to 20% off each edge. We render the anchor
 *     at 60% size, centered, on the brand background to guarantee the
 *     full anchor is always visible no matter what mask the OS applies.
 *   - Splash screens use the same dark background (#0A0A0B) as the body,
 *     so there's no flash of white when the PWA launches on iOS.
 */

import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SVG_PATH = resolve(ROOT, "app/favicon-anchor.svg");
const OUT_DIR = resolve(ROOT, "public/icons");

const BRAND_BG = "#0A0A0B";

if (!existsSync(SVG_PATH)) {
  console.error("[icons] master SVG not found at", SVG_PATH);
  process.exit(1);
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const svgBuffer = readFileSync(SVG_PATH);

async function squareIcon({ size, file, maskable = false }) {
  const inner = maskable ? Math.round(size * 0.6) : size;
  const offset = Math.round((size - inner) / 2);
  const innerPng = await sharp(svgBuffer, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: BRAND_BG })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: innerPng, left: offset, top: offset }])
    .png()
    .toFile(resolve(OUT_DIR, file));

  console.log("[icons]", file, `(${size}×${size}${maskable ? " maskable" : ""})`);
}

async function splash({ width, height, file }) {
  // Anchor centered, sized 30% of the shorter side. Brand dark background.
  const anchor = Math.round(Math.min(width, height) * 0.3);
  const anchorPng = await sharp(svgBuffer, { density: 384 })
    .resize(anchor, anchor, { fit: "contain", background: BRAND_BG })
    .png()
    .toBuffer();

  await sharp({
    create: { width, height, channels: 4, background: BRAND_BG },
  })
    .composite([
      {
        input: anchorPng,
        left: Math.round((width - anchor) / 2),
        top: Math.round((height - anchor) / 2),
      },
    ])
    .png()
    .toFile(resolve(OUT_DIR, file));

  console.log("[icons]", file, `(${width}×${height} splash)`);
}

await squareIcon({ size: 192, file: "icon-192.png" });
await squareIcon({ size: 192, file: "icon-192-maskable.png", maskable: true });
await squareIcon({ size: 384, file: "icon-384.png" });
await squareIcon({ size: 512, file: "icon-512.png" });
await squareIcon({ size: 512, file: "icon-512-maskable.png", maskable: true });
await squareIcon({ size: 180, file: "apple-touch-icon.png" });

await splash({ width: 1290, height: 2796, file: "apple-splash-1290x2796.png" });
await splash({ width: 1179, height: 2556, file: "apple-splash-1179x2556.png" });
await splash({ width: 1170, height: 2532, file: "apple-splash-1170x2532.png" });
await splash({ width: 1125, height: 2436, file: "apple-splash-1125x2436.png" });

console.log("[icons] done. wrote 10 files to public/icons/");
