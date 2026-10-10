/**
 * Eidos Admin — access decision.
 *
 * Pure function so the rules are unit-testable without Supabase. The
 * middleware gathers the facts (valid user? active row in
 * eidos_admin_users? MFA assurance level?) and asks what to do.
 *
 * Path classes:
 *   public    /login, /api/auth/login, /api/auth/logout — no session needed
 *   mfa-step  /login/mfa, /login/enroll, /api/auth/mfa/verify — needs an
 *             admin session, but not yet MFA-verified (that is the point)
 *   protected everything else — needs an admin session at aal2 (TOTP verified)
 *
 * Being a valid Supabase Auth user is not enough: without an active
 * eidos_admin_users row the session is treated as no session at all, so an
 * account that is not an admin learns nothing from the redirect.
 */

export type PathClass = "public" | "mfa-step" | "protected";
export type AssuranceLevel = "aal1" | "aal2";

/**
 * Supabase types the level as a loose string. Anything other than the two
 * known values is treated as "no level", which can never satisfy aal2.
 */
export function toAssuranceLevel(value: string | null | undefined): AssuranceLevel | null {
  return value === "aal1" || value === "aal2" ? value : null;
}

export interface AccessFacts {
  pathClass: PathClass;
  hasUser: boolean;
  isAdmin: boolean;
  currentLevel: AssuranceLevel | null;
  /** "aal2" when the user has a verified MFA factor to step up to. */
  nextLevel: AssuranceLevel | null;
}

export type AccessDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: "/login" | "/login/mfa" | "/login/enroll" | "/"; clearSession?: boolean };

export function decideAccess(f: AccessFacts): AccessDecision {
  if (f.pathClass === "public") return { kind: "allow" };

  if (!f.hasUser) return { kind: "redirect", to: "/login" };
  if (!f.isAdmin) return { kind: "redirect", to: "/login", clearSession: true };

  const verified = f.currentLevel === "aal2";

  if (f.pathClass === "mfa-step") {
    // Already stepped up: nothing to do on the MFA pages.
    return verified ? { kind: "redirect", to: "/" } : { kind: "allow" };
  }

  if (verified) return { kind: "allow" };
  return {
    kind: "redirect",
    to: f.nextLevel === "aal2" ? "/login/mfa" : "/login/enroll",
  };
}

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];
const MFA_STEP_PATHS = ["/login/mfa", "/login/enroll", "/api/auth/mfa/verify"];

export function classifyPath(pathname: string): PathClass {
  if (MFA_STEP_PATHS.some((p) => pathname === p)) return "mfa-step";
  if (PUBLIC_PATHS.some((p) => pathname === p)) return "public";
  return "protected";
}
