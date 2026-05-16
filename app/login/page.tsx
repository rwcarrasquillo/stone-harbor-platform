"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(`Sign up error: ${error.message}`);
        setLoading(false);
        return;
      }

      setMessage(
        "Account created. Check your email to confirm your account, then log in.",
      );
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(`Login error: ${error.message}`);
      setLoading(false);
      return;
    }

    setMessage("Login successful. Redirecting...");
    setLoading(false);

    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1000);
  }

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] px-6 py-16 text-stone-900`}
    >
      <section className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:items-center">
        <div>
          <a
            href="/"
            className="mb-10 inline-block text-sm font-bold uppercase tracking-[0.3em] text-[#a9793d]"
          >
            ← Stone Harbor
          </a>

          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.4em] text-[#a9793d]">
            Member Access
          </p>

          <h1
            className={`${serif.className} text-6xl font-medium leading-tight md:text-7xl`}
          >
            Enter your private harbor.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600">
            Log in to access your protected member dashboard. This will become
            the home for your journal, recovery path, private resources, and
            future member features.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] bg-white/80 p-8 shadow-sm backdrop-blur-xl"
        >
          <div className="mb-8 flex rounded-full bg-[#f8f4ed] p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
              className={`w-1/2 rounded-full px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] transition ${
                mode === "login" ? "bg-[#a9793d] text-white" : "text-stone-600"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setMessage("");
              }}
              className={`w-1/2 rounded-full px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] transition ${
                mode === "signup" ? "bg-[#a9793d] text-white" : "text-stone-600"
              }`}
            >
              Sign Up
            </button>
          </div>

          <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
            Email
          </label>

          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-6 w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
            placeholder="you@example.com"
          />

          <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
            Password
          </label>

          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-8 w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
            placeholder="Minimum 6 characters"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
                ? "Login"
                : "Create Account"}
          </button>

          {message && (
            <div className="mt-6 rounded-2xl bg-[#f5f0e8] px-4 py-4 text-center">
              <p className="text-sm font-semibold text-stone-700">{message}</p>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
