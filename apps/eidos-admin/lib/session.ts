/**
 * Eidos Admin — signed session tokens.
 *
 * The session cookie holds an opaque, HMAC-signed token — never the
 * admin password (SH-151). Format:
 *
 *     v1.<session-id>.<expires-at-unix-seconds>.<signature>
 *
 * where signature = base64url(HMAC-SHA256(EIDOS_ADMIN_SESSION_SECRET,
 * "v1.<session-id>.<expires-at>")). Uses Web Crypto only, so it runs
 * in both the Edge middleware and the Node login route.
 *
 * Stateless: rotating EIDOS_ADMIN_SESSION_SECRET invalidates every
 * session. Per-session revocation arrives with the server-side session
 * table in SH-151 phase B.
 */

export const SESSION_COOKIE_NAME = "eidos_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
const MIN_SECRET_LENGTH = 32;
const VERSION = "v1";

const encoder = new TextEncoder();

export function getSessionSecret(): string | null {
  const secret = process.env.EIDOS_ADMIN_SESSION_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

export async function createSessionToken(
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const expiresAt = nowSeconds + SESSION_MAX_AGE_SECONDS;
  const payload = `${VERSION}.${id}.${expiresAt}`;
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return false;
  const [version, id, expiresAtRaw, signature] = parts;
  if (!id || !/^\d+$/.test(expiresAtRaw)) return false;
  if (Number(expiresAtRaw) <= nowSeconds) return false;

  const expected = await sign(secret, `${version}.${id}.${expiresAtRaw}`);
  return timingSafeEqualString(signature, expected);
}

/**
 * Constant-time string comparison. Both inputs are hashed first so the
 * comparison length never depends on the secret's length.
 */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(mac));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
