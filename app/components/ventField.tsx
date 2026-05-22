"use client";

import { forwardRef } from "react";
import { useTheme } from "@/app/components/themeProvider";

/**
 * Stone Harbor — VentField (Textarea + Input).
 *
 * The /vent screen pioneered a specific writing surface aesthetic:
 *
 *   • translucent glass that feels lit from behind, not lit from above
 *   • a borderline that is *almost* nothing — barely perceptible until
 *     the cursor is in it
 *   • a placeholder that whispers (text-white/30) instead of barking
 *   • a focus state that warms with a soft gold border and a touch
 *     more luminance from the glass underneath
 *   • generous padding so the man's words have room to land
 *
 * This file lifts that surface into a reusable component so any other
 * writing area in the app (private journal, brotherhood messages,
 * member-feed composer) can match the feel.
 *
 * Theme awareness:
 *   /vent is always-dark — it's an immersive release experience that
 *   ignores the member's theme preference. The rest of the app
 *   respects Sunlit / Dusk. VentField translates the same aesthetic
 *   into both modes:
 *
 *   Dusk  → white-on-black glass exactly like /vent
 *   Sunlit → black-on-cream glass, same translucency philosophy,
 *            same gold focus accent. The "ink on linen" companion to
 *            the "light through dark fabric" of Dusk.
 *
 * Usage:
 *
 *   <VentTextarea
 *     value={body}
 *     onChange={setBody}
 *     rows={6}
 *     placeholder="Whatever it is."
 *   />
 *
 *   <VentInput
 *     value={subject}
 *     onChange={setSubject}
 *     placeholder="Subject (optional)"
 *   />
 *
 * Density:
 *   The default surface uses `p-5` (textarea) / `px-5 py-4` (input)
 *   to match /vent. Pass `compact` to drop to `p-4` / `px-4 py-3`
 *   for tighter contexts (inline reply composers, dense forms).
 */

type CommonProps = {
  /** Use the tighter padding variant for dense layouts. */
  compact?: boolean;
  /** Extra classes appended to the merged className. */
  className?: string;
};

function ventTextareaClasses(isDusk: boolean, compact: boolean): string {
  const padding = compact ? "p-4" : "p-5";
  const text = compact ? "text-sm md:text-base" : "text-base md:text-lg";
  const base = `${padding} ${text} w-full resize-none rounded-none border leading-relaxed outline-none transition`;

  if (isDusk) {
    return `${base} border-white/15 bg-white/[0.04] text-white placeholder:text-white/30 focus:border-[#c4934e]/60 focus:bg-white/[0.06]`;
  }
  // Sunlit — the cream-and-ink companion to the dark-glass vent.
  return `${base} border-black/10 bg-black/[0.02] text-[var(--sh-text-primary)] placeholder:text-black/30 focus:border-[var(--sh-accent-gold)]/70 focus:bg-black/[0.04]`;
}

function ventInputClasses(isDusk: boolean, compact: boolean): string {
  const padding = compact ? "px-4 py-3" : "px-5 py-4";
  const text = compact ? "text-sm" : "text-base";
  const base = `${padding} ${text} w-full rounded-none border outline-none transition`;

  if (isDusk) {
    return `${base} border-white/15 bg-white/[0.04] text-white placeholder:text-white/30 focus:border-[#c4934e]/60 focus:bg-white/[0.06]`;
  }
  return `${base} border-black/10 bg-black/[0.02] text-[var(--sh-text-primary)] placeholder:text-black/30 focus:border-[var(--sh-accent-gold)]/70 focus:bg-black/[0.04]`;
}

type VentTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> &
  CommonProps;

export const VentTextarea = forwardRef<HTMLTextAreaElement, VentTextareaProps>(
  function VentTextarea(
    { compact = false, className = "", ...rest },
    ref,
  ) {
    const { theme } = useTheme();
    const isDusk = theme === "dusk";
    return (
      <textarea
        ref={ref}
        className={`${ventTextareaClasses(isDusk, compact)} ${className}`.trim()}
        {...rest}
      />
    );
  },
);

type VentInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "className"
> &
  CommonProps;

export const VentInput = forwardRef<HTMLInputElement, VentInputProps>(
  function VentInput({ compact = false, className = "", ...rest }, ref) {
    const { theme } = useTheme();
    const isDusk = theme === "dusk";
    return (
      <input
        ref={ref}
        className={`${ventInputClasses(isDusk, compact)} ${className}`.trim()}
        {...rest}
      />
    );
  },
);
