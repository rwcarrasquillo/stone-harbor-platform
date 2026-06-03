"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
import { Compass, Lock } from "@/app/components/icons";
import { UserPlus, LogIn } from "lucide-react";
import { RotatingNatureBackdrop } from "@/app/components/rotatingNatureBackdrop";
import { PasswordInput } from "@/app/components/passwordInput";
import { LanguagePicker } from "@/app/components/languagePicker";

// Brand system — matches home, dashboard, journal
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setIsError(false);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage(error.message);
      setIsError(true);
      setLoading(false);
      return;
    }
    setMessage("Welcome back. Returning to your harbor…");
    setIsError(false);
    setLoading(false);
    setTimeout(() => {
      router.push("/dashboard");
    }, 700);
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}
    >
      {/* Base dark layer */}
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />

      {/* Slow-drifting forest — matches home */}
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

      {/* Atmospheric gradient overlay */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/65 via-black/35 to-black/80" />

      {/* Dawn glow — warm focal point */}
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
            id="login-contour"
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
        <rect width="100%" height="100%" fill="url(#login-contour)" />
      </svg>

      {/* Film grain */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.06] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="login-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#login-grain)" />
      </svg>

      {/* TOP BAR */}
      <header className="relative z-30 px-4 py-3 md:px-10 md:py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#c4934e] transition group-hover:text-white md:text-base md:tracking-[0.28em]">
              ← Stone Harbor
            </span>
            <span className="mt-1 hidden text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#c4934e]/70 md:block">
              Men&apos;s Mental Wellness
            </span>
          </Link>
          <Link
            href="/register"
            aria-label="Create account"
            className="group relative overflow-hidden rounded-none border border-[#c4934e] p-2 text-[#c4934e] transition hover:bg-[#c4934e] hover:text-black md:px-5 md:py-2.5"
          >
            <UserPlus size={18} className="md:hidden" aria-hidden="true" />
            <span className="relative z-10 hidden text-xs font-bold uppercase tracking-[0.22em] md:inline">
              Create Account
            </span>
          </Link>
        </div>
      </header>

      {/* MAIN */}
      <section className="relative z-20 flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-4 md:px-10 md:py-8">
        <div className="flex w-full max-w-[1320px] flex-col gap-5 md:flex-row md:items-stretch md:justify-center md:gap-8">
          {/* CREAM ASIDE — return language */}
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative flex w-full flex-col justify-center overflow-hidden rounded-none border border-stone-300 bg-[#f3efe7] px-6 py-8 text-stone-900 shadow-[0_35px_120px_rgba(0,0,0,0.32)] md:w-[46%] md:px-16 md:py-20"
          >
            {/* Rotating nature backdrop — "returning to the harbor" imagery,
                very low opacity so cream + serif text remain dominant. */}
            <RotatingNatureBackdrop
              images={[
                "/nature/coastal-cliff-serene-sunset.jpg",
                "/nature/ocean-cliff-foggy-day.jpg",
                "/nature/misty-forest-sunrise-soft-light.jpg",
              ]}
              opacity={0.1}
              rotationMs={15000}
              imageFilter="sepia(0.2)"
            />

            {/* paper grain inside the cream */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04] mix-blend-multiply"
              xmlns="http://www.w3.org/2000/svg"
            >
              <filter id="aside-grain">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.85"
                  numOctaves="2"
                />
                <feColorMatrix type="saturate" values="0" />
              </filter>
              <rect width="100%" height="100%" filter="url(#aside-grain)" />
            </svg>

            <div className="relative">
              <div className="flex items-center gap-2">
                <Compass size={14} className="text-[#a9793d]" />
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#a9793d] md:text-xs">
                  Return
                </p>
              </div>
              <h1
                className={`${serif.className} mt-3 text-3xl font-semibold leading-[1] md:mt-6 md:text-7xl md:leading-[0.95] lg:text-8xl`}
              >
                The harbor
                <br />
                remembers you.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-stone-600 md:mt-10 md:text-lg">
                Whatever happened since you were last here — you&apos;re welcome
                to return. No catching up required.
              </p>
              <p
                className={`${serif.className} mt-4 text-lg italic leading-snug text-[#a9793d] md:mt-8 md:text-2xl`}
              >
                Your work is waiting.
              </p>

              <div className="mt-6 h-px w-16 bg-[#a9793d] md:mt-12" />

              <div className="mt-4 flex items-start gap-2 md:mt-8">
                <Lock size={14} className="mt-0.5 shrink-0 text-stone-500" />
                <p className="text-[11px] leading-relaxed text-stone-500 md:text-xs">
                  Your reflections are encrypted. Yours alone. Never sold. Never
                  shared.
                </p>
              </div>
            </div>
          </motion.aside>

          {/* DARK GLASS FORM PANEL */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="relative w-full overflow-hidden rounded-none border border-[#c4934e]/60 bg-black/35 px-6 py-8 shadow-[0_35px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl md:w-[52%] md:px-14 md:py-14"
          >
            {/* subtle warm wash inside the glass */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,147,78,0.10) 0%, transparent 60%)",
              }}
            />

            <div className="relative z-10 mx-auto max-w-[600px]">
              <div className="mb-6 flex items-baseline justify-between md:mb-10">
                <h2
                  className={`${serif.className} text-3xl font-medium text-white md:text-5xl`}
                >
                  {t("title")}
                </h2>
                <Link
                  href="/register"
                  className="group relative text-[11px] font-bold uppercase tracking-[0.22em] text-white/90 transition hover:text-[#c4934e] md:text-xs"
                >
                  <span className="relative z-10">Register</span>
                  <span className="absolute bottom-[-4px] left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
                </Link>
              </div>

              <form onSubmit={handleLogin} className="space-y-4 md:space-y-6">
                <Field
                  label={t("labels.email")}
                  type="email"
                  value={email}
                  setValue={setEmail}
                  placeholder={t("placeholders.email")}
                />
                <Field
                  label={t("labels.password")}
                  type="password"
                  value={password}
                  setValue={setPassword}
                  placeholder={t("placeholders.password")}
                />

                <div className="flex justify-end pt-1">
                  <Link
                    href="/forgot-password"
                    className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#c4934e] transition hover:text-white md:text-xs"
                  >
                    {t("actions.forgot")}
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative mt-5 flex w-full items-center justify-center gap-3 overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432] disabled:opacity-60 md:mt-8 md:px-8 md:py-5 md:text-sm md:tracking-[0.25em]"
                >
                  {loading ? (
                    <motion.span
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="h-2 w-2 rounded-full bg-white"
                    />
                  ) : (
                    <LogIn size={16} aria-hidden="true" />
                  )}
                  <span className="relative z-10">
                    {loading ? t("actions.submitting") : t("actions.submit")}
                  </span>
                  <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
                </button>
              </form>

              <p className="mx-auto mt-6 max-w-lg text-center text-xs leading-relaxed text-white/80 md:mt-10 md:text-sm">
                {t("actions.joinPrompt")}{" "}
                <Link
                  href="/register"
                  className="font-semibold text-[#c4934e] underline-offset-4 transition hover:text-white hover:underline"
                >
                  {t("actions.joinLink")}
                </Link>
                .
              </p>

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
        </div>
      </section>

      {/* FOOTER — 988 crisis line, especially important on auth pages */}
      <footer className="relative z-10 mt-4 border-t border-white/10 bg-black/40 px-4 py-5 backdrop-blur md:mt-8 md:px-10 md:py-8">
        <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-3 md:items-center md:gap-4">
          <p
            className={`${serif.className} text-sm italic text-white/70 md:text-base md:text-left`}
          >
            The harbor is patient.
          </p>
          <p className="text-center text-[9px] font-bold uppercase tracking-[0.28em] text-white/50 md:text-[10px]">
            Stone Harbor · Men&apos;s Mental Wellness
          </p>
          <p className="text-left text-xs leading-relaxed text-white/80 md:text-right md:text-sm">
            <span className="block text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">
              If You Are In Crisis
            </span>
            <span className="mt-1 block">
              Call or text <span className="font-bold text-[#c4934e]">988</span>{" "}
              — 24/7. Free. Confidential.
            </span>
          </p>
        </div>
        {/* Language picker — quiet, footer-aligned. Switches between
            EN and ES; the URL updates to /es/login or /login. */}
        <div className="mx-auto mt-4 flex max-w-7xl justify-center md:mt-6">
          <LanguagePicker />
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
  // Same dark-glass surface across email + password — only the input
  // implementation differs so the password variant can host its eye
  // toggle without breaking the layout for email.
  const inputClass =
    "h-[52px] w-full border border-white/20 bg-black/30 px-4 text-base text-white outline-none transition placeholder:text-white/40 focus:border-[#c4934e] focus:bg-black/45 focus:ring-2 focus:ring-[#c4934e]/30";
  return (
    <div className="w-full">
      <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e]">
        {label}
      </label>
      {type === "password" ? (
        <PasswordInput
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      ) : (
        <input
          required
          type={type}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}
