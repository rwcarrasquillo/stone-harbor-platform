"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Stone Harbor — PasswordInput.
 *
 * A drop-in replacement for `<input type="password" ... />` that adds
 * a right-aligned eye toggle to reveal what's being typed. Forwards
 * every standard input prop (value, onChange, placeholder, required,
 * autoComplete, disabled, minLength, etc.) so the call site doesn't
 * have to know it's wrapping anything special.
 *
 * Styling:
 *   Consumers pass their own `className` exactly as they would on a
 *   bare input — Sunlit, Dusk, login, reset-password all bring their
 *   own surface. We append `pr-12` so the typed text doesn't slide
 *   under the eye button.
 *
 * Accessibility:
 *   The toggle button has an explicit aria-label that flips between
 *   "Show password" and "Hide password" so screen-readers can
 *   announce the state. The button is `type="button"` so pressing
 *   Enter inside the field doesn't toggle visibility instead of
 *   submitting the form.
 *
 * Security note:
 *   The reveal is local-only — toggling never sends the value
 *   anywhere. The browser still treats the field as a password
 *   input semantically (autocomplete="current-password" or
 *   "new-password" pass through verbatim).
 */
type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /**
   * Optional override for the eye button's color classes. Defaults
   * to a quiet gold-on-transparent style that works on both Sunlit
   * and Dusk surfaces.
   */
  buttonClassName?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className = "", buttonClassName = "", ...rest }, ref) {
    const [shown, setShown] = useState(false);

    return (
      <div className="relative w-full">
        <input
          {...rest}
          ref={ref}
          type={shown ? "text" : "password"}
          // pr-12 keeps the typed value clear of the eye button.
          className={`${className} pr-12`}
        />
        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          tabIndex={-1}
          className={`absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-none text-[#c4934e]/70 transition hover:text-[#c4934e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c4934e]/40 ${buttonClassName}`}
        >
          {shown ? (
            <EyeOff size={18} strokeWidth={1.5} />
          ) : (
            <Eye size={18} strokeWidth={1.5} />
          )}
        </button>
      </div>
    );
  }
);
