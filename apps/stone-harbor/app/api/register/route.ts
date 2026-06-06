/**
 * POST /api/register — server-side member signup.
 *
 * This route exists to solve a real race condition: when Supabase
 * requires email confirmation (the default), `supabase.auth.signUp()`
 * returns a `user` object but no session. RLS policies on
 * `public.profiles` and `public.terms_acceptances` require
 * `auth.uid() = user_id`, which is NULL without a session. The
 * client-side INSERTs that used to follow signUp therefore 401'd in
 * production.
 *
 * The fix moves the whole signup transaction server-side:
 *
 *   1. validate the form inputs
 *   2. re-read `app_settings` so we trust the server's view of the
 *      registration gate + the current terms / privacy versions
 *   3. call supabase.auth.signUp() with the anon client (this also
 *      triggers the confirmation email)
 *   4. write the profile + terms_acceptances rows using the service
 *      role client — bypasses RLS, no session required
 *   5. if any write fails after the auth user was created, best-effort
 *      delete the auth user so we don't leave a half-registered ghost
 *
 * The client only needs to send form data and read back success or a
 * structured error code. It never sees the service-role key.
 *
 * Linear: SH-4. Linked from `register/page.tsx`.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Force the Node.js runtime — we rely on the service-role key, and we
// keep the future option to use Node-only modules (e.g. for richer
// validation, logging, rate-limiting).
export const runtime = "nodejs";

type Body = {
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
  genderAttested?: unknown;
  termsAccepted?: unknown;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // ---------- 1. Parse + validate ----------
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err(400, "invalid_json", "Could not parse request body.");
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";
  const genderAttested = body.genderAttested === true;
  const termsAccepted = body.termsAccepted === true;

  if (!email || !EMAIL_RE.test(email)) {
    return err(400, "invalid_email", "Please enter a valid email address.");
  }
  if (!password || password.length < 6) {
    return err(
      400,
      "invalid_password",
      "Password must be at least 6 characters.",
    );
  }
  if (!fullName) {
    return err(400, "missing_name", "Please enter your name.");
  }
  if (!genderAttested) {
    return err(
      400,
      "missing_gender_attestation",
      "Please confirm you identify as a man — Stone Harbor is a community for men.",
    );
  }
  if (!termsAccepted) {
    return err(
      400,
      "missing_terms",
      "Please accept the Terms of Service and Privacy Policy.",
    );
  }

  // ---------- 2. Server-side gate + version read ----------
  const admin = adminClient();
  if (!admin) {
    return err(
      500,
      "server_misconfigured",
      "Sign up is temporarily unavailable. Please try again in a few minutes.",
    );
  }

  // Defense in depth: even though the page reads `registration_open`
  // client-side, we re-check here so a closed gate can't be bypassed by
  // a hand-crafted POST. We also pull current terms/privacy versions
  // from the server so the acceptance row records the true versions
  // the gate was open against.
  const { data: settings, error: settingsErr } = await admin
    .from("app_settings")
    .select(
      "registration_open, current_terms_version, current_privacy_version",
    )
    .eq("id", 1)
    .single();

  if (settingsErr) {
    // Fail closed for safety: if we can't read settings, refuse rather
    // than let a partial registration through.
    return err(
      503,
      "settings_unavailable",
      "Sign up is temporarily unavailable. Please try again in a few minutes.",
    );
  }
  if (settings?.registration_open === false) {
    return err(
      403,
      "registration_closed",
      "Stone Harbor is not currently open to new members.",
    );
  }

  const termsVersion = settings?.current_terms_version ?? 1;
  const privacyVersion = settings?.current_privacy_version ?? 1;

  // ---------- 3. Sign up via anon client ----------
  // We use the anon client (not the admin client) for signUp so
  // Supabase Auth sends the confirmation email automatically. The
  // admin client's createUser path skips that email.
  const anon = anonClient();
  if (!anon) {
    return err(
      500,
      "server_misconfigured",
      "Sign up is temporarily unavailable. Please try again in a few minutes.",
    );
  }

  // emailRedirectTo tells Supabase where the confirmation-email link
  // should send the user after the token is verified. Without this,
  // Supabase falls back to the project's Site URL (the bare domain),
  // so the link lands on `/` with hash tokens — bypassing the SH-5
  // /auth/callback handler entirely. We build the URL off the request
  // origin so previews redirect to themselves rather than to prod.
  //
  // NOTE: For this to actually take effect, the URL pattern must be
  // present in the Supabase project's "Redirect URLs" allowlist
  // (Auth → URL Configuration). Otherwise Supabase silently ignores
  // emailRedirectTo and uses Site URL.
  const emailRedirectTo = `${req.nextUrl.origin}/auth/callback`;

  const { data: signUpData, error: signUpErr } = await anon.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo,
    },
  });

  if (signUpErr || !signUpData?.user) {
    // Supabase exposes the duplicate-email failure as "User already
    // registered" — surface it as a known code so the page can render
    // a kind message rather than dumping a raw string.
    const message = signUpErr?.message ?? "Sign up failed.";
    if (/already.*registered|already.*exists/i.test(message)) {
      return err(
        409,
        "email_in_use",
        "That email already has an account. Try signing in instead.",
      );
    }
    return err(400, "signup_failed", message);
  }

  const userId = signUpData.user.id;
  const userAgent = req.headers.get("user-agent");

  // ---------- 4. Write profile (service role bypasses RLS) ----------
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    display_name: fullName,
    healing_stage: "clarity",
    privacy_level: "private",
    updated_at: new Date().toISOString(),
  });

  if (profileErr) {
    // Best-effort cleanup so we don't strand a half-registered user.
    await admin.auth.admin
      .deleteUser(userId)
      .catch(() => {
        // Swallow — if deletion fails we'll be reminded by SH-7's
        // hygiene runbook, and the user can still retry signup with a
        // different email or by deleting the orphan from the admin.
      });
    return err(
      500,
      "profile_write_failed",
      "We couldn't finish setting up your account. Please try again.",
    );
  }

  // ---------- 5. Write terms acceptance (best-effort) ----------
  // We capture user_agent on the server (request header) rather than
  // client-side `navigator.userAgent` — the server value is closer to
  // what a downstream audit actually wants, and removes a missed
  // `navigator` reference on SSR paths.
  const { error: termsErr } = await admin.from("terms_acceptances").insert({
    user_id: userId,
    terms_version: termsVersion,
    privacy_version: privacyVersion,
    gender_attestation: genderAttested,
    user_agent: userAgent,
  });

  if (termsErr) {
    // Don't roll back the auth user here. The profile is created, the
    // confirmation email is on its way, and the user can re-accept on
    // first sign-in if we add that gate later. We DO log so the audit
    // gap is visible to ops.
    console.error("terms_acceptances insert failed", {
      userId,
      code: termsErr.code,
      message: termsErr.message,
    });
  }

  // ---------- 6. Success ----------
  return NextResponse.json(
    {
      ok: true,
      userId,
      // Echo so the client can short-circuit its "needs to verify email"
      // copy if Supabase ever switches off email confirmation.
      requiresEmailConfirmation: !signUpData.session,
    },
    { status: 200 },
  );
}

// ---------- helpers ----------

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(status: number, code: string, message?: string) {
  return NextResponse.json(
    { ok: false, error: code, message: message ?? code },
    { status },
  );
}
