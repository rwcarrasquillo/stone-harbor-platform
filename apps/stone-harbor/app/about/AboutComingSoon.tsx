"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { serif } from "@/lib/fonts";

/**
 * Stone Harbor — /about coming-soon shell (client component).
 *
 * Renders when app_settings.about_page_published is false. Same
 * atmospheric backdrop as the eventual About page, only the
 * copy is a quiet placeholder. Keeps the page visually
 * consistent with the rest of the public surface even when the
 * founder note isn't live yet.
 */

export function AboutComingSoon() {
  return (
    <section className="relative z-10 mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-5 text-center md:px-8">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]"
      >
        About
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.1, ease: "easeOut" }}
        className={`${serif.className} mt-3 text-4xl font-medium leading-tight text-stone-100 md:text-5xl`}
      >
        Coming soon.
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
        className="mt-5 max-w-md text-base leading-relaxed text-stone-300 md:text-lg"
      >
        This space is being built with care. Until then, the harbor itself is
        the introduction.
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400"
      >
        <Link href="/" className="transition hover:text-[#c4934e]">
          ← Home
        </Link>
        <Link href="/login" className="transition hover:text-[#c4934e]">
          Sign in
        </Link>
        <Link href="/register" className="transition hover:text-[#c4934e]">
          Join the harbor
        </Link>
      </motion.div>
    </section>
  );
}
