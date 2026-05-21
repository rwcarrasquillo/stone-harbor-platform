import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Not Found",
  description: "The page you were looking for is not part of the harbor.",
};

/**
 * Stone Harbor — branded 404.
 *
 * Replaces Next.js's default not-found screen. Brand-matched to the
 * member-facing cream surfaces; keeps the 988 footer because a member
 * who lands here may still be in crisis.
 *
 * Server Component (no "use client") — pure static render.
 */
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col bg-[#f3efe7] text-stone-900">
      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#a9793d]">
            Not On The Map
          </p>
          <h1 className="mt-4 text-5xl font-medium italic leading-tight text-stone-900 md:text-6xl">
            This is not part of the harbor.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-stone-600">
            The page you were looking for either moved, was never here, or was
            mistyped. You haven&apos;t done anything wrong. The harbor is
            still patient.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-none bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white shadow-md transition hover:bg-[#8d6432]"
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className="rounded-none border border-stone-300 bg-white px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d]"
            >
              Dashboard
            </Link>
          </div>
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
