"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMessage("");
    setSending(true);

    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSending(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password reset link sent. Please check your email.");
  }

  return (
    <main
      className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7] px-4 py-10 text-stone-900`}
    >
      <form
        onSubmit={handleResetPassword}
        className="w-full max-w-md border border-stone-200 bg-white p-8 shadow-[0_20px_70px_rgba(0,0,0,0.08)]"
      >
        <p className="mb-8 text-xs font-bold uppercase tracking-[0.35em] text-[#a9793d]">
          Stone Harbor
        </p>

        <h1
          className={`${serif.className} text-5xl font-medium leading-tight text-stone-900`}
        >
          Reset password.
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-stone-600">
          Enter your email address and we will send you a secure password reset
          link.
        </p>

        <label className="mt-8 block text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
          Email
        </label>

        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-3 h-12 w-full border border-stone-300 bg-white px-4 text-sm outline-none placeholder:text-stone-400 focus:border-[#a9793d]"
        />

        <button
          type="submit"
          disabled={sending}
          className="mt-6 w-full border border-[#a9793d] bg-[#a9793d] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send Reset Link"}
        </button>

        {message && (
          <div className="mt-5 border border-stone-200 bg-[#f8f4ed] px-4 py-3 text-sm font-medium text-stone-700">
            {message}
          </div>
        )}

        <Link
          href="/login"
          className="mt-6 block text-center text-sm font-semibold text-[#a9793d] hover:text-[#8d6432]"
        >
          Back to login
        </Link>
      </form>
    </main>
  );
}
