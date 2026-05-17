"use client";

import { useEffect, useState } from "react";
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

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(
    "Preparing secure password recovery...",
  );

  useEffect(() => {
    async function prepareRecoverySession() {
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
            setMessage(error.message);
            return;
          }

          setReady(true);
          setMessage("");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();

      if (data.session) {
        setReady(true);
        setMessage("");
        return;
      }

      setMessage(
        "Password reset session was not found. Please request a new reset link.",
      );
    }

    prepareRecoverySession();
  }, []);

  async function handleUpdatePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!ready) {
      setMessage(
        "Password reset session is not ready. Please request a new reset link.",
      );
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({ password });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.auth.signOut();

    setPassword("");
    setConfirmPassword("");
    setMessage("Password updated successfully. You may now log in.");
  }

  return (
    <main
      className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7] px-4 py-10 text-stone-900`}
    >
      <form
        onSubmit={handleUpdatePassword}
        className="w-full max-w-md border border-stone-200 bg-white p-8 shadow-[0_20px_70px_rgba(0,0,0,0.08)]"
      >
        <p className="mb-8 text-xs font-bold uppercase tracking-[0.35em] text-[#a9793d]">
          Stone Harbor
        </p>

        <h1 className={`${serif.className} text-5xl font-medium leading-tight`}>
          Create new password.
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-stone-600">
          Enter and confirm your new password to restore access to your private
          harbor.
        </p>

        <label className="mt-8 block text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
          New Password
        </label>

        <input
          required
          type="password"
          minLength={8}
          value={password}
          disabled={!ready || saving}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimum 8 characters"
          className="mt-3 h-12 w-full border border-stone-300 bg-white px-4 text-sm outline-none placeholder:text-stone-400 focus:border-[#a9793d] disabled:opacity-60"
        />

        <label className="mt-6 block text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
          Confirm Password
        </label>

        <input
          required
          type="password"
          minLength={8}
          value={confirmPassword}
          disabled={!ready || saving}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter password"
          className="mt-3 h-12 w-full border border-stone-300 bg-white px-4 text-sm outline-none placeholder:text-stone-400 focus:border-[#a9793d] disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!ready || saving}
          className="mt-8 w-full border border-[#a9793d] bg-[#a9793d] px-6 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Update Password"}
        </button>

        {message && (
          <div className="mt-5 border border-stone-200 bg-[#f8f4ed] px-4 py-3 text-sm font-medium text-stone-700">
            {message}
          </div>
        )}

        <Link
          href="/login"
          className="mt-6 block text-center text-sm font-semibold text-[#a9793d] transition hover:text-[#8d6432]"
        >
          Back to login
        </Link>
      </form>
    </main>
  );
}
