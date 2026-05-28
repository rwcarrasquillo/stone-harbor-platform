"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — ThemeProvider.
 *
 * Member-level theme preference: 'sunlit' or 'dusk'.
 *
 * Persistence + SSR strategy (post-fix May 27 2026):
 *   1. SOURCE OF TRUTH on the server = the `stone-harbor-theme` cookie.
 *      Root layout reads it via next/headers cookies() and renders the
 *      correct data-theme on <html>, eliminating hydration mismatch.
 *   2. localStorage mirrors the cookie as a client-side fallback.
 *   3. Supabase `profiles.theme_preference` is the cross-device
 *      backup. We sync writes to it (upsert, with error logging) and
 *      read from it ONLY ONCE per browser session — on the first
 *      mount where no cookie is present. After the cookie exists,
 *      we never overwrite it from the DB.
 *
 * Why this strategy:
 *   The previous implementation reconciled-from-DB on every mount,
 *   which is once per route change in the App Router. If the
 *   DB write from the previous setTheme hadn't completed yet (or
 *   silently failed because the row didn't exist / RLS blocked it /
 *   network blip), the reconcile would read the stale DB value and
 *   overwrite the fresh cookie. The theme appeared to revert. Fix:
 *   trust the cookie. Only fall back to the DB when there's literally
 *   no cookie (first sign-in on a new device).
 *
 * Writing (setTheme):
 *   Updates state immediately, writes cookie + localStorage
 *   synchronously, then upserts to Supabase. Upsert (not update) so
 *   a missing profile row doesn't silently fail. Errors are logged
 *   to the console but never thrown — theme failures must not break
 *   the rest of the app.
 *
 * The provider also re-applies the data-theme attribute on every
 * theme change so client-side toggles flip CSS variables instantly.
 */

export type Theme = "sunlit" | "dusk";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isLoading: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const LOCAL_STORAGE_KEY = "stone-harbor:theme";
const COOKIE_NAME = "stone-harbor-theme";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function writeLocalStorage(theme: Theme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, theme);
  } catch {
    // Storage may be disabled in private mode. Cookie still works.
  }
}

function writeCookie(theme: Theme) {
  if (typeof document === "undefined") return;
  // SameSite=Lax + path=/ so the cookie is sent on all same-origin
  // navigations. Not HttpOnly because we need to read it on the
  // client too. Theme preference isn't a security-sensitive value.
  document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

function readCookie(): Theme | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`),
  );
  if (!match) return null;
  const value = match[1];
  return value === "sunlit" || value === "dusk" ? value : null;
}

function applyThemeAttribute(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({
  children,
  initialTheme = "sunlit",
}: {
  children: ReactNode;
  /**
   * Theme value read by the server from the cookie. Passed in by the
   * root layout so the React tree starts with the same theme on
   * server and client — no hydration mismatch.
   */
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [isLoading, setIsLoading] = useState(true);
  // Guard so the one-time DB hydration only fires once per ProviderInstance
  // lifetime, even across rapid re-renders.
  const hydratedFromDbRef = useRef(false);

  // Whenever the theme changes, apply the data-theme attribute (in case
  // it was set by something other than the server render).
  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  // One-time DB hydration on first mount:
  //   - If a cookie already exists, the user has chosen on this device.
  //     Trust the cookie; do NOT read the DB.
  //   - If no cookie exists, this is a new device or first visit. Try
  //     to recover their cross-device preference from the DB. This is
  //     the only path that ever overwrites the in-memory theme from
  //     the DB.
  useEffect(() => {
    if (hydratedFromDbRef.current) return;
    hydratedFromDbRef.current = true;

    const existingCookie = readCookie();
    if (existingCookie) {
      // Cookie is the source of truth for this device. Stop here.
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function hydrateFromDb() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("theme_preference")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;
      setIsLoading(false);

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[ThemeProvider] hydrateFromDb read failed:", error);
        return;
      }
      if (!data?.theme_preference) return;

      const dbTheme = data.theme_preference as Theme;
      if (dbTheme !== "sunlit" && dbTheme !== "dusk") return;

      // No cookie yet, so adopt the DB value and persist it locally.
      setThemeState(dbTheme);
      writeCookie(dbTheme);
      writeLocalStorage(dbTheme);
    }

    void hydrateFromDb();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback(async (next: Theme) => {
    // Synchronous local writes — cookie is the source of truth.
    setThemeState(next);
    writeCookie(next);
    writeLocalStorage(next);

    // Cross-device sync to Supabase (best effort).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert (not update) so a missing profile row is auto-created
    // rather than silently swallowed as a zero-row update. The
    // `onConflict` clause makes this safe to call repeatedly.
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, theme_preference: next },
        { onConflict: "id" },
      );

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[ThemeProvider] setTheme DB write failed:", error);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      "useTheme must be called inside <ThemeProvider /> — check app/layout.tsx",
    );
  }
  return ctx;
}
