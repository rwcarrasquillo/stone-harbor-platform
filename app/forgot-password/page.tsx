"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Send } from "@/app/components/icons";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Brand system — matches every previous auth page
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type Mode = "idle" | "sent";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setIsError(false);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Enter the email you used to sign up.");
      setIsError(true);
      return;
    }

    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);

    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }

    setMode("sent");
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}
    >
      {/* Base dark layer */}
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />

      {/* Slow-drifting forest */}
      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          x: ["0%", "-1.5%", "0%"],
          y: ["0%", "1.5%", "0%"],
        }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        className="fixed inset-0 z-0 bg-cover bg-center opacity-45 grayscale"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
      />

      {/* Atmospheric gradient */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/65 via-black/35 to-black/80" />

      {/* Dawn glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 70%, rgba(196,147,78,0.22) 0%, rgba(196,147,78,0.08) 35%, transparent 70%)",
        }}
      />

      {/* Topographic contour */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="fp-req-contour"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 60 Q 80 30 160 60 T 320 60"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 130 Q 80 100 160 130 T 320 130"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 200 Q 80 170 160 200 T 320 200"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 270 Q 80 240 160 270 T 320 270"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#fp-req-contour)" />
      </svg>

      {/* Film grain */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.06] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="fp-req-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#fp-req-grain)" />
      </svg>

      {/* TOP BAR */}
      <header className="relative z-30 px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-semibold uppercase tracking-[0.28em] text-[#c4934e] transition group-hover:text-white">
              ← Stone Harbor
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#c4934e]/70">
              Men&apos;s Mental Wellness
            </span>
          </Link>
          <Link
            href="/login"
            className="group relative overflow-hidden rounded-none border border-[#c4934e] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e] transition hover:bg-[#c4934e] hover:text-black"
          >
            <span className="relative z-10">Back To Login</span>
          </Link>
        </div>
      </header>

      {/* MAIN — single centered glass panel */}
      <section className="relative z-20 flex min-h-[calc(100vh-200px)] items-center justify-center px-6 py-8 md:px-10">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative w-full max-w-xl overflow-hidden rounded-none border border-[#c4934e]/60 bg-black/35 px-8 py-12 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl md:px-12 md:py-14"
        >
          {/* warm wash at top */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,147,78,0.10) 0%, transparent 60%)",
            }}
          />

          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#c4934e]">
              Stone Harbor
            </p>

            {/* IDLE — email request form */}
            {mode === "idle" && (
              <>
                <h1
                  className={`${serif.className} mt-4 text-5xl font-medium leading-tight md:text-6xl`}
                >
                  Forgot your password?
                </h1>
                <p className="mt-5 text-base leading-relaxed text-white/80">
                  No problem. Enter the email you used to sign up — we&apos;ll
                  send you a secure link to set a new one.
                </p>

                <form
                  onSubmit={handleResetPassword}
                  className="mt-10 space-y-5"
                >
                  <div className="w-full">
                    <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e]">
                      Email
                    </label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="h-[52px] w-full border border-white/20 bg-black/30 px-4 text-base text-white outline-none transition placeholder:text-white/40 focus:border-[#c4934e] focus:bg-black/45 focus:ring-2 focus:ring-[#c4934e]/30"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="group relative mt-4 flex w-full items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? (
                      <motion.span
                        animate={{
                          scale: [1, 1.3, 1],
                          opacity: [0.5, 1, 0.5],
                        }}
                        transition={{
                          duration: 1.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                        className="h-2 w-2 rounded-full bg-white"
                      />
                    ) : (
                      <Send size={14} />
                    )}
                    <span className="relative z-10">
                      {sending ? "Sending…" : "Send Reset Link"}
                    </span>
                    <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
                  </button>
                </form>

                <p className="mx-auto mt-8 max-w-lg text-center text-sm text-white/70">
                  Remembered it after all?{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-[#c4934e] underline-offset-4 transition hover:text-white hover:underline"
                  >
                    Back to login
                  </Link>
                  .
                </p>
              </>
            )}

            {/* SENT — confirmation state */}
            {mode === "sent" && (
              <>
                <h1
                  className={`${serif.className} mt-4 text-5xl font-medium leading-tight md:text-6xl`}
                >
                  Check your email.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-white/80">
                  If an account exists for{" "}
                  <span className="font-semibold text-[#c4934e]">{email}</span>,
                  a reset link is on its way. It may take a minute.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/60">
                  Didn&apos;t see anything? Check spam, or{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("idle");
                      setMessage("");
                      setIsError(false);
                    }}
                    className="font-semibold text-[#c4934e] underline-offset-4 transition hover:text-white hover:underline"
                  >
                    try a different email
                  </button>
                  .
                </p>

                <div className="mt-10 border-t border-white/10 pt-6 text-center">
                  <Link
                    href="/login"
                    className="text-xs font-bold uppercase tracking-[0.25em] text-[#c4934e] transition hover:text-white"
                  >
                    Back To Login
                  </Link>
                </div>
              </>
            )}

            {/* ERROR MESSAGE */}
            {message && (
              <div
                className={`mt-6 border px-5 py-4 text-center text-sm font-semibold backdrop-blur-sm ${
                  isError
                    ? "border-red-300/60 bg-red-900/20 text-red-100"
                    : "border-[#c4934e]/70 bg-[#a9793d]/15 text-white"
                }`}
              >
                {message}
              </div>
            )}
          </div>
        </motion.section>
      </section>

      {/* FOOTER — 988 crisis line */}
      <footer className="relative z-10 mt-8 border-t border-white/10 bg-black/40 px-6 py-8 backdrop-blur md:px-10">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3 md:items-center">
          <p
            className={`${serif.className} text-base italic text-white/70 md:text-left`}
          >
            The harbor is patient.
          </p>
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-white/50">
            Stone Harbor · Men&apos;s Mental Wellness
          </p>
          <p className="text-right text-sm leading-relaxed text-white/80">
            <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">
              If You Are In Crisis
            </span>
            <span className="mt-1 block">
              Call or text <span className="font-bold text-[#c4934e]">988</span>{" "}
              — 24/7. Free. Confidential.
            </span>
          </p>
        </div>
      </footer>
    </main>
  );
}
