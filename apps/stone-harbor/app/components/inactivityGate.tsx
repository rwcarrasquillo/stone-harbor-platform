"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { serif } from "@/lib/fonts";
import { useTheme } from "@/app/components/themeProvider";

/**
 * Stone Harbor — Inactivity Gate.
 *
 * Mounted on every authenticated page. Tracks human input (mousemove,
 * keypress, click, scroll, touch) and signs the member out after a
 * period of complete stillness. Brand-aligned warning copy appears
 * five minutes before the cutoff so a member who stepped away briefly
 * can confirm they're still here without losing their session.
 *
 * Why this matters for Stone Harbor specifically:
 *   The product holds extremely sensitive content — journal entries
 *   members have written in the middle of grief, divorce, recovery.
 *   Leaving a journal open on a coffee shop laptop while the member
 *   walks to the bathroom is a real privacy risk. A 30-minute timeout
 *   balances "don't kick him out while he's reading" with "don't leave
 *   him exposed if he steps away."
 *
 * Configuration:
 *   - TIMEOUT_MS   total stillness before forced signout
 *   - WARNING_MS   shown this many ms BEFORE the timeout (defaults to 5 min)
 *
 * The component renders no UI when the member is active. When the
 * warning threshold is crossed, a modal appears asking "are you still
 * here?" — any input dismisses the warning and resets the timer.
 *
 * Usage on a page (one line near the top of the JSX):
 *
 *   <InactivityGate />
 *
 * That's all. No props needed.
 */

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 5 * 60 * 1000; // shown 5 min before timeout (at 25 min)
const POLL_INTERVAL_MS = 30 * 1000; // check every 30 seconds

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

export function InactivityGate() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [warningShown, setWarningShown] = useState(false);
  // Lazy-init to 0; the real baseline is captured in the useEffect.
  // Initializing with Date.now() inline would call an impure function
  // during render and trip React 19's react-hooks/purity rule.
  const lastActivityRef = useRef<number>(0);

  useEffect(() => {
    // First mount — establish the activity baseline.
    lastActivityRef.current = Date.now();

    // Reset the activity timestamp on any human input.
    // Passive listeners — never block the user's input.
    function onActivity() {
      lastActivityRef.current = Date.now();
      // If the warning was showing, hide it immediately on activity.
      setWarningShown((shown) => (shown ? false : shown));
    }

    ACTIVITY_EVENTS.forEach((eventName) =>
      window.addEventListener(eventName, onActivity, { passive: true }),
    );

    // Poll every 30 seconds. Cheaper than reacting to every event;
    // accurate enough for minute-resolution thresholds.
    const interval = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;

      if (idleMs >= TIMEOUT_MS) {
        // Hard cut — sign out and redirect to login with a reason flag
        // so the login page can optionally show a "you were signed out
        // for inactivity" toast (out-of-scope here, just sets the param).
        window.clearInterval(interval);
        supabase.auth.signOut().finally(() => {
          window.location.href = "/login?reason=inactivity";
        });
        return;
      }

      if (idleMs >= TIMEOUT_MS - WARNING_MS) {
        setWarningShown(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      ACTIVITY_EVENTS.forEach((eventName) =>
        window.removeEventListener(eventName, onActivity),
      );
    };
  }, []);

  function dismissWarning() {
    lastActivityRef.current = Date.now();
    setWarningShown(false);
  }

  async function signOutNow() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <AnimatePresence>
      {warningShown && (
        <motion.div
          key="inactivity-warning"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 px-4 backdrop-blur-sm md:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inactivity-title"
        >
          {/* Theme-aware modal — picks dusk (dark) or sunlit (cream)
              palette so the warning doesn't feel like a foreign
              element pasted into the member's chosen environment.
              Same shape and copy, only colors change.
              Sunlit:
                bg cream (#f8f4ed), gold-deep accents (#a9793d),
                dark text. Reads as gold leaf on cream paper.
              Dusk:
                bg near-black (#0f0c0a), gold-bright accents
                (#c4934e), light text. Reads as warm lamp on a dark
                desk. */}
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.35 }}
            className={`w-full max-w-md border-l-[3px] px-6 py-6 shadow-2xl ${
              isDusk
                ? "border-[var(--sh-accent-gold-dusk)] bg-[#0f0c0a]"
                : "border-[var(--sh-accent-gold-sunlit)] bg-[var(--sh-bg-card-tinted)]"
            }`}
          >
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.32em] ${
                isDusk ? "text-[var(--sh-accent-gold-dusk)]" : "text-[var(--sh-accent-gold-sunlit)]"
              }`}
            >
              Are You Still Here?
            </p>
            <h2
              id="inactivity-title"
              className={`${serif.className} mt-3 text-2xl italic leading-snug md:text-3xl ${
                isDusk ? "text-white" : "text-stone-900"
              }`}
            >
              The harbor will pause your session shortly.
            </h2>
            <p
              className={`mt-4 text-sm leading-relaxed ${
                isDusk ? "text-stone-300" : "text-stone-700"
              }`}
            >
              For your privacy, we sign you out after thirty minutes of
              stillness. Move your cursor or tap anywhere to stay — or sign
              out now.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={dismissWarning}
                className={`px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                  isDusk
                    ? "bg-[var(--sh-accent-gold-dusk)] text-stone-900 hover:bg-[#d4a974]"
                    : "bg-[var(--sh-accent-gold-sunlit)] text-white hover:bg-[#8d6432]"
                }`}
              >
                Stay Here
              </button>
              <button
                type="button"
                onClick={signOutNow}
                className={`border bg-transparent px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                  isDusk
                    ? "border-white/20 text-stone-200 hover:border-[var(--sh-accent-gold-dusk)]"
                    : "border-stone-300 bg-white text-stone-700 hover:border-[var(--sh-accent-gold-sunlit)]"
                }`}
              >
                Sign Out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
