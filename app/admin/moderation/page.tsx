"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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

const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type Flag = {
  id: string;
  flagger_id: string | null;
  target_user_id: string | null;
  content_type: string;
  content_id: string | null;
  reason: string;
  notes: string | null;
  status: "pending" | "upheld" | "dismissed" | "auto_flagged";
  created_at: string;
  flagger_name?: string | null;
  target_name?: string | null;
  target_warning_count?: number | null;
  target_suspended?: boolean;
};

const REASON_LABEL: Record<string, string> = {
  harassment: "Harassment / threats",
  hate_speech: "Hate speech",
  sexual_content: "Sexual content",
  self_harm_promotion: "Encouraging self-harm",
  spam: "Spam / commercial",
  misrepresentation: "Misrepresentation",
  other: "Other",
};

/**
 * Stone Harbor — Admin Moderation Queue
 *
 * Lists pending (and historical) flags. Each flag exposes three actions:
 *   • Dismiss        — no member action; flag closes.
 *   • Issue Warning  — writes member_warnings; trigger bumps count and
 *                       auto-suspends at 3.
 *   • Suspend Now    — for severe violations: sets profiles.suspended_at
 *                       directly without warnings.
 *
 * Warnings include a member-visible message (transparency is the policy).
 */
export default function AdminModerationPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [authzError, setAuthzError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [activeFlag, setActiveFlag] = useState<Flag | null>(null);
  const [warningMessage, setWarningMessage] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [working, setWorking] = useState(false);

  async function init() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/admin/login";
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      setAuthzError("This account does not have admin access.");
      setLoading(false);
      return;
    }
    await loadFlags();
    setLoading(false);
  }

  async function loadFlags() {
    let q = supabase
      .from("content_flags")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    const flagRows = (data ?? []) as Flag[];

    // Hydrate display names + warning counts for the target user(s).
    const targetIds = Array.from(
      new Set(
        flagRows.map((f) => f.target_user_id).filter(Boolean) as string[],
      ),
    );
    const flaggerIds = Array.from(
      new Set(flagRows.map((f) => f.flagger_id).filter(Boolean) as string[]),
    );
    const allIds = Array.from(new Set([...targetIds, ...flaggerIds]));
    if (allIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, warning_count, suspended_at")
        .in("id", allIds);
      const byId = new Map(
        (profs ?? []).map((p) => [
          p.id as string,
          {
            name: (p.display_name as string | null) || "—",
            wc: (p.warning_count as number | null) ?? 0,
            sus: !!p.suspended_at,
          },
        ]),
      );
      for (const f of flagRows) {
        if (f.flagger_id) f.flagger_name = byId.get(f.flagger_id)?.name ?? null;
        if (f.target_user_id) {
          const t = byId.get(f.target_user_id);
          f.target_name = t?.name ?? null;
          f.target_warning_count = t?.wc ?? 0;
          f.target_suspended = t?.sus ?? false;
        }
      }
    }

    setFlags(flagRows);
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && !authzError) loadFlags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function openFlag(f: Flag) {
    setActiveFlag(f);
    setWarningMessage(
      `Hello — a member of the Stone Harbor moderation team reviewed a recent report regarding ${REASON_LABEL[f.reason]?.toLowerCase() ?? "your conduct"}. This is a formal warning. Three active warnings result in account suspension. If you believe this is in error, you can appeal from your profile settings.`,
    );
    setResolutionNotes("");
  }

  function closeFlag() {
    setActiveFlag(null);
    setWarningMessage("");
    setResolutionNotes("");
  }

  async function dismissFlag() {
    if (!activeFlag) return;
    setWorking(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("content_flags")
      .update({
        status: "dismissed",
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        resolution_notes: resolutionNotes.trim() || null,
      })
      .eq("id", activeFlag.id);
    setWorking(false);
    closeFlag();
    loadFlags();
  }

  async function issueWarning() {
    if (!activeFlag || !activeFlag.target_user_id) return;
    if (!warningMessage.trim()) return;
    setWorking(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // 1. Create the warning (trigger maintains count + auto-suspends at 3).
    await supabase.from("member_warnings").insert({
      member_id: activeFlag.target_user_id,
      evidence_flag_id: activeFlag.id,
      message_to_member: warningMessage.trim(),
      internal_notes: resolutionNotes.trim() || null,
      issued_by: user?.id ?? null,
      severity: "standard",
    });
    // 2. Mark the flag as upheld.
    await supabase
      .from("content_flags")
      .update({
        status: "upheld",
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        resolution_notes: resolutionNotes.trim() || null,
      })
      .eq("id", activeFlag.id);
    setWorking(false);
    closeFlag();
    loadFlags();
  }

  async function suspendNow() {
    if (!activeFlag || !activeFlag.target_user_id) return;
    if (
      !confirm(
        "Suspend this account immediately, bypassing warnings? Use only for severe violations.",
      )
    )
      return;
    setWorking(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("profiles")
      .update({
        suspended_at: new Date().toISOString(),
        suspended_reason: "admin_immediate",
      })
      .eq("id", activeFlag.target_user_id);
    await supabase
      .from("content_flags")
      .update({
        status: "upheld",
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
        resolution_notes:
          resolutionNotes.trim() ||
          "Immediate suspension for severe violation.",
      })
      .eq("id", activeFlag.id);
    setWorking(false);
    closeFlag();
    loadFlags();
  }

  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7]`}
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-stone-500">
          Loading moderation queue…
        </p>
      </main>
    );
  }

  if (authzError) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7] px-6`}
      >
        <div className="max-w-md text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
            Restricted
          </p>
          <h1 className={`${serif.className} mt-3 text-3xl text-stone-900`}>
            {authzError}
          </h1>
          <a
            href="/admin/login"
            className="mt-6 inline-block border border-[#a9793d] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white hover:bg-[#8d6432]"
          >
            Admin Login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] text-stone-900`}
    >
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-6 flex items-center justify-between">
          <a
            href="/admin"
            className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]"
          >
            ← Admin
          </a>
          <div className="inline-flex border border-stone-300 bg-white">
            <button
              onClick={() => setFilter("pending")}
              className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                filter === "pending"
                  ? "bg-[#a9793d] text-white"
                  : "text-stone-600 hover:text-[#a9793d]"
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`border-l border-stone-300 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                filter === "all"
                  ? "bg-[#a9793d] text-white"
                  : "text-stone-600 hover:text-[#a9793d]"
              }`}
            >
              All
            </button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
            Moderation
          </p>
          <h1
            className={`${serif.className} mt-3 text-5xl font-medium leading-tight md:text-6xl`}
          >
            The review queue.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">
            Member-initiated reports. Read the report, look at the target
            member&apos;s warning count, and decide. Never auto-action; always
            weigh context.
          </p>
        </motion.div>

        <div className="mt-8 overflow-hidden border border-stone-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
          {flags.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-stone-400">
              {filter === "pending"
                ? "No pending flags. The harbor is calm."
                : "No flags on record."}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {flags.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-start md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="border-l-[3px] bg-stone-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-700"
                        style={{
                          borderLeftColor:
                            f.status === "pending"
                              ? GOLD_DEEP
                              : f.status === "upheld"
                                ? "#b14a3a"
                                : MOSS,
                        }}
                      >
                        {f.status}
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                        {REASON_LABEL[f.reason] ?? f.reason}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {new Date(f.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p
                      className={`${serif.className} mt-2 text-lg italic text-stone-900`}
                    >
                      {f.content_type}
                      {f.content_id ? ` · ${f.content_id.slice(0, 8)}…` : ""}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">
                      <span className="font-semibold">Flagged by:</span>{" "}
                      {f.flagger_name ?? "—"}
                      {"  ·  "}
                      <span className="font-semibold">Target:</span>{" "}
                      {f.target_name ?? "—"}
                      {f.target_user_id && (
                        <>
                          {"  ·  "}
                          <span className="font-semibold">Warnings:</span>{" "}
                          {f.target_warning_count ?? 0} / 3
                          {f.target_suspended && (
                            <span className="ml-2 text-[#b14a3a] font-semibold">
                              · already suspended
                            </span>
                          )}
                        </>
                      )}
                    </p>
                    {f.notes && (
                      <p className="mt-2 text-sm leading-relaxed text-stone-700">
                        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                          Reporter note —{" "}
                        </span>
                        {f.notes}
                      </p>
                    )}
                  </div>
                  {f.status === "pending" && (
                    <div className="shrink-0">
                      <button
                        onClick={() => openFlag(f)}
                        className="border border-[#a9793d] bg-white px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#a9793d] transition hover:bg-[#a9793d] hover:text-white"
                      >
                        Review
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* REVIEW MODAL */}
      {activeFlag && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-4 backdrop-blur-sm md:items-center"
          onClick={closeFlag}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden border border-stone-200 bg-[#f8f4ed] shadow-2xl"
          >
            <div
              className="border-l-[3px] px-6 py-5"
              style={{ borderLeftColor: "#a9793d" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#a9793d]">
                Review Report
              </p>
              <h2 className="mt-2 text-2xl font-medium text-stone-900">
                {REASON_LABEL[activeFlag.reason]}
              </h2>
              {activeFlag.target_user_id && (
                <p className="mt-1 text-sm text-stone-600">
                  Target: <strong>{activeFlag.target_name ?? "—"}</strong>
                  {" · "}
                  Active warnings:{" "}
                  <strong>{activeFlag.target_warning_count ?? 0} / 3</strong>
                  {activeFlag.target_suspended && (
                    <span className="ml-2 text-[#b14a3a] font-semibold">
                      already suspended
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-5 px-6 pb-6 pt-3">
              {activeFlag.notes && (
                <div className="border border-stone-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                    Reporter note
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-stone-700">
                    {activeFlag.notes}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500">
                  Warning Message (visible to member)
                </p>
                <textarea
                  value={warningMessage}
                  onChange={(e) => setWarningMessage(e.target.value)}
                  rows={4}
                  className="mt-2 w-full border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800 focus:border-[#a9793d] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-stone-500">
                  This is the message the member will see in their account. Be
                  honest, specific, and brief. Reference the relevant Terms
                  section when relevant.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500">
                  Internal Notes (admin-only)
                </p>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={2}
                  placeholder="Context for future admins reviewing this account."
                  className="mt-2 w-full border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800 focus:border-[#a9793d] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={dismissFlag}
                  disabled={working}
                  className="border border-stone-300 bg-white px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d] disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  onClick={issueWarning}
                  disabled={
                    working ||
                    !warningMessage.trim() ||
                    !activeFlag.target_user_id
                  }
                  className="bg-[#a9793d] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-50"
                >
                  Issue Warning
                </button>
                <button
                  onClick={suspendNow}
                  disabled={working || !activeFlag.target_user_id}
                  className="border border-[#b14a3a] bg-white px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#b14a3a] transition hover:bg-[#b14a3a] hover:text-white disabled:opacity-50"
                >
                  Suspend Now
                </button>
                <button
                  onClick={closeFlag}
                  disabled={working}
                  className="ml-auto text-[11px] uppercase tracking-[0.22em] text-stone-500 transition hover:text-[#a9793d] disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
