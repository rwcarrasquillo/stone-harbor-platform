import { describe, expect, it } from "vitest";

import { safeRedirect } from "./safeRedirect";

describe("safeRedirect", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/security")).toBe("/security");
    expect(safeRedirect("/spot-check/a/b?x=1")).toBe("/spot-check/a/b?x=1");
  });

  it.each([
    "//attacker.example",
    "//attacker.example/path",
    "///attacker.example",
    "/\\attacker.example",
    "\\\\attacker.example",
    "https://attacker.example",
    "http://attacker.example/x",
    "javascript:alert(1)",
    "attacker.example",
    "/\t/attacker.example",
    "/\n/attacker.example",
  ])("rejects %j", (input) => {
    expect(safeRedirect(input)).toBe("/");
  });

  it("keeps percent-encoded sequences inert", () => {
    expect(safeRedirect("/%2F%2Fattacker.example")).toBe("/%2F%2Fattacker.example");
  });

  it("never lands on /login", () => {
    expect(safeRedirect("/login")).toBe("/");
    expect(safeRedirect("/login?next=/x")).toBe("/");
    expect(safeRedirect("/login/sub")).toBe("/");
  });

  it("falls back for empty / non-string / oversized input", () => {
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect("")).toBe("/");
    expect(safeRedirect("/" + "a".repeat(3000))).toBe("/");
  });

  it("honours a custom fallback", () => {
    expect(safeRedirect("//evil.com", "/home")).toBe("/home");
  });
});
