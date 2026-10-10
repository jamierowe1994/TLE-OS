import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Signing out ends the session, not just the cookie (Rig run 2, P-009,
 * 10 Oct 2026).
 *
 * A staff session token is userId.expiry.signature and is checked without a
 * database - by lib/auth verifySessionToken, from some seventy routes. So
 * signing out only cleared the browser's cookie, and anybody holding a copy
 * of the token (a shared computer, a saved profile) stayed signed in for the
 * rest of its thirty days.
 *
 * Now the token's signature goes into os_session_revoked when its holder
 * signs out, and this process keeps the live list in memory, on globalThis,
 * where verifySessionToken reads it. Refreshed every 30 seconds, so another
 * server instance picks a sign-out up within half a minute; the instance that
 * took the sign-out has it at once.
 */
const G = globalThis as { __osRevokedSessions?: Set<string>; __osRevokedSync?: boolean };

function revoked(): Set<string> {
  return (G.__osRevokedSessions ??= new Set<string>());
}

export async function refreshRevoked(): Promise<void> {
  if (!hasDb()) return;
  const rows = await q<{ sig: string }>(`SELECT sig FROM os_session_revoked WHERE expires_at > NOW()`).catch(() => null);
  if (!rows) return; // keep what we had rather than forget every sign-out on a blip
  const next = new Set(rows.map((r) => r.sig));
  for (const s of revoked()) if (!next.has(s)) revoked().delete(s);
  for (const s of next) revoked().add(s);
}

/** Load the list and keep it fresh. Safe to call more than once. */
export function startRevokedSync(): void {
  if (G.__osRevokedSync || !hasDb()) return;
  G.__osRevokedSync = true;
  void refreshRevoked();
  const t = setInterval(() => {
    void refreshRevoked();
  }, 30_000);
  (t as { unref?: () => void }).unref?.();
  /* Expired rows are dead weight: cleared once a day. */
  const sweep = setInterval(() => {
    void q(`DELETE FROM os_session_revoked WHERE expires_at < NOW()`).catch(() => {});
  }, 24 * 60 * 60 * 1000);
  (sweep as { unref?: () => void }).unref?.();
}

/** End this one session: the token is refused from now on, everywhere. */
export async function revokeSession(token: string | undefined): Promise<void> {
  const parts = (token ?? "").split(".");
  if (parts.length !== 3) return;
  const [userId, exp, sig] = parts;
  const expMs = Number(exp);
  if (!sig || !Number.isFinite(expMs) || expMs < Date.now()) return;
  revoked().add(sig);
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_session_revoked (sig, user_id, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))
     ON CONFLICT (sig) DO NOTHING`,
    [sig, userId, expMs]
  );
}
