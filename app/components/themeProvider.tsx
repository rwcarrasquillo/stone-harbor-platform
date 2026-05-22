"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — ThemeProvider.
 *
 * Member-level theme preference: 'sunlit' or 'dusk'.
 *
 * Persistence + SSR strategy:
 *   1. Source of truth on the server = the `stone-harbor-theme` cookie.
 *      Root layout reads it via next/headers cookies() and renders the
 *      correct data-theme on <html>, eliminating hydration mismatch.
 *   2. localStorage mirrors the cookie for clients that read the value
 *      in client-only contexts (less common now, but kept as a fallback).
 *   3. Supabase `profiles.theme_preference` is the canonical
 *      cross-device source. On first mount we reconcile localStorage
 *      with the profile and update both if they differ.
 *
 * Writing (setTheme):
 *   Updates state immediately, then in parallel writes:
 *     - cookie         (1-year max-age, path=/, samesite=lax)
 *     - localStorage   (fallback)
 *     - Supabase       (fire-and-forget; failure is non-fatal)
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

  // Whenever the theme changes, apply the data-theme attribute (in case
  // it was set by something other than the server render).
  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  // On mount: reconcile with the authenticated user's Supabase profile.
  // The cookie was the source for the initial render; if the DB has a
  // different value (e.g., the member toggled theme on another device),
  // pick up that value and persist it to the cookie + localStorage.
  useEffect(() => {
    let cancelled = false;

    async function reconcileFromProfile() {
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
        .single();

      if (cancelled) return;
      setIsLoading(false);

      if (error || !data?.theme_preference) return;

      const dbTheme = data.theme_preference as Theme;
      if (dbTheme === "sunlit" || dbTheme === "dusk") {
        if (dbTheme !== theme) {
          setThemeState(dbTheme);
          writeCookie(dbTheme);
          writeLocalStorage(dbTheme);
        }
      }
    }

    reconcileFromProfile();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback(async (next: Theme) => {
    setThemeState(next);
    writeCookie(next);
    writeLocalStorage(next);

    // Fire-and-forget DB sync.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ theme_preference: next })
      .eq("id", user.id);
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
