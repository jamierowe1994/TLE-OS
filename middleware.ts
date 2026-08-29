import { NextRequest, NextResponse } from "next/server";

/**
 * The door.
 *
 * ── What changed, 27 Aug 2026 ─────────────────────────────────────────────
 *
 * This used to be a single shared access code (OS_ACCESS_CODE) — a preview
 * gate from before the OS had accounts. It has now got them: sign-in, joining
 * by invite, password reset, per-person sessions, roles, and multi-tenant
 * scoping that depends on knowing WHICH person is asking.
 *
 * A shared code cannot do any of that. It answers "is this someone we let into
 * the building", where every screen now needs "which of our people is this".
 * Keeping both would mean two locks where the weaker one — one string, known to
 * everybody, passed around in chat — sets the real security level.
 *
 * So the code is gone. A valid session is the only way in.
 *
 * ── The paths that must stay open, and why ────────────────────────────────
 *
 * Nobody can present a session before they have one, so the routes that MINT
 * one are exempt: /sign-in, /join, /reset and their APIs. This is also the
 * lockout valve — /reset works for anybody with an account and a mailbox, so
 * there is no state in which a real person is permanently shut out.
 *
 * NOT `api/auth` wholesale, which is the obvious and wrong way to write that.
 * It would expose /api/auth/register — and Susan has no account yet, so
 * anybody who found the endpoint could set a password on her address without
 * ever owning her mailbox. The exemptions are named one by one: login, logout,
 * me, verify, reset. Register is deliberately NOT among them; joining goes
 * through an emailed token, which is the whole point of having one.
 *
 * /present and /tenant are exempt for a different reason: they are for
 * landlords and tenants, who have no account and never will. Their own random
 * token is the credential.
 *
 * /brand is exempt because a logo in an email is fetched by the recipient's
 * mail client, which has no cookie and never will. Behind the door, every
 * email would arrive with a broken image.
 *
 * ── The anchoring, which this file has been bitten by before ──────────────
 *
 * ⚠️ EACH ALTERNATIVE IS ANCHORED TO A WHOLE PATH SEGMENT — `(?:/|$)`.
 *
 * They were once bare prefixes, and an exemption leaked to every path that
 * merely STARTED with one: `api/key` exempted `/api/keys` — the REX key
 * register, which key sets exist for which properties — on the public
 * internet with no credential at all. `present` did the same to
 * `/api/presentations`.
 *
 * Anchored, `sign-in` matches `/sign-in` and `/sign-in/anything` but NOT
 * `/sign-in-as-someone-else`. Every change here is tested against that.
 */

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A valid, unexpired session — verified, not sniffed.
 *
 * `lib/auth` signs with node:crypto and cannot be imported into edge
 * middleware, so the same HMAC is recomputed here with Web Crypto. Parity is
 * tested: a real token is accepted, and tampered signature, tampered user id,
 * extended expiry, expired and forged are all rejected.
 *
 * Checking merely that the cookie EXISTS would mean typing `os_session=x` into
 * a browser walks straight past this.
 */
async function hasValidSession(token: string | undefined): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [userId, exp, sig] = parts;
  if (!Number(exp) || Number(exp) < Date.now()) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}.${exp}`));
  const expected = b64url(mac);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * Routes a MACHINE calls, which therefore cannot be sent to a sign-in page.
 *
 * ── The bug this fixes ────────────────────────────────────────────────────
 *
 * Every one of these authenticates itself — a constant-time comparison against
 * CRON_SECRET, or an owner session. But this middleware matched them anyway and
 * answered a cron's POST with `307 → /sign-in`. A scheduler follows the
 * redirect, gets an HTML login page, sees a 200, and reports success. So the
 * cron James set up had been failing silently: no error anywhere, nothing
 * warmed, and the only symptom was figures that never got fresher.
 *
 * Measured 28 Aug 2026 against the live site: all five returned 307.
 *
 * ── Why exempting them is safe ────────────────────────────────────────────
 *
 * Because the redirect was never what protected them. Each route checks its own
 * secret in constant time and refuses without one; the middleware was a second
 * lock on a door that already had one, and it was jamming the door shut against
 * the one caller allowed through.
 *
 * Two of them (esign/poll, scheduled-sends/run) used to treat an UNSET secret
 * as "open" — fine while nothing could reach them, dangerous the moment they
 * became reachable. Both now fail shut in production. That fix is a
 * precondition of this list, not a coincidence: do not add a route here
 * without checking it refuses when its secret is missing.
 */
const MACHINE_ROUTES = [
  "/api/business/backfill",           // freezes closed months into gci_months
  "/api/business/income-months/warm", // the warmer James already scheduled
  "/api/teg/sync",                    // pulls the roster from the TEG Hub
  "/api/campaigns/run",               // nurture sends
  "/api/esign/poll",                  // DocuSeal envelope status
  "/api/scheduled-sends/run",         // queued email
  "/api/pretenancy/alerts/run",       // the pre-tenancy digest
  "/api/compliance/reminders/run",    // the 30/14/7 certificate chase
];

export async function middleware(req: NextRequest) {
  /* Straight through to the route, which does its own authentication. Exact
     match, not startsWith — a prefix test would exempt
     /api/teg/sync-everything too, and that is how an allowlist quietly
     becomes a wildcard. */
  if (MACHINE_ROUTES.includes(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  /**
   * With no AUTH_SECRET the door stands open — local dev only.
   *
   * In production `lib/auth` refuses to sign or verify anything without it, so
   * an unset secret there means nobody could hold a valid session anyway; this
   * would lock every person out of every page rather than fail safe. The loud
   * failure belongs at the signing layer, where it already is, not here where
   * it presents as a site that is simply down.
   */
  if (!process.env.AUTH_SECRET) return NextResponse.next();

  if (await hasValidSession(req.cookies.get("os_session")?.value)) {
    return NextResponse.next();
  }

  /* Send them to sign in, and bring them back to whatever they were reaching
     for. /sign-in refuses any `next` that is not a path on this site — an open
     redirect on a login page is a phishing primitive. */
  const url = req.nextUrl.clone();
  const wanted = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/sign-in";
  url.search = wanted && wanted !== "/" ? `?next=${encodeURIComponent(wanted)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!(?:sign-in|join|reset|api/auth/login|api/auth/logout|api/auth/me|api/auth/verify|api/auth/reset|tenant|landlord|present|api/present|brand|_next|icons|illustrations)(?:/|$)|favicon\\.ico$|robots\\.txt$).*)",
  ],
};
