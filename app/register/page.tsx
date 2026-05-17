"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setMessage(error.message);
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
    }

    setMessage("Account created. Redirecting...");
    setLoading(false);

    setTimeout(() => {
      router.push("/welcome");
    }, 1000);
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}
    >
      {/* BACKGROUND IMAGE */}
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
      />

      {/* GLOBAL OVERLAY */}
      <div className="fixed inset-0 bg-black/20" />

      <section className="relative z-10 flex min-h-screen items-center justify-center px-8 py-8">
        <div className="flex w-full max-w-[1420px] flex-col gap-8 md:flex-row md:items-stretch md:justify-center">
          {/* LEFT TILE */}
          <aside className="flex min-h-[760px] w-full flex-col justify-center rounded-md bg-[#f3efe7] px-12 py-16 text-stone-900 shadow-[0_30px_100px_rgba(0,0,0,0.35)] md:w-[46%] md:px-20">
            <p className="mb-12 text-sm font-black uppercase tracking-[0.5em] text-[#b57b34]">
              Stone Harbor
            </p>

            <h1
              className={`${serif.className} text-7xl font-semibold leading-none md:text-8xl lg:text-9xl`}
            >
              Join now.
            </h1>

            <p className="mt-12 max-w-[520px] text-2xl leading-relaxed text-stone-600">
              Begin your private recovery journey with structure, clarity, and
              strength.
            </p>

            <ul className="mt-16 space-y-4 text-xl leading-relaxed text-stone-900">
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Private member dashboard
              </li>
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Personal healing journal
              </li>
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Recovery roadmap
              </li>
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Future member community
              </li>
            </ul>
          </aside>

          {/* RIGHT TILE */}
          <section className="relative min-h-[760px] w-full overflow-hidden rounded-md border border-[#b57b34] bg-black/28 px-10 py-14 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl md:w-[52%] md:px-16">
            {/* TRANSPARENT BLACK GLASS TINT */}
            <div className="absolute inset-0 bg-black/35 backdrop-blur-xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40" />

            <div className="relative z-10 mx-auto max-w-[640px]">
              {/* HEADER */}
              <div className="mb-12 flex items-start justify-between">
                <h2 className="text-4xl font-light uppercase tracking-[0.55em] text-white">
                  Register
                </h2>

                <Link
                  href="/login"
                  className="pt-2 text-base font-bold uppercase tracking-[0.12em] text-white transition hover:text-[#d8a24a]"
                >
                  Login
                </Link>
              </div>

              {/* ANCHOR */}
              <div className="mb-10 flex items-center justify-start text-white/90">
                <span className="text-3xl">⚓</span>
              </div>

              {/* FORM */}
              <form onSubmit={handleRegister} className="space-y-5">
                <Field
                  label="Full Name"
                  type="text"
                  value={fullName}
                  setValue={setFullName}
                  placeholder="Your name"
                />

                <Field
                  label="Email"
                  type="email"
                  value={email}
                  setValue={setEmail}
                  placeholder="you@example.com"
                />

                <Field
                  label="Password"
                  type="password"
                  value={password}
                  setValue={setPassword}
                  placeholder="Create password"
                />

                <Field
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  setValue={setConfirmPassword}
                  placeholder="Confirm password"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-12 w-full rounded-none border border-[#b57b34] bg-black/25 px-8 py-5 text-base font-medium uppercase tracking-[0.22em] text-white transition hover:bg-black/40 disabled:opacity-60"
                >
                  {loading ? "Creating Account..." : "Create Account"}
                </button>
              </form>

              {/* TERMS */}
              <p className="mx-auto mt-12 max-w-lg text-center text-base leading-relaxed text-white">
                By creating an account, you agree to our{" "}
                <a href="/terms" className="underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" className="underline">
                  Privacy Policy
                </a>
                .
              </p>

              {/* MESSAGE */}
              {message && (
                <div className="mt-6 border border-[#b57b34]/60 bg-black/30 px-5 py-4 text-center text-sm font-semibold text-white">
                  {message}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
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
      <label className="mb-3 block text-sm font-semibold uppercase tracking-[0.35em] text-white">
        {label}
      </label>

      <input
        required
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-[48px] w-full border border-white/90 bg-black/25 px-4 text-xl text-white outline-none placeholder:text-white/60 focus:border-[#d8a24a]"
      />
    </div>
  );
}
