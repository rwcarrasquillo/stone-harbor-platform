"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
import { UnsavedChangesModal } from "@/app/components/unsavedChangesModal";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
const GOLD_DEEP = "#a9793d";

type Warning = {
  id: string;
  message_to_member: string;
  issued_at: string;
  rescinded_at: string | null;
  severity: string;
};

type Profile = {
  display_name: string | null;
  warning_count: number;
  suspended_at: string | null;
  suspended_reason: string | null;
  suspension_appeal_text: string | null;
  suspension_appeal_submitted_at: string | null;
};

/**
 * Stone Harbor — Suspended Account screen.
 *
 * Shown when a logged-in user's profile.suspended_at is set. They can:
 *   • See the reason for the suspension and read their warnings,
 *   • Submit a written appeal (admin reviews via the admin console),
 *   • Sign out.
 *
 * If suspended_at is cleared (admin rescinded), they are redirected to
 * the dashboard on next visit.
 */
export default function SuspendedPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [appealText, setAppealText] = useState("");
  const [originalAppealText, setOriginalAppealText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Unsaved-changes guard for the appeal composer. Dirty only when the
  // text has been modified from the last-saved version (so existing
  // appeals don't trigger the warning on page load). Cleared after
  // submission re-syncs originalAppealText to appealText.
  const appealDirty = appealText !== originalAppealText && !submitted;
  const appealUnsaved = useUnsavedChangesWarning(appealDirty);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select(
          "display_name, warning_count, suspended_at, suspended_reason, suspension_appeal_text, suspension_appeal_submitted_at",
        )
        .eq("id", user.id)
        .single();
      // If they are NOT suspended, this page shouldn't show — redirect home.
      // Soft navigation is fine here; the user is still authenticated.
      if (!prof?.suspended_at) {
        router.push("/dashboard");
        return;
      }
      setProfile(prof as Profile);
      if (prof.suspension_appeal_text) {
        setAppealText(prof.suspension_appeal_text);
        setOriginalAppealText(prof.suspension_appeal_text);
        setSubmitted(!!prof.suspension_appeal_submitted_at);
      }

      const { data: warns } = await supabase
        .from("member_warnings")
        .select("id, message_to_member, issued_at, rescinded_at, severity")
        .eq("member_id", user.id)
        .order("issued_at", { ascending: false });
      setWarnings((warns ?? []) as Warning[]);
      setLoading(false);
    }
    load();
  }, []);

  async function submitAppeal() {
    if (!appealText.trim()) return;
    setSubmitting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({
        suspension_appeal_text: appealText.trim(),
        suspension_appeal_submitted_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    // Sync the last-saved snapshot so isDirty becomes false and the
    // unsaved-changes guard releases.
    setOriginalAppealText(appealText.trim());
    setSubmitting(false);
    setSubmitted(true);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading || !profile) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7]`}
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-stone-500">
          Loading…
        </p>
      </main>
    );
  }

  const activeWarnings = warnings.filter((w) => !w.rescinded_at);

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] text-stone-900`}
    >
      <InactivityGate />
      <header className="border-b border-stone-200 bg-white/40 px-6 py-5 backdrop-blur-sm md:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Men&apos;s Mental Wellness
            </span>
          </Link>
          <button
            onClick={signOut}
            className="text-xs font-bold uppercase tracking-[0.22em] text-stone-600 transition hover:text-[#a9793d]"
          >
            Sign Out
          </button>
        </div>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mx-auto max-w-3xl px-6 py-16 md:px-8"
      >
        <div
          className="border-l-[3px] bg-white px-6 py-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
          style={{ borderLeftColor: "#b14a3a" }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#b14a3a]">
            Account Suspended
          </p>
          <h1
            className={`${serif.className} mt-3 text-4xl font-medium leading-tight md:text-5xl`}
          >
            {profile.display_name
              ? `${profile.display_name.split(" ")[0]}, your account is paused.`
              : "Your account is paused."}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-stone-700">
            {profile.suspended_reason === "three_warnings"
              ? "Your account has reached three active warnings. While suspended you can read your warning history and submit an appeal. You cannot post, journal, or message during this time."
              : "Your account has been suspended by an administrator for a serious violation of our Terms. Please review the warning history below and submit an appeal if you believe this was in error."}
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.22em] text-stone-500">
            Suspended on{" "}
            {profile.suspended_at &&
              new Date(profile.suspended_at).toLocaleString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
          </p>
        </div>

        {/* WARNING HISTORY */}
        <section className="mt-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
            Warning History
          </p>
          <h2
            className={`${serif.className} mt-3 text-2xl font-medium text-stone-900`}
          >
            What we&apos;ve recorded.
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {activeWarnings.length} active ·{" "}
            {warnings.length - activeWarnings.length} rescinded
          </p>

          {warnings.length === 0 ? (
            <p className="mt-6 text-sm text-stone-500">
              No warnings on record.
            </p>
          ) : (
            <ul className="mt-6 space-y-4">
              {warnings.map((w, i) => (
                <li
                  key={w.id}
                  className={`border bg-white px-5 py-4 ${
                    w.rescinded_at ? "opacity-60 line-through" : ""
                  }`}
                  style={{
                    borderColor: w.rescinded_at ? "#e7e5e4" : "#a9793d",
                    borderLeftWidth: "3px",
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                    Warning {warnings.length - i} ·{" "}
                    {new Date(w.issued_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {w.rescinded_at && " · RESCINDED"}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-800">
                    {w.message_to_member}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* APPEAL */}
        <section className="mt-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
            Appeal
          </p>
          <h2
            className={`${serif.className} mt-3 text-2xl font-medium text-stone-900`}
          >
            {submitted
              ? "Your appeal is with us."
              : "Tell us what we should know."}
          </h2>

          {submitted ? (
            <div className="mt-6 border-l-[3px] border-[#586558] bg-white px-5 py-4">
              <p className="text-sm leading-relaxed text-stone-700">
                Your appeal was submitted on{" "}
                {profile.suspension_appeal_submitted_at &&
                  new Date(
                    profile.suspension_appeal_submitted_at,
                  ).toLocaleString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                . A human will review it. If we rescind enough warnings to bring
                you below three, your account is restored automatically.
              </p>
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.22em] text-stone-500 hover:text-[#a9793d]">
                  Read your appeal
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                  {profile.suspension_appeal_text}
                </p>
              </details>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-stone-600">
                What context should the moderator know about these warnings? Be
                specific. You will not be shamed for honesty.
              </p>
              <textarea
                value={appealText}
                onChange={(e) => setAppealText(e.target.value)}
                rows={8}
                maxLength={4000}
                placeholder="What happened, from your side."
                className="mt-4 w-full border border-stone-300 bg-white px-4 py-3 text-sm leading-relaxed text-stone-800 focus:border-[#a9793d] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-stone-500">
                {appealText.length} / 4000
              </p>
              <button
                onClick={submitAppeal}
                disabled={!appealText.trim() || submitting}
                className="mt-4 bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit Appeal"}
              </button>
            </>
          )}
        </section>

        <section className="mt-12 border-t border-stone-200 pt-8">
          <p className="text-xs leading-relaxed text-stone-500">
            If you&apos;re in crisis, call or text{" "}
            <span className="font-bold" style={{ color: GOLD_DEEP }}>
              988
            </span>{" "}
            — 24/7. Free. Confidential. This applies regardless of your account
            status.
          </p>
        </section>
      </motion.section>
      <UnsavedChangesModal
        open={appealUnsaved.showModal}
        onStay={appealUnsaved.cancelNavigation}
        onLeave={appealUnsaved.confirmNavigation}
        bodyLabel="your appeal"
      />
    </main>
  );
}
