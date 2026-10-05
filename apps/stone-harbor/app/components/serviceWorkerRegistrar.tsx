"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — service worker registrar.
 *
 * Why a component and not a one-liner in layout.tsx:
 *   - layout.tsx is a server component (it exports metadata), so we
 *     can't call window.* there.
 *   - Registering on every page navigation is fine because the
 *     browser's SW machinery dedupes by URL; the registration is a
 *     no-op after the first time.
 *   - Doing it inside a useEffect (not at module top-level) defers
 *     SW install until after first paint, so Stone Harbor's hero
 *     LCP is never blocked by network I/O for /sw.js.
 *
 * In dev (NODE_ENV=development), we deliberately do NOT register the
 * service worker. A stale SW in dev cache is one of the most painful
 * debugging experiences in web dev — you change code, hard-refresh,
 * and the old cached page still serves. Better to keep dev clean.
 *
 * To test the SW locally:
 *   1. `next build && next start`  (production build, not dev server)
 *   2. Open http://localhost:3000
 *   3. DevTools → Application → Service Workers → confirm activation
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Swallow — a failed SW registration shouldn't break the app.
          console.warn("[sw] registration failed:", err);
        });
    };

    // Defer until the browser is idle so it never competes with hero render.
    if ("requestIdleCallback" in window) {
      (window as Window & {
        requestIdleCallback: (cb: () => void) => void;
      }).requestIdleCallback(register);
    } else {
      setTimeout(register, 1500);
    }

    // SH-161 (review finding 14): on sign-out, tell the worker to drop
    // its runtime cache so nothing from this session survives on a
    // shared device. One listener here covers every sign-out button.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      navigator.serviceWorker.controller?.postMessage({ type: "clear-caches" });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
