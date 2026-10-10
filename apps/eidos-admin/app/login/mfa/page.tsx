import { safeRedirect } from "@/lib/safeRedirect";

import {
  AuthShell,
  Banner,
  fieldInputStyle,
  fieldLabelStyle,
  footnoteStyle,
  primaryButtonStyle,
} from "../AuthShell";

/**
 * Eidos Admin — authenticator code (step 2 of 2, returning admins).
 *
 * The middleware only lets an admin with a password-verified session and a
 * verified TOTP factor reach this page; /api/auth/mfa/verify checks the code.
 */

interface SearchParams {
  error?: string;
  next?: string;
}

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const nextPath = safeRedirect(params.next);
  const errorMessage = pickErrorMessage(params.error);

  return (
    <AuthShell title="Authenticator code" subtitle="Enter the 6-digit code from your authenticator app.">
      {errorMessage && <Banner tone="err">{errorMessage}</Banner>}

      <form method="POST" action="/api/auth/mfa/verify">
        <input type="hidden" name="next" value={nextPath} />
        <label htmlFor="code" style={fieldLabelStyle}>
          Code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          pattern="[0-9 ]*"
          autoComplete="one-time-code"
          autoFocus
          required
          style={fieldInputStyle}
        />
        <button type="submit" style={primaryButtonStyle}>
          Verify
        </button>
      </form>

      <form method="POST" action="/api/auth/logout" style={{ marginTop: "1rem" }}>
        <button
          type="submit"
          style={{
            background: "transparent",
            border: "none",
            color: "#7aa2f7",
            fontFamily: "inherit",
            fontSize: "0.75rem",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Use a different account
        </button>
      </form>

      <p style={footnoteStyle}>
        Lost your authenticator? Ask an owner to reset your second factor.
      </p>
    </AuthShell>
  );
}

function pickErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case "invalid_code":
      return "That code didn't work. Codes change every 30 seconds — try the current one.";
    case "throttled":
      return "Too many failed attempts. Try again in 15 minutes.";
    default:
      return null;
  }
}
