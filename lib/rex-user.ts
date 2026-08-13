import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { hasDb, q } from "./db";

/**
 * A person's own REX sign-in.
 *
 * Everything the OS writes into REX should carry the name of whoever did it.
 * With one office API account it carries the office's — so every note, every
 * edit, every sent email would read as James, forever. Creating it as the
 * office and reassigning it afterwards is worse than useless: the audit trail
 * still says James did it and someone inherited it.
 *
 * So each person signs into REX once, we hold THEIR token, and calls made on
 * their behalf are made as them.
 *
 * MEASURED, not assumed: REX takes token_lifetime as a login parameter and
 * grants up to two weeks — 7 days is accepted, 30 is refused with "Token
 * cannot have a lifetime greater than 2 weeks (1209600 seconds)". We ask for
 * seven, so a weekly rotation always lands well inside the ceiling.
 *
 * WE NEVER STORE THE PASSWORD. It arrives, goes to REX, and is gone when this
 * function returns. Storing it would let us re-authenticate silently and drop
 * the weekly prompt — a real security boundary traded for one click a week.
 */

const REX_BASE = process.env.REX_API_BASE ?? "https://api.uk.rexsoftware.com";
/** Seven days. The ceiling is fourteen; half of it leaves room to rotate. */
const LIFETIME_SECONDS = 7 * 24 * 60 * 60;
/** Prompt for a fresh sign-in before it actually lapses, never after. */
const RENEW_WITHIN_HOURS = 24;

/* ───────────────────────── at rest ───────────────────────── */

/**
 * The token is a bearer credential: anyone holding it can act as that person
 * in REX. A database backup is not a place to keep those in plain text, so
 * they're sealed with a key derived from AUTH_SECRET.
 *
 * AES-GCM rather than CBC because it authenticates as well as encrypts — a
 * tampered ciphertext fails to open instead of decrypting to rubbish that
 * then gets sent to REX as a header.
 */
function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — refusing to store REX tokens without it.");
  return scryptSync(secret, "os-rex-token", 32);
}

function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

function open(sealed: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split(".");
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
  } catch {
    // A key change or a tampered row. Treat as "not signed in" rather than
    // throwing: the worst case should be one more sign-in, not a broken page.
    return null;
  }
}

/* ───────────────────────── signing in ───────────────────────── */

export type RexSession = {
  connected: boolean;
  email?: string;
  expiresAt?: string;
  /** True inside the last day, so the UI can ask before it lapses. */
  expiringSoon?: boolean;
  reason?: string;
};

export async function signInToRex(
  userId: string,
  email: string,
  password: string
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  const res = await fetch(`${REX_BASE}/v1/rex/Authentication/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      token_lifetime: LIFETIME_SECONDS,
      ...(process.env.REX_ACCOUNT_ID ? { account_id: Number(process.env.REX_ACCOUNT_ID) } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);

  if (!res) return { ok: false, error: "Couldn't reach REX." };
  const j = (await res.json().catch(() => null)) as
    | { result?: string; error?: { message?: string } }
    | null;

  const token = typeof j?.result === "string" ? j.result : null;
  if (!token) {
    return {
      ok: false,
      error: j?.error?.message ?? "REX wouldn't accept that email and password.",
    };
  }

  const expiresAt = new Date(Date.now() + LIFETIME_SECONDS * 1000).toISOString();
  if (hasDb()) {
    await q(
      `INSERT INTO os_rex_tokens (user_id, rex_email, token_enc, issued_at, expires_at)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (user_id) DO UPDATE
         SET rex_email = EXCLUDED.rex_email,
             token_enc = EXCLUDED.token_enc,
             issued_at = NOW(),
             expires_at = EXCLUDED.expires_at`,
      [userId, email, seal(token), expiresAt]
    );
  }
  // The password goes no further. It was never written anywhere.
  return { ok: true, expiresAt };
}

/** Their live token, or null if they've never signed in or it has lapsed. */
export async function rexTokenFor(userId: string | null): Promise<string | null> {
  if (!userId || !hasDb()) return null;
  const rows = await q<{ token_enc: string; expires_at: string }>(
    `SELECT token_enc, expires_at FROM os_rex_tokens WHERE user_id = $1`,
    [userId]
  ).catch(() => []);
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return open(row.token_enc);
}

export async function rexSessionFor(userId: string | null): Promise<RexSession> {
  if (!userId) return { connected: false, reason: "Not signed in to the OS." };
  if (!hasDb()) return { connected: false, reason: "No database on this environment." };
  const rows = await q<{ rex_email: string; expires_at: string }>(
    `SELECT rex_email, expires_at FROM os_rex_tokens WHERE user_id = $1`,
    [userId]
  ).catch(() => []);
  const row = rows[0];
  if (!row) return { connected: false };
  const left = new Date(row.expires_at).getTime() - Date.now();
  if (left <= 0) return { connected: false, email: row.rex_email, reason: "Your REX sign-in has lapsed." };
  return {
    connected: true,
    email: row.rex_email,
    expiresAt: row.expires_at,
    expiringSoon: left < RENEW_WITHIN_HOURS * 3600 * 1000,
  };
}

export async function forgetRex(userId: string): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_rex_tokens WHERE user_id = $1`, [userId]);
}
