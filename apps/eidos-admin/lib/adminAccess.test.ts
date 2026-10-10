import { describe, expect, it } from "vitest";

import { classifyPath, decideAccess, toAssuranceLevel, type AccessFacts } from "./adminAccess";

const base: AccessFacts = {
  pathClass: "protected",
  hasUser: true,
  isAdmin: true,
  currentLevel: "aal2",
  nextLevel: "aal2",
};

describe("decideAccess", () => {
  it("lets public paths through for anyone", () => {
    expect(decideAccess({ ...base, pathClass: "public", hasUser: false })).toEqual({ kind: "allow" });
  });

  it("sends signed-out visitors to /login", () => {
    expect(decideAccess({ ...base, hasUser: false, currentLevel: null, nextLevel: null })).toEqual({
      kind: "redirect",
      to: "/login",
    });
  });

  it("treats a non-admin account as signed out and clears its session", () => {
    expect(decideAccess({ ...base, isAdmin: false })).toEqual({
      kind: "redirect",
      to: "/login",
      clearSession: true,
    });
    expect(decideAccess({ ...base, pathClass: "mfa-step", isAdmin: false })).toEqual({
      kind: "redirect",
      to: "/login",
      clearSession: true,
    });
  });

  it("allows a verified (aal2) admin on protected paths", () => {
    expect(decideAccess(base)).toEqual({ kind: "allow" });
  });

  it("sends an aal1 admin with a verified factor to /login/mfa", () => {
    expect(decideAccess({ ...base, currentLevel: "aal1", nextLevel: "aal2" })).toEqual({
      kind: "redirect",
      to: "/login/mfa",
    });
  });

  it("sends an aal1 admin with no factor to /login/enroll", () => {
    expect(decideAccess({ ...base, currentLevel: "aal1", nextLevel: "aal1" })).toEqual({
      kind: "redirect",
      to: "/login/enroll",
    });
  });

  it("never lets aal1 reach protected paths", () => {
    for (const nextLevel of ["aal1", "aal2", null] as const) {
      const d = decideAccess({ ...base, currentLevel: "aal1", nextLevel });
      expect(d.kind).toBe("redirect");
    }
    expect(decideAccess({ ...base, currentLevel: null, nextLevel: null }).kind).toBe("redirect");
  });

  it("allows aal1 admins on the MFA step pages", () => {
    expect(decideAccess({ ...base, pathClass: "mfa-step", currentLevel: "aal1" })).toEqual({ kind: "allow" });
  });

  it("bounces already-verified admins off the MFA step pages", () => {
    expect(decideAccess({ ...base, pathClass: "mfa-step" })).toEqual({ kind: "redirect", to: "/" });
  });
});

describe("classifyPath", () => {
  it.each([
    ["/login", "public"],
    ["/api/auth/login", "public"],
    ["/api/auth/logout", "public"],
    ["/login/mfa", "mfa-step"],
    ["/login/enroll", "mfa-step"],
    ["/api/auth/mfa/verify", "mfa-step"],
    ["/", "protected"],
    ["/security", "protected"],
    ["/api/security/abc/mark-rotated", "protected"],
    ["/login/other", "protected"],
    ["/login/", "protected"],
  ])("%s -> %s", (path, cls) => {
    expect(classifyPath(path)).toBe(cls);
  });
});

describe("toAssuranceLevel", () => {
  it("passes the two known levels and rejects everything else", () => {
    expect(toAssuranceLevel("aal1")).toBe("aal1");
    expect(toAssuranceLevel("aal2")).toBe("aal2");
    expect(toAssuranceLevel("aal3")).toBeNull();
    expect(toAssuranceLevel("")).toBeNull();
    expect(toAssuranceLevel(null)).toBeNull();
    expect(toAssuranceLevel(undefined)).toBeNull();
  });
});
