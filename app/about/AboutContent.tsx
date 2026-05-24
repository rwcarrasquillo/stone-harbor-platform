"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { sans, serif } from "@/lib/fonts";

/**
 * Stone Harbor — /about prose body (client component).
 *
 * Pulled out of the page so the page can stay a server component
 * that gates on app_settings.about_page_published. The motion
 * fades + the long-form prose all live here.
 *
 * Voice note: the page deliberately does NOT recycle sentences
 * from "The Invisible War," published under a separate pen
 * name to protect family privacy. Same emotional truth, fresh
 * language, founder cadence. Signed "— The Harbor" so the
 * collapse of founder into refuge is the seal.
 */

export function AboutContent() {
  return (
    <section className="relative z-10 mx-auto max-w-2xl px-5 py-20 md:px-8 md:py-28">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
          About
        </p>
        <h1
          className={`${serif.className} mt-3 text-4xl font-medium leading-tight text-stone-100 md:text-5xl`}
        >
          Why this harbor exists.
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
        className={`${serif.className} mt-10 space-y-5 text-[17px] leading-relaxed text-stone-100/95 md:text-[18px] md:leading-[1.7]`}
      >
        <p>
          If you&apos;re reading this, there&apos;s a good chance you have a
          version of a story you don&apos;t fully have words for yet.
        </p>

        <p>
          I built Stone Harbor because a few years ago I spent too long
          inside a relationship that was quietly eroding me, and even longer
          trying to name what was happening so I could begin to come back
          from it. The not-having-words turned out to be the trap — not the
          hardship.
        </p>

        <p>
          For a long time I called it normal difficulty. The disconnects
          were real, but I treated them like effort, patience, the price of
          being the man who stays. I kept score against myself. When
          something didn&apos;t add up, I assumed I hadn&apos;t tried hard
          enough — never that I was being asked, slowly and without anyone
          using the word, to stop trusting what I already knew.
        </p>

        <p>
          By the time the picture clarified, I&apos;d spent years explaining
          to myself things that couldn&apos;t be explained. I was quieter
          than I&apos;d ever been. I was sharper. There were mornings I
          didn&apos;t fully recognize the man in my bathroom mirror — and
          not in a way I could put my finger on, which made it worse.
        </p>

        <p>
          What eventually cracked open wasn&apos;t a single moment. It was
          the realization that this didn&apos;t have to be private. There
          was a structure behind what I had been living through. There was
          language for it. And there were other men out there, somewhere,
          who had felt the same disorientation and made the same wrong
          assumption I had: that they were the problem.
        </p>

        <div
          aria-hidden="true"
          className="mx-auto my-8 h-px w-24 bg-[#c4934e]/60"
        />

        <p>I sat with that for a long time. Then I started building.</p>

        <p>
          Stone Harbor is the room I needed and couldn&apos;t find. It moves
          at the pace of a man&apos;s actual healing — not the pace of an
          app trying to keep him scrolling. Reflection comes before
          connection. Solitude has a place of its own. Brotherhood is here
          when you&apos;re ready, opt-in and never performative. There are
          no streaks designed to make you feel guilty when life gets hard.
          Nothing here is asking more of you than you&apos;re already ready
          to give.
        </p>

        <p>
          If you&apos;re here because something feels familiar — the
          explaining, the second-guessing, the slow loss of your own sense
          of things —{" "}
          <strong className="text-stone-50">
            you&apos;re not crazy, you&apos;re not imagining it, and
            you&apos;re not weak for finally trying to understand what
            you&apos;ve been carrying.
          </strong>{" "}
          You&apos;re paying attention. Which is exactly where everything
          that comes next has to start.
        </p>

        <p>Welcome in. Take your time.</p>

        <p className="pt-2 text-stone-300/80">— The Harbor</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="mt-16 flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400"
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
        {/* The font wrapper inherits from the page; explicit just in case */}
        <span className={`${sans.className} hidden`} aria-hidden="true" />
      </motion.div>
    </section>
  );
}
