"use client";

import { useState } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function JoinPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [recoveryPath, setRecoveryPath] = useState("clarity");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const { error } = await supabase.from("waitlist").insert({
      name,
      email,
      recovery_path: recoveryPath,
    });

    console.log("Supabase insert error:", error);

    if (error) {
      if (
        error.message?.toLowerCase().includes("duplicate") ||
        error.message?.toLowerCase().includes("unique")
      ) {
        setMessage("You are already on the Stone Harbor waitlist.");
      } else {
        setMessage(
          `Supabase error: ${
            error?.message || error?.code || "Unknown error. Check console."
          }`,
        );
      }

      setLoading(false);
      return;
    }

    setName("");
    setEmail("");
    setRecoveryPath("clarity");
    setMessage("Your first step is complete. Welcome to Stone Harbor.");
    setLoading(false);

    setTimeout(() => {
      window.location.href = "/start-here";
    }, 2500);
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
            Join the Harbor
          </p>

          <h1
            className={`${serif.className} text-6xl font-medium leading-tight md:text-7xl`}
          >
            Begin your recovery with one grounded step.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600">
            Join the early Stone Harbor waitlist. You’ll receive updates as we
            build recovery tools for clarity, calm, strength, and purpose.
          </p>

          <div className="mt-10 rounded-[2rem] bg-white/60 p-6 backdrop-blur-xl">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
              What Happens Next
            </p>

            <ul className="mt-4 space-y-3 text-stone-600">
              <li>• Join the private early access waitlist</li>
              <li>• Receive future recovery tools + assessments</li>
              <li>• Help shape Stone Harbor’s next evolution</li>
            </ul>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] bg-white/80 p-8 shadow-sm backdrop-blur-xl"
        >
          <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
            Name
          </label>

          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-6 w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
            placeholder="Your name"
          />

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
            Starting Point
          </label>

          <select
            value={recoveryPath}
            onChange={(e) => setRecoveryPath(e.target.value)}
            className="mb-8 w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
          >
            <option value="clarity">Clarity — I feel confused</option>
            <option value="calm">Calm — I feel overwhelmed</option>
            <option value="strength">Strength — I am ready to rebuild</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Joining..." : "Join Waitlist"}
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
