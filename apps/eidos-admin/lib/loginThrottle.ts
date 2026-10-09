/**
 * Eidos Admin — login throttle.
 *
 * Best-effort, per-instance (in-memory) brute-force brake: after
 * MAX_FAILURES wrong passwords from one client within WINDOW_MS, further
 * attempts are refused until the window rolls over. On Vercel each
 * lambda instance keeps its own counters, so this slows guessing rather
 * than hard-stopping it; the durable limiter lands with the DB-backed
 * auth in SH-151 phase B.
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED = 1000;

const failures = new Map<string, { count: number; resetAt: number }>();

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? headers.get("x-real-ip") ?? "unknown").trim();
}

export function isThrottled(key: string, now: number = Date.now()): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(key: string, now: number = Date.now()): void {
  if (failures.size >= MAX_TRACKED) {
    for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
    if (failures.size >= MAX_TRACKED) failures.clear();
  }
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

export function resetThrottleForTests(): void {
  failures.clear();
}
