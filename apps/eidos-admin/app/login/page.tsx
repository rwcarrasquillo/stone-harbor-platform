import { safeRedirect } from "@/lib/safeRedirect";

import {
  AuthShell,
  Banner,
  fieldInputStyle,
  fieldLabelStyle,
  footnoteStyle,
  primaryButtonStyle,
} from "./AuthShell";

/**
 * Eidos Admin — login page (step 1 of 2).
 *
 * Email + password, POSTed to /api/auth/login. A correct login continues to
 * the authenticator-code step (/login/mfa, or /login/enroll the first time).
 *
 * Surfaces (via search params):
 *   ?error=invalid      — email or password was wrong (or not an admin account)
 *   ?error=missing      — a field was empty
 *   ?error=throttled    — too many failed attempts from this client
 *   ?error=unconfigured — server missing EIDOS_SUPABASE_URL / _PUBLISHABLE_KEY
 *   ?logged_out=1       — user just signed out
 *   ?next=<path>        — preserved so post-login lands the user where they were going
 */

interface SearchParams {
  error?: string;
  logged_out?: string;
  next?: string;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const errorMessage = pickErrorMessage(params.error);
  const loggedOut = params.logged_out === "1";
  const nextPath = safeRedirect(params.next);

  return (
    <AuthShell title="Admin sign in">
      {loggedOut && <Banner tone="ok">Signed out.</Banner>}
      {errorMessage && <Banner tone="err">{errorMessage}</Banner>}

      <form method="POST" action="/api/auth/login">
        <input type="hidden" name="next" value={nextPath} />
        <label htmlFor="email" style={fieldLabelStyle}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          style={fieldInputStyle}
        />
        <label htmlFor="password" style={{ ...fieldLabelStyle, marginTop: "1rem" }}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          style={fieldInputStyle}
        />
        <button type="submit" style={primaryButtonStyle}>
          Continue
        </button>
      </form>

      <p style={footnoteStyle}>
        Access is by invitation. After your password you will be asked for a
        code from your authenticator app.
      </p>
    </AuthShell>
  );
}

function pickErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case "invalid":
      return "That email and password don't match an admin account.";
    case "missing":
      return "Please enter your email and password.";
    case "unconfigured":
      return "Server is missing admin auth configuration — sign-in is disabled.";
    case "throttled":
      return "Too many failed attempts. Try again in 15 minutes.";
    default:
      return null;
  }
}
