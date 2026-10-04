// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOrigin } from "@/lib/apiSupabase";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentryScrub";
import type { ErrorEvent } from "@sentry/nextjs";

function req(origin?: string, extra: Record<string, string> = {}): Request {
  const headers = new Headers(extra);
  if (origin) headers.set("origin", origin);
  return new Request("https://www.stoneharbor.app/api/checkout/session", {
    method: "POST",
    headers,
  });
}

describe("requestOrigin (SH-160 finding 11)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the production origins", () => {
    expect(requestOrigin(req("https://www.stoneharbor.app"))).toBe("https://www.stoneharbor.app");
    expect(requestOrigin(req("https://stoneharbor.app"))).toBe("https://stoneharbor.app");
  });

  it("falls back to the canonical origin for a spoofed Origin", () => {
    expect(requestOrigin(req("https://evil.example"))).toBe("https://www.stoneharbor.app");
  });

  it("ignores forwarded-host headers entirely", () => {
    const r = req(undefined, { "x-forwarded-host": "evil.example", host: "evil.example" });
    expect(requestOrigin(r)).toBe("https://www.stoneharbor.app");
  });

  it("allows this project's previews only in the preview environment", () => {
    const preview = "https://stone-harbor-git-feature-rafael-carrasquillo-s-projects.vercel.app";
    vi.stubEnv("VERCEL_ENV", "production");
    expect(requestOrigin(req(preview))).toBe("https://www.stoneharbor.app");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(requestOrigin(req(preview))).toBe(preview);
    expect(requestOrigin(req("https://stone-harbor-x-attacker.vercel.app"))).toBe(
      "https://www.stoneharbor.app",
    );
  });
});

describe("Sentry scrubbing (SH-160 finding 6)", () => {
  it("removes identity, cookies, headers, body and query strings", () => {
    const event = {
      user: { id: "u1", email: "member@example.com" },
      request: {
        url: "https://www.stoneharbor.app/reset-password?token=secret#x",
        cookies: { sb: "x" },
        headers: { authorization: "Bearer x" },
        query_string: "token=secret",
        data: { journal: "private" },
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.url).toBe("https://www.stoneharbor.app/reset-password");
  });

  it("drops console breadcrumbs and strips query strings from navigation ones", () => {
    expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull();
    const nav = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/journal?id=1", to: "/dashboard?x=2" },
    });
    expect(nav?.data).toEqual({ from: "/journal", to: "/dashboard" });
  });
});
