"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
import { Lock } from "@/app/components/icons";

export default function AdminLoginPage() {
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

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setMessage(authError.message);
      setIsError(true);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setMessage("Authentication failed.");
      setIsError(true);
      setLoading(false);
      return;
    }

    // Verify admin role. Non-admins get signed out immediately.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      setMessage("This account does not have admin privileges.");
      setIsError(true);
      setLoading(false);
      return;
    }

    setMessage("Admin verified. Entering the console…");
    setLoading(false);
    setTimeout(() => router.push("/admin"), 700);
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}
    >
      {/* Base dark layer */}
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />

      {/* Slow-drifting forest, slightly more muted than the member login */}
      <motion.div
        animate={{
          scale: [1, 1.06, 1],
          x: ["0%", "-1%", "0%"],
          y: ["0%", "1%", "0%"],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        className="fixed inset-0 z-0 bg-cover bg-center opacity-35 grayscale"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
      />

      {/* Deeper atmospheric overlay — admin pages run darker */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/75 via-black/55 to-black/85" />

      {/* Subtle warm focal point */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 50% 60%, rgba(196,147,78,0.15) 0%, rgba(196,147,78,0.04) 40%, transparent 75%)",
        }}
      />

      {/* Contour */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="adminlogin-contour"
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
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#adminlogin-contour)" />
      </svg>

      {/* Film grain */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.06] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="adminlogin-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#adminlogin-grain)" />
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
              Admin Console
            </span>
          </Link>
          <Link
            href="/login"
            className="text-xs font-bold uppercase tracking-[0.22em] text-white/60 transition hover:text-[#c4934e]"
          >
            Member Login →
          </Link>
        </div>
      </header>

      {/* MAIN */}
      <section className="relative z-20 flex min-h-[calc(100vh-200px)] items-center justify-center px-6 py-8 md:px-10">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative w-full max-w-md overflow-hidden border border-[#c4934e]/60 bg-black/45 px-8 py-12 shadow-[0_35px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl md:px-12"
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
            <div className="flex items-center gap-2">
              <Lock size={12} className="text-[#c4934e]" />
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#c4934e]">
                Restricted Access
              </p>
            </div>
            <h1
              className={`${serif.className} mt-4 text-4xl font-medium leading-tight md:text-5xl`}
            >
              Admin Console.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Sign in with an admin account.
            </p>

            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e]">
                  Admin Email
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
              <div>
                <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[#c4934e]">
                  Password
                </label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="h-[52px] w-full border border-white/20 bg-black/30 px-4 text-base text-white outline-none transition placeholder:text-white/40 focus:border-[#c4934e] focus:bg-black/45 focus:ring-2 focus:ring-[#c4934e]/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-6 flex w-full items-center justify-center gap-3 overflow-hidden border border-[#c4934e] bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition duration-300 hover:bg-[#8d6432] disabled:opacity-60"
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
                  {loading ? "Verifying…" : "Enter Console"}
                </span>
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

            <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-white/40">
              Non-admin sessions are signed out automatically
            </p>
          </div>
        </motion.section>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mt-8 border-t border-white/10 bg-black/50 px-6 py-6 backdrop-blur md:px-10">
        <div className="mx-auto max-w-7xl text-center">
          <p
            className={`${serif.className} text-sm italic text-white/60`}
          >
            The harbor is patient.
          </p>
        </div>
      </footer>
    </main>
  );
}
