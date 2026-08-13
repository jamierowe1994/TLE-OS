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
/**
 * The maximum REX allows: exactly two weeks. Measured — 1209600 is accepted
 * and anything above it is refused by name.
 *
 * We asked for seven at first, out of caution. That caution cost a sign-in a
 * week for no security gained: the token is sealed at rest either way, and a
 * fortnight is still short enough that a leaked one dies on its own. There is
 * no renew method on REX's Authentication service (login,
 * loginWithGlobalAuthToken, loginWithIntegrationAccessToken, logout,
 * resetPassword — nothing else), so a longer token is the ONLY lever we have
 * without either storing passwords or getting an integration access token
 * out of REX.
 */
const LIFETIME_SECONDS = 14 * 24 * 60 * 60;
/** Prompt for a fresh sign-in before it lapses, never after. Two days, so it
 *  can be done at a convenient moment rather than mid-job. */
const RENEW_WITHIN_HOURS = 48;

/**
 * Extend once a token is past halfway. Anyone who so much as opens the OS in
 * a week keeps their sign-in alive without noticing, and the prompt is left
 * for people who have genuinely been away a fortnight.
 */
const EXTEND_WHEN_UNDER_MS = (LIFETIME_SECONDS / 2) * 1000;

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

/**
 * Keeping a live token alive, without anyone typing anything.
 *
 * REX has no OAuth and no refresh token — but UserProfile/extendSessionToken
 * pushes out the expiry of the token you present, for the user that token
 * belongs to. Same token, later deadline, no password. It returns the new
 * expiry as a unix timestamp.
 *
 * Found by asking the F&C team how theirs stays signed in: they extend rather
 * than refresh, and the method is on UserProfile rather than Authentication,
 * which is why it wasn't in the auth service's method list.
 *
 * Fire-and-forget on purpose: this must never delay the call the person is
 * actually making, and a failed extension is harmless — the token is still
 * valid, and it will be tried again next time.
 */
async function extend(userId: string, token: string): Promise<void> {
  try {
    const r = await fetch(`${REX_BASE}/v1/rex/UserProfile/extendSessionToken`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ token_lifetime: LIFETIME_SECONDS }),
      signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json().catch(() => null)) as { result?: unknown } | null;
    // Unix seconds. Anything else means REX declined, and the old expiry
    // stands rather than being overwritten with a guess.
    const until = typeof j?.result === "number" ? j.result : null;
    if (!until) return;
    await q(`UPDATE os_rex_tokens SET expires_at = $2 WHERE user_id = $1`, [
      userId,
      new Date(until * 1000).toISOString(),
    ]);
  } catch {
    /* still signed in; try again on the next call */
  }
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
  const token = open(row.token_enc);
  if (!token) return null;

  // Past halfway: push it out while they're here, so they never meet the
  // prompt at all. Deliberately not awaited.
  if (new Date(row.expires_at).getTime() - Date.now() < EXTEND_WHEN_UNDER_MS) {
    void extend(userId, token);
  }
  return token;
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
