import { describe, expect, it } from "vitest";

import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  timingSafeEqualString,
  verifySessionToken,
} from "./session";

const SECRET = "s".repeat(48);
const NOW = 1_800_000_000;

describe("session tokens", () => {
  it("round-trips a freshly issued token", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, NOW + 60)).toBe(true);
  });

  it("does not contain the secret or any password material", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(token).not.toContain(SECRET);
    expect(token.startsWith("v1.")).toBe(true);
  });

  it("issues distinct ids per session", async () => {
    const a = await createSessionToken(SECRET, NOW);
    const b = await createSessionToken(SECRET, NOW);
    expect(a).not.toBe(b);
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(
      await verifySessionToken(token, SECRET, NOW + SESSION_MAX_AGE_SECONDS),
    ).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, "x".repeat(48), NOW)).toBe(false);
  });

  it("rejects a tampered expiry or id", async () => {
    const [v, id, exp, sig] = (await createSessionToken(SECRET, NOW)).split(".");
    expect(
      await verifySessionToken(`${v}.${id}.${Number(exp) + 99999}.${sig}`, SECRET, NOW),
    ).toBe(false);
    expect(await verifySessionToken(`${v}.other.${exp}.${sig}`, SECRET, NOW)).toBe(false);
  });

  it.each([undefined, "", "garbage", "v1.a.b", "v2.a.1.c", "v1.a.x.c", "v1..1.c"])(
    "rejects malformed token %j",
    async (t) => {
      expect(await verifySessionToken(t, SECRET, NOW)).toBe(false);
    },
  );

  it("rejects the raw password as a cookie value (the old scheme)", async () => {
    expect(await verifySessionToken("hunter2-the-admin-password", SECRET, NOW)).toBe(false);
  });
});

describe("timingSafeEqualString", () => {
  it("matches equal strings and rejects different ones", async () => {
    expect(await timingSafeEqualString("abc", "abc")).toBe(true);
    expect(await timingSafeEqualString("abc", "abd")).toBe(false);
    expect(await timingSafeEqualString("abc", "abcd")).toBe(false);
    expect(await timingSafeEqualString("", "x")).toBe(false);
  });
});
