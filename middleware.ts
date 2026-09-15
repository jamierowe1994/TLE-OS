import { NextRequest, NextResponse } from "next/server";
import { areaForPage, areaForWrite, canAct, canSee, levelOf, lockedSentence, type AreaAccess } from "@/lib/area-map";

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
 * `api/tenant/passport` is named in full rather than as `api/tenant`, and the
 * distinction is the whole lesson of this file: the page at /tenant/passport
 * is already exempt, so leaving its API behind the door would have given a
 * tenant a form that renders and then silently fails to load or save - a 307
 * to /sign-in that arrives as unparseable HTML. But exempting `api/tenant`
 * wholesale would exempt every future route under it, written by somebody who
 * never read this comment. The route itself still authenticates the one
 * privileged thing it does: minting a link needs a signed-in member of staff.
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
  return (await sessionUserId(token, process.env.AUTH_SECRET)) !== null;
}

/** The same check, answering WHO: the user id in a valid token, or null. */
async function sessionUserId(token: string | undefined, secret: string | undefined): Promise<string | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!Number(exp) || Number(exp) < Date.now()) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}.${exp}`));
  const expected = b64url(mac);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? userId : null;
}

/* ── The area switches (15 Sep 2026) ───────────────────────────────────────

   The pilot goes on one area at a time: hidden, look only, testers, everyone
   (lib/area-map). This is where that is enforced, because it is the one place
   every page visit and every write passes through - a guard in each of the
   hundred-odd write routes would be a hundred chances to forget one.

   The edge cannot reach the database, so the answer comes from
   /api/area-access and is held for a few seconds per person. Two rules keep it
   from ever becoming the thing that breaks the pilot:

     FAIL OPEN. If the check does not answer, the request goes through. The
     switches control a rollout; an outage in them must not lock every agent
     out of every screen.

     WRITES AND PAGES ONLY. Reads are never refused, because the dashboard
     reads from half the areas and a hidden Finances must not blank its tiles. */

/** lib/auth's development fallback, so the gate can be tried on a laptop. */
const DEV_SECRET = "dev-only-secret-not-for-production";
const ACCESS_TTL_MS = 15_000;
const accessCache = new Map<string, { at: number; access: AreaAccess | null }>();

async function accessOf(req: NextRequest, userId: string): Promise<AreaAccess | null> {
  const hit = accessCache.get(userId);
  /* A failed check is only remembered briefly, so a blip is not fifteen
     seconds of the gate standing open. */
  if (hit && Date.now() - hit.at < (hit.access ? ACCESS_TTL_MS : 3_000)) return hit.access;
  let access: AreaAccess | null = null;
  try {
    const res = await fetch(new URL("/api/area-access", req.nextUrl.origin), {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    const j = res.ok ? ((await res.json()) as Partial<AreaAccess>) : null;
    if (j && typeof j.gated === "boolean") {
      access = { gated: j.gated, tester: Boolean(j.tester), levels: (j.levels ?? {}) as AreaAccess["levels"] };
    }
  } catch {
    access = null;
  }
  if (accessCache.size > 2_000) accessCache.clear();
  accessCache.set(userId, { at: Date.now(), access });
  return access;
}

async function areaGate(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const area = isApi ? areaForWrite(path, req.method) : req.method === "GET" ? areaForPage(path) : null;
  if (!area) return null;

  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? DEV_SECRET : undefined);
  const userId = await sessionUserId(req.cookies.get("os_session")?.value, secret);
  if (!userId) return null;

  const access = await accessOf(req, userId);
  if (!access?.gated) return null;

  if (isApi) {
    if (canAct(access, area)) return null;
    /* 423 Locked, in the shape every screen already prints: { ok, error }. */
    return NextResponse.json(
      { ok: false, areaLocked: area.id, error: lockedSentence(area, levelOf(access, area.id)) },
      { status: 423 }
    );
  }
  if (canSee(access, area)) return null;
  const url = req.nextUrl.clone();
  url.pathname = "/dashboard";
  url.search = `?closed=${area.id}`;
  return NextResponse.redirect(url);
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
  "/api/pretenancy/watch",            // the Propoly watcher, every five minutes
  "/api/compliance/warm",             // sweeps the book before anybody asks
  "/api/compliance/reminders/run",    // the 30/14/7 certificate chase
  "/api/agent-compliance/remind",     // the agent's own 30/14/7, and Michael's list
  "/api/lettings-capture/run",        // the daily market sweep
  "/api/leads/scan",                  // the lead ledger, every five minutes
  "/api/bugs/bot",                    // the bug bot: takes bugs, records its fixes (cron key)
  "/api/viewings/sweep",              // the viewings ledger, nightly
  "/api/maintenance/snapshot",        // the maintenance board's figures, daily
  "/api/radar/run",                   // Landlord Radar: sweep the patch, rescore, digest
  "/api/bond/company-sync",           // Bond: read the Land Registry company files, monthly
  "/api/bond/sales-sync",             // Bond: read the Land Registry price-paid file, monthly
  "/api/bond/hmo-sync",               // Bond: read the councils' HMO registers, monthly
  "/api/bond/epc-sync",               // Bond: read the EPC register, monthly, once there is a token
  "/api/bond/planning-sync",          // Bond: read the councils' planning registers, weekly
  "/api/bond/nudges-sync",            // Bond: read our own book out of REX, daily, for the call list
  /* DocuSeal POSTs a signed contract here. Without this it got 307 to
     /sign-in — measured against the live site, not guessed — so the document
     would never have reached our code and no signed terms would ever have
     been stored. Verified against the precondition above: it returns 503 with
     no DOCUSEAL_WEBHOOK_SECRET set and 401 on a signature that does not
     check out, so the redirect was never what protected it. */
  "/api/docuseal/webhook",            // signed contracts coming back
  /* Flow saying a recording moved on, and the same bug as the line above:
     measured against the live site on 1 Sep, POST /api/video/webhook answered
     307 to /sign-in. Flow retries at 1m, 5m, 30m, 2h, 6h and then gives up, so
     every welcome video would have sat on "uploading" for ever while the
     recording itself was perfectly fine.

     Meets the precondition: with no FLOW_WEBHOOK_SECRET it answers 503 rather
     than accepting anything, and with one it verifies an HMAC over the RAW
     body before reading a single field. The redirect was never the guard. */
  "/api/video/webhook",               // Flow: recording ready / failed
  /* The button in the video nudge. Carries a single-use token that signs the
     agent in and lands them on the recorder; it has to be reachable without
     a session because getting the session is what it is for. Refuses without
     a valid token, so the redirect was never the guard here either. */
  "/api/record/enter",
  /* The handover rehearsal, on a cron. Authenticates itself with CRON_SECRET
     in x-cron-key and fails shut without one, like the other crons. It only
     ever runs in shadow: live reads, nothing written. */
  "/api/handover/scan",
  /* The reminders, hourly. This was the bug the whole comment above is about,
     found 9 Sep 2026: the route had been written and never scheduled, and
     the moment it was scheduled it would have answered 307 to /sign-in, which
     a scheduler reads as success. Nothing would have run and nothing would
     have complained. Meets the precondition: with no CRON_SECRET the key
     comparison fails and the route answers 401, so the redirect was never
     what protected it. */
  "/api/reminders/run",
];

export async function middleware(req: NextRequest) {
  /* Straight through to the route, which does its own authentication. Exact
     match, not startsWith — a prefix test would exempt
     /api/teg/sync-everything too, and that is how an allowlist quietly
     becomes a wildcard. */
  if (MACHINE_ROUTES.includes(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  /* Before the sign-in check, so it also runs on a laptop with no AUTH_SECRET.
     It only ever acts on a valid session, so it can never let anybody in. */
  const closed = await areaGate(req);
  if (closed) return closed;

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
    /* `rex` is public/rex: the handful of property photographs in the static
       REX export, used by the sample listings and by the landlord demo. The
       demo is a public page, and behind the door those images were a 307 to
       the sign-in page - a broken picture where the house should be, on the
       one page Susan is being shown. Photographs of houses on the market are
       not a secret; the folder holds nothing else. */
    /* `preview` is the onboarding demonstration, and it is exempt because the
       whole point of it is a link James can send to somebody with no account.
       It is safe to exempt because the route itself refuses without a valid
       share token, and because everything under it is self-contained: mock
       rail, sample figures, no fetches, no writes, no session. See
       lib/preview-token.ts - that token must never gate anything real. */
    /* `rehearsal` is the maintenance walkthrough, and it is exempt for the
       same reason: James sends it to people who have no account. It is safe
       because its own token is checked at the layout and again on every API
       call, and because that API can only ever touch a job flagged
       `rehearsal` - a real works order id in the URL opens nothing. Its
       emails are written and kept rather than sent, so nothing anybody
       presses in there can reach a customer. See lib/rehearsal.ts. */
    /* `email` is public/email: the artwork every email we send points at.
       It sat behind the door, so a mail client - which is nobody, signed in
       nowhere - got a 307 to the sign-in page instead of a picture. Every
       image in the pilot invite was broken, including the one James sent
       Kirstie on 14 Sep. Same reasoning as `brand` and `illustrations`: it is
       a folder of drawings, it holds nothing else, and an email cannot
       authenticate. */
    /* `visit` is the tenant answering whether we may come round for an
       inspection. Exempt for the same reason as `repair` and `tenant`: the
       person answering has no account and never will, and their random token
       IS the credential. Safe because /api/visit refuses any token it does
       not hold, and the only thing it can write is that one inspection's
       access answer - a yes is refused unless it names one of the times we
       actually offered. See lib/inspections. */
    "/((?!(?:sign-in|join|reset|preview|api/auth/login|api/auth/logout|api/auth/me|api/auth/verify|api/auth/reset|tenant|landlord|present|api/present|invoice|contractor|api/contractor|repair|api/repair|visit|api/visit|rehearsal|api/rehearsal|proof|api/tenant/passport|api/landlord|brand|email|rex|r|api/r|_next|icons|illustrations)(?:/|$)|favicon\\.ico$|robots\\.txt$|manifest\\.webmanifest$).*)",
  ],
};
