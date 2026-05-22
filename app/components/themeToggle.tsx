"use client";

import { Sun, Moon } from "lucide-react";
import { serif } from "@/lib/fonts";
import { useTheme, type Theme } from "@/app/components/themeProvider";

/**
 * Stone Harbor — ThemeToggle.
 *
 * Lives in the /welcome profile editor under an "Appearance"
 * section. Two side-by-side cards (Sunlit / Dusk) with brand-
 * appropriate language explaining the choice. Tapping a card
 * sets the theme — instant local change, fire-and-forget DB sync.
 *
 * Brand voice for the options:
 *
 *   Sunlit: "Cream surfaces, warm light. The harbor at midday."
 *   Dusk:   "Dark surfaces, amniotic warmth. The harbor after-hours."
 *
 * No "save" button — the choice persists the moment it's made.
 * This matches Stone Harbor's tone of "no pressure, no commitment
 * before you're ready."
 */

const OPTIONS: Array<{
  value: Theme;
  label: string;
  description: string;
  Icon: typeof Sun;
}> = [
  {
    value: "sunlit",
    label: "Sunlit",
    description: "Cream surfaces, warm light. The harbor at midday.",
    Icon: Sun,
  },
  {
    value: "dusk",
    label: "Dusk",
    description: "Dark surfaces, amniotic warmth. The harbor after-hours.",
    Icon: Moon,
  },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <section aria-label="Appearance" className="my-8">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
        Appearance
      </p>
      <h2
        className={`${serif.className} mb-2 text-2xl italic text-[var(--sh-text-primary)] md:text-3xl`}
      >
        Choose your harbor.
      </h2>
      <p className="mb-5 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
        Stone Harbor offers two atmospheres. Switch any time — your
        choice is remembered across devices.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((opt) => {
          const active = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              aria-pressed={active}
              className={`group flex items-start gap-4 rounded-none border p-5 text-left transition ${
                active
                  ? "border-[var(--sh-accent-gold)] bg-[var(--sh-bg-card-tinted)] shadow-[0_8px_30px_rgba(196,147,78,0.18)]"
                  : "border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card)] hover:border-[var(--sh-accent-gold)]/40"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                  active
                    ? "border-[var(--sh-accent-gold)] bg-[var(--sh-accent-gold)]/15"
                    : "border-[var(--sh-border-subtle)]"
                }`}
              >
                <opt.Icon
                  size={18}
                  strokeWidth={1.5}
                  className={
                    active
                      ? "text-[var(--sh-accent-gold)]"
                      : "text-[var(--sh-text-tertiary)]"
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`${serif.className} text-xl italic ${
                    active
                      ? "text-[var(--sh-text-primary)]"
                      : "text-[var(--sh-text-secondary)]"
                  }`}
                >
                  {opt.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--sh-text-secondary)]">
                  {opt.description}
                </p>
                {active && (
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]">
                    Active
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
