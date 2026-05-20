"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Anchor, Lock, Spark } from "@/app/components/icons";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Brand system — matches home, dashboard, journal, login
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // Registration gate — read from public.app_settings.
  // null = still loading, true = open, false = closed.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(
    null,
  );
  const [closedHeadline, setClosedHeadline] = useState(
    "The harbor is preparing.",
  );
  const [closedMessage, setClosedMessage] = useState(
    "Stone Harbor is not yet open to new members. Leave your email and we'll let you know when the gates open.",
  );
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);

  // Current terms/privacy versions for the acceptance record.
  const [termsVersion, setTermsVersion] = useState<number>(1);
  const [privacyVersion, setPrivacyVersion] = useState<number>(1);

  // Required attestations on the signup form.
  const [genderAttested, setGenderAttested] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Waitlist form state (only used when closed).
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistFirstName, setWaitlistFirstName] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      const { data } = await supabase
        .from("app_settings")
        .select(
          "registration_open, closed_headline, closed_message, waitlist_enabled, current_terms_version, current_privacy_version",
        )
        .eq("id", 1)
        .single();
      if (cancelled) return;
      // Fail-open: if the read fails for any reason, allow registration.
      // The server-side trigger remains the source of truth.
      setRegistrationOpen(data?.registration_open ?? true);
      if (data?.closed_headline) setClosedHeadline(data.closed_headline);
      if (data?.closed_message) setClosedMessage(data.closed_message);
      if (typeof data?.waitlist_enabled === "boolean") {
        setWaitlistEnabled(data.waitlist_enabled);
      }
      if (data?.current_terms_version)
        setTermsVersion(data.current_terms_version);
      if (data?.current_privacy_version)
        setPrivacyVersion(data.current_privacy_version);
    }
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleWaitlist(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWaitlistError(null);
    if (!waitlistEmail) return;
    setWaitlistSubmitting(true);
    const { error } = await supabase.from("waitlist_signups").insert({
      email: waitlistEmail.trim().toLowerCase(),
      first_name: waitlistFirstName.trim() || null,
      source: "register_page_closed",
    });
    setWaitlistSubmitting(false);
    if (error) {
      // Duplicate email is the most common — present it as a soft success
      // so we don't shame a returning visitor.
      if (error.code === "23505" || /duplicate/i.test(error.message)) {
        setWaitlistDone(true);
        return;
      }
      setWaitlistError("Something went wrong. Try again in a moment.");
      return;
    }
    setWaitlistDone(true);
  }

  // Real-time password hints so users aren't punished on submit.
  const passwordHint = useMemo(() => {
    if (!password) return null;
    if (password.length < 6)
      return { tone: "warn", text: "At least 6 characters." };
    return { tone: "ok", text: "Password length looks good." };
  }, [password]);

  const matchHint = useMemo(() => {
    if (!password || !confirmPassword) return null;
    if (password !== confirmPassword)
      return { tone: "warn", text: "Passwords don't match yet." };
    return { tone: "ok", text: "Passwords match." };
  }, [password, confirmPassword]);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setIsError(false);

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }
    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      setIsError(true);
      return;
    }
    if (!genderAttested) {
      setMessage(
        "Please confirm you identify as a man — Stone Harbor is a community for men.",
      );
      setIsError(true);
      return;
    }
    if (!termsAccepted) {
      setMessage("Please accept the Terms of Service and Privacy Policy.");
      setIsError(true);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      setMessage(error.message);
      setIsError(true);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        display_name: fullName,
        healing_stage: "clarity",
        privacy_level: "private",
        updated_at: new Date().toISOString(),
      });

      // Record the terms acceptance as an immutable audit row.
      // IP is left null here (server-side capture would require an edge
      // function); user_agent and timestamp are sufficient for v1 audit.
      await supabase.from("terms_acceptances").insert({
        user_id: data.user.id,
        terms_version: termsVersion,
        privacy_version: privacyVersion,
        gender_attestation: genderAttested,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
    }

    setMessage("Welcome to the harbor. Setting up your space…");
    setIsError(false);
    setLoading(false);
    setTimeout(() => {
      router.push("/onboarding");
    }, 1000);
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}
    >
      {/* Base dark layer */}
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />

      {/* Slow-drifting forest — matches home/login */}
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

      {/* Topographic contour overlay */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="register-contour"
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
        <rect width="100%" height="100%" fill="url(#register-contour)" />
      </svg>

      {/* Film grain */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.06] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="register-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#register-grain)" />
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
            <span className="relative z-10">Already A Member</span>
          </Link>
        </div>
      </header>

      {/* MAIN */}
      <section className="relative z-20 flex min-h-[calc(100vh-120px)] items-center justify-center px-6 py-8 md:px-10">
        <div className="flex w-full max-w-[1320px] flex-col gap-8 md:flex-row md:items-stretch md:justify-center">
          {/* CREAM ASIDE — beginning language */}
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative flex w-full flex-col justify-center overflow-hidden rounded-none border border-stone-300 bg-[#f3efe7] px-10 py-16 text-stone-900 shadow-[0_35px_120px_rgba(0,0,0,0.32)] md:w-[46%] md:px-16 md:py-20"
          >
            {/* paper grain inside the cream */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04] mix-blend-multiply"
              xmlns="http://www.w3.org/2000/svg"
            >
              <filter id="aside-grain-reg">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.85"
                  numOctaves="2"
                />
                <feColorMatrix type="saturate" values="0" />
              </filter>
              <rect width="100%" height="100%" filter="url(#aside-grain-reg)" />
            </svg>

            <div className="relative">
              <div className="flex items-center gap-2">
                <Spark size={14} className="text-[#a9793d]" />
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                  The First Step
                </p>
              </div>
              <h1
                className={`${serif.className} mt-6 text-7xl font-semibold leading-[0.95] md:text-8xl lg:text-9xl`}
              >
                Begin.
              </h1>
              <p className="mt-10 max-w-md text-lg leading-relaxed text-stone-600">
                Whatever brought you here — you&apos;re welcome to start. No
                story required. No catching up. Just one breath, then the next.
              </p>
              <p
                className={`${serif.className} mt-8 text-2xl italic leading-snug text-[#a9793d]`}
              >
                You&apos;re not the only one beginning today.
              </p>

              <div className="mt-12 h-px w-16 bg-[#a9793d]" />

              <p className="mt-8 text-xs leading-relaxed text-stone-500">
                Encrypted. Yours alone. Use your real name or don&apos;t — no
                one&apos;s checking. We never sell or share your data.
              </p>
            </div>
          </motion.aside>

          {/* DARK GLASS FORM PANEL */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="relative w-full overflow-hidden rounded-none border border-[#c4934e]/60 bg-black/35 px-8 py-14 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl md:w-[52%] md:px-14"
          >
            {/* subtle warm wash at top of glass */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,147,78,0.10) 0%, transparent 60%)",
              }}
            />

            <div className="relative z-10 mx-auto max-w-[600px]">
              {/* While settings are loading, show a quiet placeholder so we
                  don't flash the wrong panel. */}
              {registrationOpen === null && (
                <div className="flex h-[480px] flex-col items-center justify-center text-white/40">
                  <motion.div
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                  >
                    <Anchor size={32} className="text-[#c4934e]/70" />
                  </motion.div>
                  <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.28em]">
                    Opening the door…
                  </p>
                </div>
              )}

              {/* CLOSED STATE — registration gate is shut. Show waitlist. */}
              {registrationOpen === false && (
                <ClosedPanel
                  headline={closedHeadline}
                  message={closedMessage}
                  waitlistEnabled={waitlistEnabled}
                  waitlistEmail={waitlistEmail}
                  waitlistFirstName={waitlistFirstName}
                  setWaitlistEmail={setWaitlistEmail}
                  setWaitlistFirstName={setWaitlistFirstName}
                  submitting={waitlistSubmitting}
                  done={waitlistDone}
                  error={waitlistError}
                  onSubmit={handleWaitlist}
                />
              )}

              {/* OPEN STATE — normal signup form. */}
              {registrationOpen === true && (
                <>
                  <div className="mb-8 flex items-baseline justify-between">
                    <h2
                      className={`${serif.className} text-5xl font-medium text-white`}
                    >
                      Create account.
                    </h2>
                    <Link
                      href="/login"
                      className="group relative text-xs font-bold uppercase tracking-[0.22em] text-white/90 transition hover:text-[#c4934e]"
                    >
                      <span className="relative z-10">Login</span>
                      <span className="absolute bottom-[-4px] left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
                    </Link>
                  </div>

                  {/* PRIVACY REASSURANCE — placed FIRST, load-bearing trust */}
                  <div className="mb-8 border border-[#c4934e]/30 bg-black/20 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Lock size={12} className="text-[#c4934e]" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#c4934e]">
                        Private By Default
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/80">
                      Your profile starts private. Only you see your journal.
                      You decide what — if anything — to share with other
                      members.
                    </p>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-5">
                    <Field
                      label="Full Name"
                      type="text"
                      value={fullName}
                      setValue={setFullName}
                      placeholder="Your name (real or chosen)"
                    />
                    <Field
                      label="Email"
                      type="email"
                      value={email}
                      setValue={setEmail}
                      placeholder="you@example.com"
                    />
                    <div>
                      <Field
                        label="Password"
                        type="password"
                        value={password}
                        setValue={setPassword}
                        placeholder="Create password"
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
                      <Field
                        label="Confirm Password"
                        type="password"
                        value={confirmPassword}
                        setValue={setConfirmPassword}
                        placeholder="Confirm password"
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

                    {/* ATTESTATIONS — required before signup */}
                    <div className="mt-6 space-y-4 border border-[#c4934e]/30 bg-black/20 px-5 py-5">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={genderAttested}
                          onChange={(e) => setGenderAttested(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-[#c4934e]"
                        />
                        <span className="text-xs leading-relaxed text-white/85">
                          <span className="font-semibold text-white">
                            I identify as a man.
                          </span>{" "}
                          Stone Harbor is intentionally a community space for
                          men.
                        </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-[#c4934e]"
                        />
                        <span className="text-xs leading-relaxed text-white/85">
                          I have read and agree to the{" "}
                          <Link
                            href="/terms"
                            target="_blank"
                            className="font-semibold text-[#c4934e] underline-offset-4 hover:underline"
                          >
                            Terms of Service
                          </Link>{" "}
                          and{" "}
                          <Link
                            href="/privacy"
                            target="_blank"
                            className="font-semibold text-[#c4934e] underline-offset-4 hover:underline"
                          >
                            Privacy Policy
                          </Link>
                          .
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !genderAttested || !termsAccepted}
                      className="group relative mt-6 flex w-full items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432] disabled:opacity-60"
                    >
                      {loading && (
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
                        {loading ? "Creating Account…" : "Begin Today"}
                      </span>
                      <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
                    </button>
                  </form>

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
                </>
              )}
            </div>
          </motion.section>
        </div>
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

function Field({
  label,
  type,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  setValue: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="w-full">
      <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e]">
        {label}
      </label>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-[52px] w-full border border-white/20 bg-black/30 px-4 text-base text-white outline-none transition placeholder:text-white/40 focus:border-[#c4934e] focus:bg-black/45 focus:ring-2 focus:ring-[#c4934e]/30"
      />
    </div>
  );
}

/* ──────────────────────────────────────────────
   CLOSED PANEL — Shown when registration_open = false.
   Lets visitors leave their email so we can notify
   them when the gates open.
   ────────────────────────────────────────────── */

function ClosedPanel({
  headline,
  message,
  waitlistEnabled,
  waitlistEmail,
  waitlistFirstName,
  setWaitlistEmail,
  setWaitlistFirstName,
  submitting,
  done,
  error,
  onSubmit,
}: {
  headline: string;
  message: string;
  waitlistEnabled: boolean;
  waitlistEmail: string;
  waitlistFirstName: string;
  setWaitlistEmail: (v: string) => void;
  setWaitlistFirstName: (v: string) => void;
  submitting: boolean;
  done: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div>
      <div className="mb-8 flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#c4934e]">
          Not Yet Open
        </p>
        <Link
          href="/login"
          className="group relative text-xs font-bold uppercase tracking-[0.22em] text-white/90 transition hover:text-[#c4934e]"
        >
          <span className="relative z-10">Login</span>
          <span className="absolute bottom-[-4px] left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
        </Link>
      </div>

      <h2
        className={`${serif.className} text-5xl font-medium leading-[1.05] text-white md:text-6xl`}
      >
        {headline}
      </h2>

      <p className="mt-6 text-base leading-relaxed text-white/80">{message}</p>

      <div className="mt-8 h-px w-16 bg-[#c4934e]" />

      {!waitlistEnabled ? (
        <p className="mt-8 text-sm leading-relaxed text-white/65">
          Existing members can{" "}
          <Link
            href="/login"
            className="font-semibold text-[#c4934e] underline-offset-4 transition hover:text-white hover:underline"
          >
            sign in here
          </Link>
          .
        </p>
      ) : done ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mt-10 border border-[#c4934e]/40 bg-[#a9793d]/10 px-6 py-6 backdrop-blur-sm"
        >
          <p className={`${serif.className} text-2xl italic text-[#c4934e]`}>
            We have you.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            We&apos;ll send a single email when Stone Harbor opens. No
            newsletters, no marketing — just one note when the door opens.
          </p>
        </motion.div>
      ) : (
        <form onSubmit={onSubmit} className="mt-10 space-y-5">
          <Field
            label="First Name (optional)"
            type="text"
            value={waitlistFirstName}
            setValue={setWaitlistFirstName}
            placeholder="What should we call you?"
          />
          <Field
            label="Email"
            type="email"
            value={waitlistEmail}
            setValue={setWaitlistEmail}
            placeholder="you@example.com"
          />

          <button
            type="submit"
            disabled={submitting}
            className="group relative mt-2 flex w-full items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432] disabled:opacity-60"
          >
            {submitting && (
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
              {submitting ? "Saving…" : "Tell Me When You Open"}
            </span>
            <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
          </button>

          {error && (
            <p className="text-center text-sm font-semibold text-red-200">
              {error}
            </p>
          )}

          <p className="text-center text-xs leading-relaxed text-white/55">
            One email when we open. Nothing else. Ever.
          </p>
        </form>
      )}
    </div>
  );
}
