import { redirect } from "next/navigation";

import { safeRedirect } from "@/lib/safeRedirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  AuthShell,
  Banner,
  fieldInputStyle,
  fieldLabelStyle,
  footnoteStyle,
  primaryButtonStyle,
} from "../AuthShell";

/**
 * Eidos Admin — authenticator setup (step 2 of 2, first sign-in).
 *
 * Reached only by an admin whose password is verified but who has no
 * verified TOTP factor yet (the middleware routes them here). Creates a
 * fresh TOTP factor, shows its QR code and setup key, and asks for one
 * code to prove the app is set up. Any half-finished factor from an earlier
 * visit is discarded first so setup can always be retried.
 */

export const dynamic = "force-dynamic";

interface SearchParams {
  error?: string;
  next?: string;
}

export default async function EnrollPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const nextPath = safeRedirect(params.next);
  const errorMessage = pickErrorMessage(params.error);

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?error=unconfigured");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp?.length) {
    // Already enrolled — go to the normal code step instead.
    redirect(`/login/mfa?next=${encodeURIComponent(nextPath)}`);
  }
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data: enrollment, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Eidos Admin",
  });
  if (error || !enrollment) redirect("/login?error=invalid");

  return (
    <AuthShell
      title="Set up your authenticator"
      subtitle="Scan this with an authenticator app, then enter the code it shows."
    >
      {errorMessage && <Banner tone="err">{errorMessage}</Banner>}

      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enrollment.totp.qr_code}
          alt="Authenticator QR code"
          width={180}
          height={180}
          style={{ background: "#fff", padding: 8, borderRadius: 4 }}
        />
      </div>
      <p style={{ ...footnoteStyle, marginTop: 0, marginBottom: "1rem", wordBreak: "break-all" }}>
        Can&apos;t scan? Enter this setup key manually:
        <br />
        <code style={{ color: "#e6e6e6" }}>{enrollment.totp.secret}</code>
      </p>

      <form method="POST" action="/api/auth/mfa/verify">
        <input type="hidden" name="next" value={nextPath} />
        <input type="hidden" name="factorId" value={enrollment.id} />
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
          Finish setup
        </button>
      </form>
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
