import "server-only";
import crypto from "crypto";

/**
 * Sign-in for the OS. Dependency-free: scrypt for passwords, HMAC-signed
 * tokens for sessions — the same shape the portal uses, because it works and
 * because two similar systems should fail in similar ways.
 *
 * TWO DELIBERATE DIFFERENCES FROM THE PORTAL, both because the OS and the
 * portal now share one database:
 *   • the cookie is `os_session`, not `tle_session`
 *   • AUTH_SECRET must be a DIFFERENT value here
 * Together they mean a session minted by one product can never be presented
 * to the other, even once the same people exist in both.
 */

/**
 * A missing AUTH_SECRET in production is a hard, loud failure: signing with a
 * known fallback would make every session forgeable. Resolved lazily so
 * `next build` — which sets NODE_ENV=production but never signs a token —
 * still passes with no environment at all.
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set — refusing to sign or verify sessions with a dev fallback in production."
    );
  }
  return "dev-only-secret-not-for-production";
}

export const SESSION_COOKIE = "os_session";
const SESSION_DAYS = 30;

/** scrypt hash, stored as `salt:hash` hex. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a thrown error is itself a signal.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

/**
 * Session token: `userId.expiryMs.signature`.
 * The format splits on ".", so user ids must never contain one — uid() below
 * is dot-free by construction.
 */
export function createSessionToken(userId: string): string {
  const data = `${userId}.${Date.now() + SESSION_DAYS * 864e5}`;
  return `${data}.${sign(data)}`;
}

/** The userId behind a valid, unexpired token; null otherwise. */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = sign(`${userId}.${exp}`);
  // Constant-time compare so a signature can't be guessed byte by byte.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export function sessionCookieOptions(remember = true) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: SESSION_DAYS * 24 * 60 * 60 } : {}),
  };
}

/** Dot-free id — the token format depends on it. */
export function uid(): string {
  return crypto.randomBytes(12).toString("hex");
}
