/**
 * Eidos Admin — post-login redirect sanitiser.
 *
 * `next` comes from the query string / a form field, so it's attacker
 * controlled. Only a same-origin relative path is acceptable. A bare
 * `startsWith("/")` check is not enough: `//attacker.example` and
 * `/\attacker.example` both start with "/" but browsers resolve them
 * as protocol-relative URLs to another host (SH-151).
 *
 * Rules:
 *   - must start with a single "/" (not "//"), no backslashes anywhere
 *   - no control characters (CR/LF/tab are stripped by URL parsers and
 *     can turn `/\t/evil.com` into `//evil.com`)
 *   - must still resolve to the same origin when parsed against a base
 *   - /login is never a valid destination (redirect loop)
 */

const FALLBACK = "/";
const MAX_LENGTH = 2048;
const PARSE_BASE = "http://admin.invalid";

export function safeRedirect(
  next: string | null | undefined,
  fallback: string = FALLBACK,
): string {
  if (typeof next !== "string" || next.length === 0 || next.length > MAX_LENGTH) {
    return fallback;
  }
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(next, PARSE_BASE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PARSE_BASE) return fallback;
  if (parsed.pathname === "/login" || parsed.pathname.startsWith("/login/")) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}`;
}
