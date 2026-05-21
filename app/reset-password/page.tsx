"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
// Brand system — matches home, dashboard, journal, login, register, messages
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

// Page state machine
type Mode =
  | "preparing" // checking for recovery session on mount
  | "request" // no recovery session — show email form
  | "update" // valid recovery session — show new-password form
  | "request-sent" // email submitted — show "check your inbox"
  | "update-complete"; // password updated — show "welcome back"

export default function ForgotPasswordPage() {
  const [mode, setMode] = useState<Mode>("preparing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // Real-time password hints (same pattern as register page).
  const passwordHint = useMemo(() => {
    if (!password) return null;
    if (password.length < 8)
      return { tone: "warn", text: "At least 8 characters." };
    return { tone: "ok", text: "Password length looks good." };
  }, [password]);

  const matchHint = useMemo(() => {
    if (!password || !confirmPassword) return null;
    if (password !== confirmPassword)
      return { tone: "warn", text: "Passwords don't match yet." };
    return { tone: "ok", text: "Passwords match." };
  }, [password, confirmPassword]);

  useEffect(() => {
    async function prepareSession() {
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setMode("request");
            setMessage(
              "That reset link is no longer valid. Request a new one below.",
            );
            setIsError(true);
            return;
          }
          setMode("update");
          setMessage("");
          return;
        }
      }
      // Some Supabase flows leave an active session after a recovery click.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setMode("update");
        setMessage("");
        return;
      }
      setMode("request");
      setMessage("");
    }
    prepareSession();
  }, []);

  async function handleSendResetLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setIsError(false);
    if (!email.trim()) {
      setMessage("Enter the email you used to sign up.");
      setIsError(true);
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/forgot-password`,
    });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }
    setMode("request-sent");
    setIsError(false);
    setMessage("");
  }

  async function handleUpdatePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setIsError(false);

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setIsError(true);
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      setIsError(true);
      return;
    }
    await supabase.auth.signOut();
    setPassword("");
    setConfirmPassword("");
    setMode("update-complete");
    setMessage("");
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
            id="fp-contour"
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
        <rect width="100%" height="100%" fill="url(#fp-contour)" />
      </svg>

      {/* Film grain */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.06] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="fp-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#fp-grain)" />
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

            {/* PREPARING */}
            {mode === "preparing" && (
              <div className="mt-10 flex flex-col items-center text-center">
                <motion.div
                  animate={{
                    scale: [1, 1.18, 1],
                    opacity: [0.6, 0.95, 0.6],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="h-20 w-20 rounded-full border border-[#c4934e]/40"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
                  }}
                />
                <p
                  className={`${serif.className} mt-8 text-2xl italic text-white/80`}
                >
                  Preparing the harbor…
                </p>
              </div>
            )}

            {/* REQUEST EMAIL */}
            {mode === "request" && (
              <>
                <h1
                  className={`${serif.className} mt-4 text-5xl font-medium leading-tight md:text-6xl`}
                >
                  Forgot your password?
                </h1>
                <p className="mt-5 text-base leading-relaxed text-white/80">
                  No problem. Enter the email you used to sign up — we&apos;ll
                  send a link to reset it.
                </p>

                <form
                  onSubmit={handleSendResetLink}
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
                    disabled={saving}
                    className="group relative mt-4 flex w-full items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432] disabled:opacity-60"
                  >
                    {saving && (
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
                    )}
                    <span className="relative z-10">
                      {saving ? "Sending…" : "Send Reset Link"}
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

            {/* UPDATE PASSWORD */}
            {mode === "update" && (
              <>
                <h1
                  className={`${serif.className} mt-4 text-5xl font-medium leading-tight md:text-6xl`}
                >
                  Set a new password.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-white/80">
                  Set a new password and we&apos;ll return you to the harbor.
                </p>

                <form
                  onSubmit={handleUpdatePassword}
                  className="mt-10 space-y-5"
                >
                  <div>
                    <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e]">
                      New Password
                    </label>
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={password}
                      disabled={saving}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="h-[52px] w-full border border-white/20 bg-black/30 px-4 text-base text-white outline-none transition placeholder:text-white/40 focus:border-[#c4934e] focus:bg-black/45 focus:ring-2 focus:ring-[#c4934e]/30 disabled:opacity-60"
                    />
                    {passwordHint && (
                      <p
                        className={`mt-2 text-xs font-semibold ${
                          passwordHint.tone === "ok"
                            ? "text-[#9bb29c]"
                            : "text-[#e8c896]"
                        }`}
                      >
                        {passwordHint.text}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e]">
                      Confirm Password
                    </label>
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={confirmPassword}
                      disabled={saving}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="h-[52px] w-full border border-white/20 bg-black/30 px-4 text-base text-white outline-none transition placeholder:text-white/40 focus:border-[#c4934e] focus:bg-black/45 focus:ring-2 focus:ring-[#c4934e]/30 disabled:opacity-60"
                    />
                    {matchHint && (
                      <p
                        className={`mt-2 text-xs font-semibold ${
                          matchHint.tone === "ok"
                            ? "text-[#9bb29c]"
                            : "text-[#e8c896]"
                        }`}
                      >
                        {matchHint.text}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="group relative mt-4 flex w-full items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving && (
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
                    )}
                    <span className="relative z-10">
                      {saving ? "Saving…" : "Update Password"}
                    </span>
                    <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
                  </button>
                </form>
              </>
            )}

            {/* REQUEST SENT */}
            {mode === "request-sent" && (
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
                      setMode("request");
                      setMessage("");
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

            {/* UPDATE COMPLETE */}
            {mode === "update-complete" && (
              <>
                <h1
                  className={`${serif.className} mt-4 text-5xl font-medium leading-tight md:text-6xl`}
                >
                  Welcome back to the harbor.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-white/80">
                  Your password is updated. Sign in with your new password to
                  continue.
                </p>

                <Link
                  href="/login"
                  className="group relative mt-10 flex w-full items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432]"
                >
                  <span className="relative z-10">Sign In</span>
                  <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
                </Link>
              </>
            )}

            {/* ERROR / SUCCESS MESSAGE */}
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
