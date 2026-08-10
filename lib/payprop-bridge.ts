import "server-only";

/**
 * Borrowing a PayProp access token from the portal.
 *
 * There is one PayProp connection and no machine-to-machine grant — the
 * v1.1 and v2.0 clients both accept only authorization_code and
 * refresh_token, so this OS cannot authenticate for itself. Rather than
 * have two apps refresh the same credential and race each other (PayProp
 * mints a new refresh token every time, so the loser is left holding a dead
 * one), the portal stays the single refresher and lends out access tokens.
 *
 * This OS therefore never sees, stores or rotates the refresh token. The
 * worst it can do to the portal's connection is nothing at all.
 *
 * Needs, on this environment:
 *   PORTAL_ORIGIN     — https://tle-portal-production.up.railway.app
 *   OS_BRIDGE_SECRET  — the same shared secret set on the portal
 */

const SKEW_MS = 60_000; // hand it back a minute before it dies

let held: { token: string; account: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

export function bridgeConfigured(): boolean {
  return Boolean(process.env.PORTAL_ORIGIN && process.env.OS_BRIDGE_SECRET);
}

async function borrow(account: string): Promise<string | null> {
  const origin = (process.env.PORTAL_ORIGIN ?? "").replace(/\/+$/, "");
  const secret = process.env.OS_BRIDGE_SECRET ?? "";
  if (!origin || !secret) return null;

  const res = await fetch(`${origin}/api/payprop/token?account=${encodeURIComponent(account)}`, {
    headers: { "x-os-bridge": secret },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { ok?: boolean; accessToken?: string };
  if (!j.ok || !j.accessToken) return null;

  // PayProp's access tokens run an hour; hold it a little shorter so a call
  // never starts with a token about to expire mid-flight.
  held = { token: j.accessToken, account, expiresAt: Date.now() + 55 * 60_000 - SKEW_MS };
  return j.accessToken;
}

/** A usable access token, cached until shortly before it expires. */
export async function payPropBearer(account: string = "uk"): Promise<string | null> {
  if (held && held.account === account && held.expiresAt > Date.now()) return held.token;
  // Collapse concurrent callers onto one borrow.
  if (!inflight) {
    inflight = borrow(account).finally(() => { inflight = null; });
  }
  return inflight;
}
