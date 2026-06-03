"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — Reusable Flag Button
 *
 * Drop this anywhere a member can report content. It opens a small modal
 * with reason selection + optional notes, writes to `public.content_flags`,
 * and disables itself after submission.
 *
 * Usage:
 *   <FlagButton
 *     contentType="post"
 *     contentId={post.id}
 *     targetUserId={post.user_id}
 *   />
 *
 * Flags go to the admin review queue (reviewed in the separate
 * stone-harbor-admin app's /moderation route). They never
 * auto-action — admin reviews and decides dismiss / warn / suspend.
 */

export type FlagContentType =
  | "post"
  | "comment"
  | "message"
  | "journal"
  | "profile"
  | "other";

const REASON_OPTIONS: { value: string; label: string; description: string }[] =
  [
    {
      value: "harassment",
      label: "Harassment or threats",
      description: "Targeted intimidation, stalking, or threatening behavior.",
    },
    {
      value: "hate_speech",
      label: "Hate speech",
      description:
        "Content attacking someone based on identity or group membership.",
    },
    {
      value: "sexual_content",
      label: "Sexual content",
      description:
        "Explicit sexual material or solicitations. Stone Harbor is not a dating space.",
    },
    {
      value: "self_harm_promotion",
      label: "Encouraging self-harm",
      description:
        "Content that encourages or instructs others in self-harm or suicide.",
    },
    {
      value: "spam",
      label: "Spam or commercial",
      description: "Repetitive, irrelevant, or promotional content.",
    },
    {
      value: "misrepresentation",
      label: "Misrepresentation",
      description:
        "Account appears to be misrepresenting identity or eligibility.",
    },
    {
      value: "other",
      label: "Something else",
      description: "Add a note below explaining the concern.",
    },
  ];

export function FlagButton({
  contentType,
  contentId,
  targetUserId,
  variant = "icon",
  className = "",
}: {
  contentType: FlagContentType;
  contentId?: string;
  targetUserId?: string;
  variant?: "icon" | "link";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitFlag() {
    if (!reason) {
      setError("Pick a reason first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be signed in to flag content.");
      setSubmitting(false);
      return;
    }
    const { error: dbErr } = await supabase.from("content_flags").insert({
      flagger_id: user.id,
      content_type: contentType,
      content_id: contentId ?? null,
      target_user_id: targetUserId ?? null,
      reason,
      notes: notes.trim() || null,
      status: "pending",
    });
    setSubmitting(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setDone(true);
  }

  function reset() {
    setOpen(false);
    setReason("");
    setNotes("");
    setError(null);
    // Keep `done` true so a re-open from the same button still shows
    // the "thanks for reporting" state for the lifetime of this mount.
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={done}
        title={done ? "Already reported" : "Report this"}
        className={
          variant === "icon"
            ? `inline-flex h-7 w-7 items-center justify-center rounded-none border border-transparent text-stone-400 transition hover:border-stone-300 hover:text-[#a9793d] disabled:opacity-40 ${className}`
            : `text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500 transition hover:text-[#a9793d] disabled:opacity-40 ${className}`
        }
      >
        {variant === "icon" ? (
          /* simple flag glyph in our 24×24 line style */
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 22V4" />
            <path d="M4 4h13l-2 4 2 4H4" />
          </svg>
        ) : done ? (
          "Reported"
        ) : (
          "Report"
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 px-4 backdrop-blur-sm md:items-center"
            onClick={reset}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden border border-stone-200 bg-[#f8f4ed] shadow-2xl"
            >
              <div
                className="border-l-[3px] px-6 py-5"
                style={{ borderLeftColor: "#a9793d" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#a9793d]">
                  Report Content
                </p>
                <h2 className="mt-2 text-xl font-medium text-stone-900">
                  {done ? "Thank you. We'll review it." : "What's the concern?"}
                </h2>
              </div>

              {done ? (
                <div className="px-6 pb-7 pt-2">
                  <p className="text-sm leading-relaxed text-stone-700">
                    Our moderation team will review this report. We don&apos;t
                    auto-action flags — a person reads every report and decides.
                    You can find the report in your account history.
                  </p>
                  <button
                    onClick={reset}
                    className="mt-6 border border-stone-300 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d]"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="px-6 pb-7 pt-2">
                  <p className="text-xs leading-relaxed text-stone-600">
                    Reports are reviewed by a human moderator. Pick the closest
                    reason — you can add detail below.
                  </p>

                  <div className="mt-5 space-y-2">
                    {REASON_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer items-start gap-3 border bg-white px-4 py-3 transition ${
                          reason === opt.value
                            ? "border-[#a9793d] bg-[#f8f0e3]"
                            : "border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        <input
                          type="radio"
                          name="flag-reason"
                          value={opt.value}
                          checked={reason === opt.value}
                          onChange={() => setReason(opt.value)}
                          className="mt-1 h-4 w-4 accent-[#a9793d]"
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-semibold text-stone-800">
                            {opt.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">
                            {opt.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <label className="mt-5 block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.22em] text-stone-500">
                      Notes (optional)
                    </span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Anything else the moderator should know."
                      className="w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:border-[#a9793d] focus:outline-none"
                    />
                  </label>

                  {error && (
                    <p className="mt-3 text-xs font-semibold text-red-700">
                      {error}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      onClick={submitFlag}
                      disabled={submitting || !reason}
                      className="bg-[#a9793d] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-50"
                    >
                      {submitting ? "Sending…" : "Send Report"}
                    </button>
                    <button
                      onClick={reset}
                      className="border border-stone-300 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:border-[#a9793d]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
