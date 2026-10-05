// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allowRequest, clientIp, RATE_LIMITS } from "@/lib/rateLimit";

function fakeAdmin(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("allowRequest (SH-161 finding 9)", () => {
  it("passes the rule through to hit_rate_limit", async () => {
    const { client, rpc } = fakeAdmin({ data: true, error: null });
    await expect(allowRequest(client, RATE_LIMITS.checkout, "user:1")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("hit_rate_limit", {
      p_bucket: "checkout.session",
      p_subject: "user:1",
      p_limit: 10,
      p_window_seconds: 600,
    });
  });

  it("rejects when the limiter says the window is full", async () => {
    const { client } = fakeAdmin({ data: false, error: null });
    await expect(allowRequest(client, RATE_LIMITS.generateChapter, "u")).resolves.toBe(false);
  });

  it("fails open when the limiter errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeAdmin({ data: null, error: { message: "db down" } });
    await expect(allowRequest(client, RATE_LIMITS.registerIp, "1.2.3.4")).resolves.toBe(true);
    spy.mockRestore();
  });
});

describe("clientIp", () => {
  const r = (h: Record<string, string>) => new Request("https://www.stoneharbor.app/api/register", { headers: h });
  it("prefers x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIp(r({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
    expect(clientIp(r({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(clientIp(r({}))).toBe("unknown");
  });
});
