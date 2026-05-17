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

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Login successful. Redirecting...");
    setLoading(false);

    setTimeout(() => {
      router.push("/dashboard");
    }, 700);
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-white`}
    >
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
      />

      <div className="fixed inset-0 bg-black/20" />

      <section className="relative z-10 flex min-h-screen items-center justify-center px-8 py-8">
        <div className="flex w-full max-w-[1420px] flex-col gap-8 md:flex-row md:items-stretch md:justify-center">
          <aside className="flex min-h-[760px] w-full flex-col justify-center rounded-md bg-[#f3efe7] px-12 py-16 text-stone-900 shadow-[0_30px_100px_rgba(0,0,0,0.35)] md:w-[46%] md:px-20">
            <p className="mb-12 text-sm font-black uppercase tracking-[0.5em] text-[#b57b34]">
              Stone Harbor
            </p>

            <h1
              className={`${serif.className} text-7xl font-semibold leading-none md:text-8xl lg:text-9xl`}
            >
              Welcome back.
            </h1>

            <p className="mt-12 max-w-[520px] text-2xl leading-relaxed text-stone-600">
              Return to your private space for clarity, calm, strength, and
              rebuilding.
            </p>

            <ul className="mt-16 space-y-4 text-xl leading-relaxed text-stone-900">
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Continue your recovery roadmap
              </li>
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Access your private journal
              </li>
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Update your member profile
              </li>
              <li>
                <span className="mr-4 text-[#b57b34]">•</span>
                Return to your dashboard
              </li>
            </ul>
          </aside>

          <section className="relative min-h-[760px] w-full overflow-hidden rounded-md border border-[#b57b34] bg-black/28 px-10 py-14 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl md:w-[52%] md:px-16">
            <div className="absolute inset-0 bg-black/35 backdrop-blur-xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40" />

            <div className="relative z-10 mx-auto max-w-[640px]">
              <div className="mb-12 flex items-start justify-between">
                <h2 className="text-4xl font-light uppercase tracking-[0.55em] text-white">
                  Login
                </h2>

                <Link
                  href="/register"
                  className="pt-2 text-base font-bold uppercase tracking-[0.12em] text-white transition hover:text-[#d8a24a]"
                >
                  Register
                </Link>
              </div>

              <div className="mb-10 flex items-center justify-start text-white/90">
                <span className="text-3xl">⚓</span>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
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
                  placeholder="Enter password"
                />

                <div className="flex justify-end pt-2">
                  <Link
                    href="/forgot-password"
                    className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f3d19b] transition hover:text-white"
                  >
                    Forgot Password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-12 w-full rounded-none border border-[#c4934e] bg-black/25 px-8 py-5 text-base font-medium uppercase tracking-[0.22em] text-white transition hover:bg-black/40 disabled:opacity-60"
                >
                  {loading ? "Signing In..." : "Sign In"}
                </button>
              </form>

              <p className="mx-auto mt-12 max-w-lg text-center text-base leading-relaxed text-white">
                New to Stone Harbor?{" "}
                <Link href="/register" className="underline">
                  Create your account
                </Link>
                .
              </p>

              {message && (
                <div className="mt-6 border border-[#c4934e]/70 bg-black/30 px-5 py-4 text-center text-sm font-semibold text-white">
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
      <label className="mb-3 block text-sm font-semibold uppercase tracking-[0.35em] text-[#f3d19b]">
        {label}
      </label>

      <input
        required
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-[48px] w-full border border-[#c4934e] bg-black/25 px-4 text-xl text-white outline-none placeholder:text-white/60 focus:border-[#d8a24a]"
      />
    </div>
  );
}
