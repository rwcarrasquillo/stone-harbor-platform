"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Stone Harbor — Toast
 *
 * Replacement for native window.alert(). A small banner at the bottom of
 * the screen, brand-matched, dismissible, auto-hides after `durationMs`.
 *
 * Usage in a page:
 *
 *   const [toast, setToast] = useState<{ tone: "info"|"error"|"success"; text: string } | null>(null);
 *   ...
 *   if (error) setToast({ tone: "error", text: error.message });
 *   ...
 *   <Toast toast={toast} onDismiss={() => setToast(null)} />
 */

export type ToastState = {
  tone: "info" | "error" | "success";
  text: string;
} | null;

export function Toast({
  toast,
  onDismiss,
  durationMs = 4500,
}: {
  toast: ToastState;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [toast, durationMs, onDismiss]);

  const accent =
    toast?.tone === "error"
      ? "#b14a3a"
      : toast?.tone === "success"
        ? "#586558"
        : "#a9793d";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.text}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-auto max-w-md border-l-[3px] bg-[#f8f4ed] px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur"
            style={{ borderLeftColor: accent }}
          >
            <div className="flex items-start gap-4">
              <p className="flex-1 text-sm leading-relaxed text-stone-800">
                {toast.text}
              </p>
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 transition hover:text-[#a9793d]"
                aria-label="Dismiss"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
