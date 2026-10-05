/**
 * Stone Harbor — service worker.
 *
 * Tiny, transparent, no Workbox. Just enough to make Stone Harbor
 * installable as a PWA and survive a brief offline blip without
 * showing the iOS "no internet" page.
 *
 * What this does:
 *   - On install: pre-caches the shell (offline page, manifest, icons)
 *   - On fetch: network-only for HTML (falls back to the pre-cached
 *     /offline page), untouched for API. Cache-first for build assets,
 *     icons, fonts and images — never for pages, which can hold a
 *     member's private content (SH-161, review finding 14).
 *   - On "clear-caches" message (sent on sign-out): drops the runtime
 *     cache so nothing from the session outlives it.
 *   - On push: shows a quiet brand-aligned notification (when the
 *     server eventually sends them via Web Push / iOS 16.4+).
 *   - On notificationclick: opens or focuses the relevant Stone Harbor tab.
 *
 * Why not next-pwa:
 *   next-pwa + Workbox is excellent but adds ~30kb to the SW and a
 *   build-time dep. Stone Harbor's offline needs are simple — a graceful
 *   "you're offline" fallback, not a fully synced PWA. Hand-rolling keeps
 *   the surface tiny and easy to reason about during a 2am bug hunt.
 *
 * Cache bump protocol:
 *   When you change the assets listed in SHELL or change the SW itself,
 *   bump CACHE_VERSION. Old caches are deleted on activate.
 */

// v2 (SH-161): bumping deletes v1 caches, which held member pages.
const CACHE_VERSION = "stone-harbor-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Public, non-personal static files that are safe to keep across
// sessions. Anything else (pages, RSC payloads, data) is never cached.
const STATIC_ASSET = /^\/(_next\/static\/|icons\/|fonts\/)|\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?)$/;

// Assets the app shell needs to render the offline fallback page.
// Keep this list small — every entry blocks install if it 404s.
const SHELL_ASSETS = [
  "/offline",
  "/manifest.json",
  "/favicon.ico",
  "/favicon-anchor.svg",
  "/favicon-anchor-180.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map((url) =>
            // addAll() is all-or-nothing; addOne-per-url is forgiving
            // if any single asset 404s in dev.
            cache.add(url).catch((err) => {
              console.warn("[sw] shell pre-cache miss:", url, err);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Never intercept anything that isn't GET — POSTs to Supabase must
  // always go to the network.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Skip cross-origin requests (Supabase, fonts.gstatic, etc.) —
  // let the browser handle them; HTTP cache headers do the right thing.
  if (url.origin !== self.location.origin) return;

  // Skip Supabase storage URLs by path pattern, in case they ever
  // share origin via a proxy.
  if (url.pathname.startsWith("/api/")) return;

  // HTML — network-only. Responses are NOT cached: pages can contain a
  // member's private content, and a shared device must not replay them
  // after sign-out. Offline falls back to the pre-cached /offline page.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }

  // Anything that isn't a known static asset goes straight to the network.
  if (!STATIC_ASSET.test(url.pathname)) return;

  // Static assets — cache-first, fall back to network.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        // Only cache successful, basic (same-origin) responses.
        if (
          !response ||
          response.status !== 200 ||
          response.type !== "basic"
        ) {
          return response;
        }
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
        return response;
      });
    }),
  );
});

// Sign-out (see ServiceWorkerRegistrar) asks us to drop the runtime
// cache. The shell cache holds only public files and stays.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "clear-caches") return;
  event.waitUntil(caches.delete(RUNTIME_CACHE));
});

/**
 * Web Push (iOS 16.4+ supports this when installed to home screen).
 * Server sends a JSON payload like:
 *   { title: "A brother is with you", body: "...", url: "/dashboard" }
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Stone Harbor", body: event.data.text() };
  }
  const title = payload.title || "Stone Harbor";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "stone-harbor",
    data: { url: payload.url || "/dashboard" },
    // Stone Harbor's tone is patient — don't vibrate aggressively.
    silent: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
