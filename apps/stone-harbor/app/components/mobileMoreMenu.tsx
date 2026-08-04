"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import {
  Wind,
  Waves,
  Compass,
  Map as MapIcon,
  Mail,
  Library,
  Activity,
  Users,
} from "lucide-react";
import { sans, serif } from "@/lib/fonts";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Stone Harbor — mobile "More" bottom sheet (SH-123).
 *
 * The tab bar carries five destinations. The harbor has thirteen. Before
 * this sheet, eight rooms — Vent, The Breath, Roadmap, The Map, Letters,
 * Curated, Rhythm, Lineage — had no path from the bottom nav at all: a
 * member on a phone had to land on /dashboard and scroll a horizontally
 * scrolling ten-card strip to find them. That is not navigation, it is
 * a search. This sheet makes every room two taps from anywhere.
 *
 * Note the count: the SH-123 brief listed six unreachable rooms (Vent,
 * Meditation, Letters, Resources, Lineage, Rhythm) and missed The Map,
 * which is a Phase 2 root route the tab bar never carried either. The
 * sheet ships eight — the six named plus The Map plus Roadmap, which
 * gave up its tab slot to "More" (see mobileTabBar.tsx for why that
 * trade is safe).
 *
 * Lighthouse Keepers is deliberately absent: it is gated behind
 * `app_settings.keepers_enabled` and stays hidden until the surface
 * launches. Adding it here would need a flag read the tab bar doesn't
 * do today — a follow-up when Keepers ships.
 *
 * Dismissal — three ways out, matching iOS-native sheet behavior:
 *   - Tap the dimmed backdrop
 *   - Swipe the sheet down past a threshold
 *   - Press Escape (desktop / external keyboard)
 * Plus the explicit "Close" control at the top, because a discoverable
 * affordance beats a learned gesture for members who are not fluent in
 * app conventions.
 *
 * Always-dark, like the tab bar it hangs off. The sheet is chrome, not
 * a harbor surface — it reads as the nav expanding, so it keeps the tab
 * bar's near-black fill in both Sunlit and Dusk rather than theming.
 */

type MoreRoom = {
  key: string;
  /** `null` href means "compose it from the active locale" (see below). */
  href: string | ((locale: string) => string);
  icon: typeof Wind;
};

/**
 * Route shapes are not uniform across the harbor and the difference
 * matters — emitting the wrong one 404s.
 *   - /vent, /meditation, /roadmap, /map, /letters, /resources, /lineage
 *     are Phase 2 root routes: no locale segment, locale resolves from
 *     the NEXT_LOCALE cookie.
 *   - /rhythm lives at app/[locale]/rhythm/page.tsx and only resolves
 *     with the prefix.
 * Same split the dashboard rooms strip encodes.
 */
const MORE_ROOMS: MoreRoom[] = [
  { key: "vent", href: "/vent", icon: Wind },
  { key: "breath", href: "/meditation", icon: Waves },
  { key: "roadmap", href: "/roadmap", icon: Compass },
  { key: "map", href: "/map", icon: MapIcon },
  { key: "letters", href: "/letters", icon: Mail },
  { key: "resources", href: "/resources", icon: Library },
  { key: "rhythm", href: (locale) => `/${locale}/rhythm`, icon: Activity },
  { key: "lineage", href: "/lineage", icon: Users },
];

export function MobileMoreMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("tabBar.moreMenu");
  const locale = useLocale();
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Escape to dismiss. Bound to the document rather than the sheet so it
  // fires regardless of where focus currently sits.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock the page behind the sheet. Without this the document keeps
  // scrolling under the member's thumb while they read the room list,
  // which on iOS also drags the sheet's own drag gesture out of sync.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus into the sheet when it opens so keyboard and screen-reader
  // users land inside it rather than back at the top of the page.
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.quick, ease: EASE.patient }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] sm:hidden"
          />

          {/*
            Two layers on purpose: the outer one owns the slide-in, the
            inner one owns drag-to-dismiss, and neither writes the
            other's transform.

            framer-motion's `drag` takes ownership of the dragged axis.
            Animating y from "100%" to 0 on the same element that
            declares drag="y" puts the entrance and the gesture system
            on the same motion value, which is a documented way to get
            a sheet that never travels. Splitting them costs one div
            and removes the class of bug entirely.

            Verified in the browser: the wrapper transform steps
            81px → 12px → 0 over ~360ms and the backdrop reaches
            opacity 1.
          */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: DURATION.calm, ease: EASE.settle }}
            className="fixed inset-x-0 bottom-0 z-50 sm:hidden"
          >
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("ariaLabel")}
            tabIndex={-1}
            drag="y"
            // Only downward drag travels; upward is pinned at 0 so the
            // sheet can't be flung off the top of the screen.
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              // Dismiss on a decisive gesture: either dragged more than
              // 100px down, or flicked down fast. Velocity matters as
              // much as distance — a quick short flick reads as "close"
              // even though the finger barely moved.
              if (info.offset.y > 100 || info.velocity.y > 500) onClose();
            }}
            // eslint-disable-next-line no-restricted-syntax -- bespoke always-dark surface: the sheet is tab-bar chrome, near-black in both themes
            className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-stone-800 bg-[#0A0A0B]"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
            }}
          >
            {/* Grab handle — the visual promise that this thing is
                draggable, before the member has tried it. */}
            <div className="flex justify-center pb-1 pt-3">
              <div
                aria-hidden="true"
                className="h-1 w-10 rounded-full bg-stone-700"
              />
            </div>

            <div className="flex items-center justify-between px-5 pb-4 pt-2">
              <p
                className={`${serif.className} text-[17px] italic text-stone-300`}
              >
                {t("title")}
              </p>
              <button
                type="button"
                onClick={onClose}
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} shrink-0 text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-accent-gold-dusk)] transition-colors hover:text-stone-200`}
              >
                {t("close")}
              </button>
            </div>

            <ul className="grid grid-cols-2 gap-2 px-4 pb-2">
              {MORE_ROOMS.map((room) => {
                const Icon = room.icon;
                const href =
                  typeof room.href === "function"
                    ? room.href(locale)
                    : room.href;
                return (
                  <li key={room.key}>
                    <Link
                      href={href}
                      onClick={onClose}
                      // min-h-[76px] keeps every cell above the 44px
                      // iOS minimum tap target with room to spare, so
                      // two-column density never costs reachability.
                      className="flex min-h-[76px] flex-col justify-center gap-2 rounded-lg border border-stone-800/80 bg-white/[0.03] px-3.5 py-3 transition active:bg-white/[0.07]"
                    >
                      <Icon
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className="text-[var(--sh-accent-gold-dusk)]"
                      />
                      <span
                        className={`${sans.className} text-[12px] font-semibold uppercase tracking-[0.14em] text-stone-300`}
                      >
                        {t(`rooms.${room.key}`)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
