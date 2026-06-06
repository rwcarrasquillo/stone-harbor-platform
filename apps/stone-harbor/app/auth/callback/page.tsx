"use client";

/**
 * /auth/callback — handles the redirect back from a Supabase email link.
 *
 * Why this exists: when `/api/register` (SH-4) creates a new member,
 * Supabase Auth sends a confirmation email. The link in that email
 * points (per Supabase Auth → URL Configuration) at:
 *
 *     https://stoneharbor.app/auth/callback?code=<one-time-code>
 *
 * Before this route existed, the link landed on `/en#error=...` (a
 * non-page from next-intl trying to render `/en/auth/callback`), which
 * looked broken from the member's side. This route closes that loop.
 *
 * Three things can happen when the page loads:
 *
 *   1. `?code=…` is present → exchange it for a session, redirect to
 *      `/dashboard`. The auth guards on `/dashboard` will route a new
 *      (settle-in-incomplete) member onward to `/settle-in`, and an
 *      existing one stays on the dashboard. This means we don't need
 *      to know "is this their first sign-in" here — the guard does it.
 *
 *   2. `?error_code=…` or `?error=…` is present → Supabase rejected the
 *      link before redirecting (expired, already-confirmed, etc.).
 *      Render a calm themed message + a path forward.
 *
 *   3. Neither — also render the calm themed message. This covers the
 *      hand-crafted/garbled URL case.
 *
 * Implementation note: this is a client component because the project
 * uses `@supabase/supabase-js` (not `@supabase/ssr`). The session is
 * established in the browser's storage on success, and `router.replace`
 * carries the member onward.
 *
 * Linear: SH-5. Cowork: #381.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
import { Anchor, Spark } from "@/app/components/icons";

// ---------- types ----------

type ErrorKind = "expired" | "already_confirmed" | "invalid" | "no_code";

type CallbackState =
  | { phase: "exchanging" }
  | { phase: "success" }
  | { phase: "error"; kind: ErrorKind; detail: string };

// ---------- copy ----------

// Friendly text per error kind. Kept short — the page is a calm
// landing for a moment that has already gone slightly wrong.
const ERROR_COPY: Record<
  ErrorKind,
  { headline: string; body: string; primaryHref: string; primaryLabel: string }
> = {
  expired: {
    headline: "This link has expired.",
    body: "Confirmation links rest after a short while. Start sign-up again and we'll send a fresh one.",
    primaryHref: "/register",
    primaryLabel: "Begin again →",
  },
  already_confirmed: {
    headline: "You're already confirmed.",
    body: "Your email is good to go. Sign in and step into the harbor.",
    primaryHref: "/login",
    primaryLabel: "Sign in →",
  },
  invalid: {
    headline: "We couldn't follow that link.",
    body: "It may have been opened twice, or copy-pasted incompletely. Begin sign-up again or sign in if you already have an account.",
    primaryHref: "/login",
    primaryLabel: "Sign in →",
  },
  no_code: {
    headline: "This page expects a confirmation link.",
    body: "If you arrived here from your email, the link may have been broken in transit. Try clicking it from the original email again.",
    primaryHref: "/login",
    primaryLabel: "Sign in →",
  },
};

// ---------- post-auth navigation ----------

/**
 * Hard-navigate to /dashboard after the Supabase session has been
 * established. We do NOT use Next's `router.replace` here for a real
 * reason that bit us during SH-5 verification:
 *
 * `supabase.auth.exchangeCodeForSession` writes the new session to
 * localStorage and updates the in-memory state of the supabase client
 * singleton that lives on the currently-mounted page. But when Next's
 * client router transitions to /dashboard, the dashboard page imports
 * `supabase` from the same singleton module — Next's RSC/SPA model
 * keeps the page tree mounted and the singleton's in-memory session
 * is what authGuards.ts reads via `supabase.auth.getUser()`. In some
 * paths (Vercel preview, fresh PKCE exchange, hand-off timing) the
 * dashboard's getUser() call hits the network with the OLD bearer
 * token, gets nothing back, and treats the member as signed-out —
 * bouncing them to /login. The DB rows show the auth.users session
 * is valid; the client just hasn't propagated it yet.
 *
 * A `window.location.href` hard navigation tears the page tree all
 * the way down. The dashboard mounts fresh, the supabase singleton
 * is constructed from scratch, the constructor reads the just-written
 * localStorage session, and getUser() returns the new user on the
 * first try. The cost is a sub-second extra paint; the benefit is the
 * member doesn't get asked to re-type a password they just used.
 *
 * Before navigating we also do a belt-and-suspenders `getSession()`
 * call — if for any reason the session ISN'T actually persisted, we
 * surface that as an `invalid` error rather than redirecting the
 * member into a confusing /login state.
 */
async function redirectAfterAuth() {
  if (typeof window === "undefined") return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    // Session somehow didn't persist. Land on /login rather than a
    // dashboard that will immediately reject — better signal to the
    // member that something needs another try.
    window.location.href = "/login?reason=session_not_persisted";
    return;
  }
  window.location.href = "/dashboard";
}

// ---------- error classification ----------

/**
 * Maps a Supabase error name or description to one of the user-facing
 * kinds in {@link ERROR_COPY}. We err on the side of "invalid" when
 * uncertain — the copy there is general enough to cover edge cases.
 */
function classifyError(rawCode: string, rawDescription: string | null): ErrorKind {
  const haystack = `${rawCode} ${rawDescription ?? ""}`.toLowerCase();
  if (haystack.includes("expired") || haystack.includes("invalid_otp")) {
    return "expired";
  }
  if (haystack.includes("already") && haystack.includes("confirm")) {
    return "already_confirmed";
  }
  if (haystack.includes("user_already_exists")) {
    return "already_confirmed";
  }
  return "invalid";
}

// ---------- inner component (uses useSearchParams) ----------

function CallbackInner() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<CallbackState>({ phase: "exchanging" });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // 1. Did Supabase reject the link before sending us here? It
      //    encodes the failure in query params.
      const errorParam =
        searchParams.get("error_code") || searchParams.get("error");
      const errorDescription = searchParams.get("error_description");
      if (errorParam) {
        if (cancelled) return;
        setState({
          phase: "error",
          kind: classifyError(errorParam, errorDescription),
          detail: errorDescription ?? errorParam,
        });
        return;
      }

      // 2. PKCE flow — Supabase appends `?code=<hash>`. Exchange it.
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setState({
            phase: "error",
            kind: classifyError(error.name ?? "", error.message ?? null),
            detail: error.message ?? "",
          });
          return;
        }
        setState({ phase: "success" });
        // SH-5 fix-up: do NOT use router.replace here. The Supabase
        // client writes the new session to localStorage during
        // exchangeCodeForSession, but the Next.js client router keeps
        // the in-memory Supabase singleton from the previous page —
        // when the dashboard's authGuards.ts calls supabase.auth.getUser()
        // it sees the OLD pre-exchange state and bounces the member
        // to /login (forcing them to type their password despite a
        // valid session). A hard navigation forces the dashboard page
        // to mount fresh, instantiate a new Supabase client, and read
        // the just-written localStorage session correctly.
        await redirectAfterAuth();
        return;
      }

      // 3. Implicit flow fallback — Supabase puts the session in the
      //    URL hash fragment when configured for the older OTP flow.
      //    We support both so a misconfigured project still works.
      if (typeof window !== "undefined" && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (cancelled) return;
          if (error) {
            setState({
              phase: "error",
              kind: classifyError(error.name ?? "", error.message ?? null),
              detail: error.message ?? "",
            });
            return;
          }
          setState({ phase: "success" });
          // Same hard-navigation reasoning as the PKCE branch above.
          await redirectAfterAuth();
          return;
        }
        // Hash present but doesn't carry tokens — Supabase sometimes
        // puts the error in the hash too.
        const hashError =
          hashParams.get("error_code") || hashParams.get("error");
        if (hashError) {
          setState({
            phase: "error",
            kind: classifyError(hashError, hashParams.get("error_description")),
            detail: hashParams.get("error_description") ?? hashError,
          });
          return;
        }
      }

      // 4. Got here with no useful payload. The link is malformed or
      //    the page was visited directly.
      if (cancelled) return;
      setState({ phase: "error", kind: "no_code", detail: "" });
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (state.phase === "exchanging" || state.phase === "success") {
    return <LoadingPanel />;
  }
  return <ErrorPanel kind={state.kind} />;
}

// ---------- presentational panels ----------

/**
 * Calm pulse + "Confirming…" line. Reused for both the exchange-in-
 * progress phase and the success phase (the router replaces this page
 * immediately on success, so the pulse only flashes for a moment).
 */
function LoadingPanel() {
  return (
    <PageShell>
      <motion.div
        animate={{ opacity: [0.35, 0.8, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        className="flex flex-col items-center"
      >
        <Anchor size={36} className="text-[#c4934e]/80" />
        <p
          className={`${sans.className} mt-8 text-[11px] font-bold uppercase tracking-[0.32em] text-white/70`}
        >
          Confirming…
        </p>
      </motion.div>
    </PageShell>
  );
}

function ErrorPanel({ kind }: { kind: ErrorKind }) {
  const copy = ERROR_COPY[kind];
  return (
    <PageShell>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="mx-auto max-w-xl rounded-none border border-[#c4934e]/40 bg-black/35 px-10 py-14 text-center shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-center gap-2">
          <Spark size={14} className="text-[#a9793d]" />
          <p
            className={`${sans.className} text-xs font-bold uppercase tracking-[0.32em] text-[#a9793d]`}
          >
            The Harbor
          </p>
        </div>
        <h1
          className={`${serif.className} mt-6 text-4xl font-medium leading-tight text-white md:text-5xl`}
        >
          {copy.headline}
        </h1>
        <p
          className={`${sans.className} mt-6 text-base leading-relaxed text-white/75`}
        >
          {copy.body}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <Link
            href={copy.primaryHref}
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-10 py-4 text-xs font-bold uppercase tracking-[0.32em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432]"
          >
            <span className="relative z-10">{copy.primaryLabel}</span>
            <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
          </Link>
          <Link
            href="/"
            className={`${sans.className} text-xs uppercase tracking-[0.28em] text-white/55 transition hover:text-[#c4934e]`}
          >
            ← Back to home
          </Link>
        </div>
      </motion.div>
    </PageShell>
  );
}

/**
 * The dark-forest visual shell shared by both panels. Kept inline so the
 * route is fully self-contained and matches the visual register of
 * /register and /login without needing a layout file.
 */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className={`${sans.className} relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0A0B] px-6 py-12 text-white`}
    >
      {/* Forest backdrop — matches /register, /login, /home */}
      <motion.div
        animate={{
          scale: [1, 1.06, 1],
          x: ["0%", "-1.2%", "0%"],
          y: ["0%", "1.2%", "0%"],
        }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        className="fixed inset-0 z-0 bg-cover bg-center opacity-40 grayscale"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
        aria-hidden
      />
      <div
        className="fixed inset-0 z-0 bg-gradient-to-b from-black/65 via-black/35 to-black/80"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 60%, rgba(196,147,78,0.18) 0%, rgba(196,147,78,0.06) 35%, transparent 70%)",
        }}
        aria-hidden
      />
      <section className="relative z-10 w-full max-w-3xl">{children}</section>
    </main>
  );
}

// ---------- default export ----------

export default function CallbackPage() {
  // Next requires a Suspense boundary around any component that calls
  // useSearchParams during render. Wrapping at the page level keeps
  // CallbackInner clean.
  return (
    <Suspense fallback={<LoadingPanel />}>
      <CallbackInner />
    </Suspense>
  );
}
