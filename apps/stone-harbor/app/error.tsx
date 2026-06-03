"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Stone Harbor — root error boundary.
 *
 * Catches any unhandled runtime error from the route tree and renders a
 * brand-matched screen instead of Next.js's default error page. The 988
 * line stays present because crisis support is unconditional.
 *
 * Note this is a Client Component (required by Next.js for error.tsx).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, the actual error.message is stripped by Next.js
    // and replaced with `error.digest` (a hash) for security. Log what
    // we have so it shows in Vercel logs.
    // eslint-disable-next-line no-console
    console.error("Stone Harbor unhandled error:", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <main className="relative flex min-h-screen flex-col bg-[#f3efe7] text-stone-900">
      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#a9793d]">
            Something Drifted
          </p>
          <h1 className="mt-4 text-5xl font-medium italic leading-tight text-stone-900 md:text-6xl">
            The harbor is steady.
            <br />
            Something on our side wasn&apos;t.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-stone-600">
            An unexpected error interrupted the page. It&apos;s not you. If you
            were in the middle of something, your work is safe — what you
            wrote, what you marked, what you anchored is stored. Try the page
            again, or come back to the dashboard.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-none bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white shadow-md transition hover:bg-[#8d6432]"
            >
              Try Again
            </button>
            <Link
              href="/dashboard"
              className="rounded-none border border-stone-300 bg-white px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d]"
            >
              Open The Dashboard
            </Link>
          </div>

          {error.digest && (
            <p className="mt-8 text-[10px] uppercase tracking-[0.22em] text-stone-400">
              Reference · {error.digest}
            </p>
          )}
        </div>
      </section>

      {/* 988 footer — crisis support is unconditional. */}
      <footer className="border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-8 backdrop-blur-sm">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3 md:items-center">
          <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
            Stone Harbor
          </p>
          <p className="text-center text-base italic text-stone-600">
            The harbor is patient.
          </p>
          <p className="text-right text-sm leading-relaxed text-stone-700">
            <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              If You Are In Crisis
            </span>
            <span className="mt-1 block">
              Call or text{" "}
              <span className="font-bold text-[#a9793d]">988</span> — 24/7. Free.
              Confidential.
            </span>
          </p>
        </div>
      </footer>
    </main>
  );
}
