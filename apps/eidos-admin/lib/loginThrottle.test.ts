import { beforeEach, describe, expect, it } from "vitest";

import {
  clearFailures,
  clientKey,
  isThrottled,
  recordFailure,
  resetThrottleForTests,
} from "./loginThrottle";

describe("loginThrottle", () => {
  beforeEach(() => resetThrottleForTests());

  it("blocks after 5 failures and unblocks after the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) recordFailure("1.2.3.4", t0);
    expect(isThrottled("1.2.3.4", t0)).toBe(false);
    recordFailure("1.2.3.4", t0);
    expect(isThrottled("1.2.3.4", t0 + 1000)).toBe(true);
    expect(isThrottled("1.2.3.4", t0 + 15 * 60 * 1000 + 1)).toBe(false);
  });

  it("tracks clients independently and clears on success", () => {
    for (let i = 0; i < 5; i++) recordFailure("a");
    expect(isThrottled("a")).toBe(true);
    expect(isThrottled("b")).toBe(false);
    clearFailures("a");
    expect(isThrottled("a")).toBe(false);
  });

  it("derives the client key from forwarding headers", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientKey(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
