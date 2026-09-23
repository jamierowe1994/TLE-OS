import { NextRequest, NextResponse } from "next/server";
import { areaForPage, areaForWrite, canAct, canSee, levelOf, lockedSentence, needsTargetCheck, type AreaAccess } from "@/lib/area-map";

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

  return sameSig(await hmac(secret, `${userId}.${exp}`), sig) ? userId : null;
}

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

/** Constant time, so a forged signature learns nothing from how long it took. */
function sameSig(expected: string, sig: string): boolean {
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/* ── The area switches (15 Sep 2026) ───────────────────────────────────────

   The pilot goes on one area at a time: hidden, look only, testers, everyone
   (lib/area-map). This is where that is enforced, because it is the one place
   every page visit and every write passes through - a guard in each of the
   hundred-odd write routes would be a hundred chances to forget one.

   The edge cannot reach the database, so the answer comes from
   /api/area-access and is held for a few seconds per person. Two rules keep it
   from ever becoming the thing that breaks the pilot:

     PAGES FAIL OPEN, WRITES DO NOT (21 Sep 2026). If the check does not
     answer, a page still opens: the switches control a rollout, and an outage
     in them must not lock every agent out of every screen. A WRITE is
     different. It used to go through as well, which meant that for as long as
     the check was slow, look only was not. With a whole agency about to be
     let in to practise on real data, "nothing sends" has to hold on a bad day
     too - so a write with no answer falls back to the last answer this person
     got, and with no answer at all it is refused and asked to try again.

     WRITES AND PAGES ONLY. Reads are never refused, because the dashboard
     reads from half the areas and a hidden Finances must not blank its tiles.

   A WRITE WAITS LONGER THAN A PAGE (23 Sep 2026). Five saves were refused on
   22 Sep with "we couldn't check", and none of them was an outage: each was a
   fresh instance after a deploy, where the first database query also builds
   the schema, and the check could not answer inside 2.5 seconds. The last
   good answer lives in this process only, so a fresh one has none to fall
   back on. Now a write with nothing to fall back on gives the check eight
   seconds - the save behind it would pay the same cold start anyway - and the
   schema is built at boot (instrumentation.ts) so there is less cold to pay.
   Pages keep 2.5 seconds: they fail open, so waiting buys them nothing.

   THE LAST GOOD ANSWER TRAVELS WITH THE PERSON (23 Sep 2026). Held only in
   this process, it was empty on every fresh instance and never shared between
   replicas, so after a restart somebody's first save was the one refused.
   Every real answer is now also written into a signed cookie (os_area), good
   for an hour, and a write with no answer falls back on whichever is newer:
   this process's memory or the cookie. Signed with AUTH_SECRET under its own
   prefix, bound to the session's user id, and only ever read when the check
   did not answer - it can stand in for an answer, never overrule one. A
   patient write also gets a second try inside its eight seconds, so a check
   cut off by a cold start is asked again rather than given up on.

   AND IT ASKS THE SERVER BY ITS OWN ADDRESS (23 Sep 2026). The real reason
   for every one of those 503s, found in Railway's request log afterwards:
   they came back in 4 to 36 milliseconds - no timeout, no cold start - and
   not one of the middleware's checks ever reached the server. On 23 Sep
   every gated save on the live site, 37 of 37, was refused. The check
   fetched req.nextUrl.origin, which under next start is the listening
   address, http://localhost:8080, and inside Railway's container that
   fails at once (it works on a Mac, which is why no local test caught it).
   The pages never showed it because they fail open. Now it tries
   127.0.0.1, then ::1, then the old origin, keeps whichever answered, and
   says in the log when none did. */

/** lib/auth's development fallback, so the gate can be tried on a laptop. */
const DEV_SECRET = "dev-only-secret-not-for-production";
const ACCESS_TTL_MS = 15_000;
const CHECK_MS = 2_500;
/** A write with no last good answer to fall back on. See above. */
const PATIENT_CHECK_MS = 8_000;
const accessCache = new Map<string, { at: number; access: AreaAccess | null }>();
/** The last answer that WAS an answer, per person, in this process. Never expires: see above. */
const lastGood = new Map<string, { at: number; access: AreaAccess }>();

const AREA_COOKIE = "os_area";
const AREA_COOKIE_MS = 60 * 60_000;

interface Held {
  at: number;
  access: AreaAccess;
}

/** `<payload>.<signature>`, the payload being { u, at, a } as base64url JSON. */
async function sealAccess(secret: string, userId: string, held: Held): Promise<string> {
  const payload = btoa(JSON.stringify({ u: userId, at: held.at, a: held.access }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${payload}.${await hmac(secret, `area.${payload}`)}`;
}

/** The cookie's answer, if it is signed, this person's, and under an hour old. */
async function openAccess(secret: string, userId: string, cookie: string | undefined): Promise<Held | null> {
  if (!cookie || cookie.length > 4_000) return null;
  const [payload, sig, extra] = cookie.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  if (!sameSig(await hmac(secret, `area.${payload}`), sig)) return null;
  try {
    const j = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { u?: unknown; at?: unknown; a?: Partial<AreaAccess> };
    const at = Number(j.at);
    if (j.u !== userId || !at || Date.now() - at > AREA_COOKIE_MS || at > Date.now() + 60_000) return null;
    if (!j.a || typeof j.a.gated !== "boolean") return null;
    return { at, access: { gated: j.a.gated, tester: Boolean(j.a.tester), levels: (j.a.levels ?? {}) as AreaAccess["levels"] } };
  } catch {
    return null;
  }
}

/** The address that last answered. Tried first next time. */
let selfOrigin: string | null = null;
let lastWarnAt = 0;

/** Where this server can reach itself: its own socket first, the listening origin last. */
function selfOrigins(req: NextRequest): string[] {
  const port = process.env.PORT || req.nextUrl.port;
  const all = [
    ...(selfOrigin ? [selfOrigin] : []),
    ...(port ? [`http://127.0.0.1:${port}`, `http://[::1]:${port}`] : []),
    req.nextUrl.origin,
  ];
  return [...new Set(all)];
}

/** A failed check is said out loud, once a minute at most, so it is never silent again. */
function warnCheck(msg: string) {
  if (Date.now() - lastWarnAt < 60_000) return;
  lastWarnAt = Date.now();
  console.warn(`[area-gate] ${msg}`);
}

/**
 * Ask this server a question, from the middleware. Each address in turn
 * until one answers, all inside `ms`. Null on anything but a 2xx.
 */
async function askSelf(req: NextRequest, path: string, ms: number, init: RequestInit = {}): Promise<Response | null> {
  const deadline = Date.now() + ms;
  const failures: string[] = [];
  for (const origin of selfOrigins(req)) {
    const left = deadline - Date.now();
    if (left < 100) break;
    try {
      const res = await fetch(new URL(path, origin), {
        ...init,
        headers: { cookie: req.headers.get("cookie") ?? "", ...(init.headers as Record<string, string> | undefined) },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(left),
      });
      if (res.ok) {
        selfOrigin = origin;
        return res;
      }
      failures.push(`${origin} ${res.status}`);
    } catch (e) {
      const cause = (e as { cause?: { code?: string } })?.cause?.code;
      failures.push(`${origin} ${cause ?? (e instanceof Error ? e.name : "failed")}`);
    }
  }
  warnCheck(`${path} did not answer in ${ms}ms: ${failures.join(", ") || "no time to ask"}`);
  return null;
}

/** One question to /api/area-access, with a ceiling. Null on anything but a real answer. */
async function askOnce(req: NextRequest, ms: number): Promise<AreaAccess | null> {
  try {
    const res = await askSelf(req, "/api/area-access", ms);
    const j = res ? ((await res.json()) as Partial<AreaAccess>) : null;
    if (j && typeof j.gated === "boolean") {
      return { gated: j.gated, tester: Boolean(j.tester), levels: (j.levels ?? {}) as AreaAccess["levels"] };
    }
  } catch {
    /* Not JSON: no answer. */
  }
  return null;
}

/**
 * Asks, and says whether the answer is new - a new one is what goes into the
 * cookie. `fallback` is whether there is a last good answer to use instead.
 */
async function accessOf(
  req: NextRequest,
  userId: string,
  write: boolean,
  fallback: boolean
): Promise<{ access: AreaAccess | null; fresh: boolean }> {
  const hit = accessCache.get(userId);
  const patient = write && !fallback;
  /* A failed check is only remembered briefly, so a blip is not fifteen
     seconds of the gate standing open. A write with nothing to fall back on
     does not settle for a remembered failure: it asks again, patiently. */
  if (hit && Date.now() - hit.at < (hit.access ? ACCESS_TTL_MS : 3_000) && (hit.access || !patient)) {
    return { access: hit.access, fresh: false };
  }
  /* Patient: a first try at the usual ceiling, then one more with what is
     left of the eight seconds. A cold instance usually answers the second. */
  const started = Date.now();
  let access = await askOnce(req, CHECK_MS);
  if (!access && patient) {
    const left = PATIENT_CHECK_MS - (Date.now() - started);
    if (left > 500) access = await askOnce(req, left);
  }
  if (accessCache.size > 2_000) accessCache.clear();
  accessCache.set(userId, { at: Date.now(), access });
  if (access) {
    if (lastGood.size > 2_000) lastGood.clear();
    lastGood.set(userId, { at: Date.now(), access });
  }
  return { access, fresh: access !== null };
}

/**
 * Everything on a request that could be the id of a record: the path, the
 * query and a JSON body, to three levels. For an area on practice, where the
 * answer depends on WHAT is being written to (lib/practice-target). Generic on
 * purpose - a hundred write routes name their target a hundred ways, and a
 * list of field names would be a list with holes in it.
 */
async function candidateIds(req: NextRequest): Promise<string[]> {
  const out = new Set<string>();
  const take = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out.add(String(v));
    else if (typeof v === "string" && v.length > 0 && v.length <= 80) out.add(v);
  };
  req.nextUrl.pathname.split("/").slice(2).forEach((seg) => take(decodeURIComponent(seg)));
  req.nextUrl.searchParams.forEach((v) => take(v));

  const type = req.headers.get("content-type") ?? "";
  const size = Number(req.headers.get("content-length") ?? 0);
  if (type.includes("application/json") && size > 0 && size < 200_000) {
    const walk = (v: unknown, depth: number) => {
      if (out.size > 80) return;
      if (Array.isArray(v)) v.slice(0, 20).forEach((x) => walk(x, depth + 1));
      else if (v && typeof v === "object") {
        if (depth < 3) Object.values(v as Record<string, unknown>).forEach((x) => walk(x, depth + 1));
      } else take(v);
    };
    try {
      walk(await req.clone().json(), 0);
    } catch {
      /* Not JSON after all. The path and query are still looked at. */
    }
  }
  return [...out].slice(0, 80);
}

/** Does this write name one of the caller's own test files? False on any doubt. */
async function aimsAtOwnTestFile(req: NextRequest): Promise<boolean> {
  try {
    const ids = await candidateIds(req);
    if (!ids.length) return false;
    const res = await askSelf(req, "/api/area-access/target", 2_500, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const j = res ? ((await res.json()) as { test?: boolean }) : null;
    return j?.test === true;
  } catch {
    return false;
  }
}

/**
 * `closed` is the refusal, if there is one. `cookie` is a new os_area value
 * for the response, whichever way it goes, when the check gave a new answer.
 */
async function areaGate(req: NextRequest): Promise<{ closed: NextResponse | null; cookie: string | null }> {
  const open = { closed: null, cookie: null };
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const area = isApi ? areaForWrite(path, req.method) : req.method === "GET" ? areaForPage(path) : null;
  if (!area) return open;

  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? DEV_SECRET : undefined);
  const userId = await sessionUserId(req.cookies.get("os_session")?.value, secret);
  if (!userId || !secret) return open;

  /* The newer of this process's memory and the cookie the person carries. */
  const inMemory = lastGood.get(userId) ?? null;
  const carried = isApi ? await openAccess(secret, userId, req.cookies.get(AREA_COOKIE)?.value) : null;
  const held = inMemory && carried ? (inMemory.at >= carried.at ? inMemory : carried) : (inMemory ?? carried);

  const { access: answered, fresh } = await accessOf(req, userId, isApi, held !== null);
  const cookie = fresh && answered ? await sealAccess(secret, userId, { at: Date.now(), access: answered }) : null;
  const done = (closed: NextResponse | null) => ({ closed, cookie });

  /* No answer: a page opens regardless; a write uses the last answer this
     person got, and is refused if there has never been one. */
  const access = answered ?? (isApi ? (held?.access ?? null) : null);
  if (!access) {
    if (!isApi) return done(null);
    return done(
      NextResponse.json(
        { ok: false, error: "We couldn't check whether this is switched on for you just now. Nothing was saved - try again in a moment." },
        { status: 503 }
      )
    );
  }
  if (!access.gated) return done(null);

  if (isApi) {
    if (canAct(access, area)) return done(null);
    /* Practice: a real record is look only, the caller's own test file works. */
    if (needsTargetCheck(access, area) && (await aimsAtOwnTestFile(req))) return done(null);
    /* 423 Locked, in the shape every screen already prints: { ok, error }. */
    return done(
      NextResponse.json(
        { ok: false, areaLocked: area.id, error: lockedSentence(area, levelOf(access, area.id)) },
        { status: 423 }
      )
    );
  }
  if (canSee(access, area)) return done(null);
  const url = req.nextUrl.clone();
  url.pathname = "/dashboard";
  url.search = `?closed=${area.id}`;
  return done(NextResponse.redirect(url));
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
  "/api/landlord/property-answers/chase", // signed but questions unfinished: 2, 5, 9 days
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
  "/api/tenant/reminders/run",        // passport nudges and the morning viewing reminder, hourly
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
  const gate = await areaGate(req);
  if (gate.cookie) {
    const cookie = gate.cookie;
    const carry = (res: NextResponse) => {
      res.cookies.set(AREA_COOKIE, cookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: AREA_COOKIE_MS / 1000,
      });
      return res;
    };
    return carry(gate.closed ?? (await doorAfterGate(req)));
  }
  if (gate.closed) return gate.closed;
  return doorAfterGate(req);
}

/** The sign-in half of the door, after the area switches have had their say. */
async function doorAfterGate(req: NextRequest): Promise<NextResponse> {
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
    /* `api/tenant/homes` is Find a home in the tenant portal (18 Sep 2026):
       enquire, alerts, and placing a typed postcode. A tenant has no staff
       session, so behind the door every one of these would 401. Each route
       checks the tenant's own session (currentTenant) and acts only on that
       tenant's email; nothing under it reads anything a stranger could not
       already see on the website. Named in full, per the note at the top. */
    /* The rest of the tenant portal's own API (18 Sep 2026). Found while
       giving James a sign-in on the preview: a tenant could not sign in at
       all - api/tenant/session/password answered a 307 to the STAFF sign-in,
       on production as well - and repairs, documents and sign-out were behind
       the same door. A tenant has no staff session and never will.
         session       sign in (password, rate limited; or an emailed link,
                       rate limited and spent once), who am I, sign out
         maintenance   report and list their own repairs - currentTenant
         documents     send us and fetch their own files - currentTenant
       Every one of them answers only for the tenant in the cookie. Still NOT
       api/tenant wholesale: reminders/run is a cron route with its own key. */
    "/((?!(?:sign-in|join|reset|preview|api/auth/login|api/auth/logout|api/auth/me|api/auth/verify|api/auth/reset|tenant|landlord|present|api/present|invoice|contractor|api/contractor|repair|api/repair|visit|api/visit|rehearsal|api/rehearsal|proof|send|api/tenant/passport|api/tenant/feedback|api/tenant/homes|api/tenant/session|api/tenant/maintenance|api/tenant/documents|api/landlord|api/calendar|brand|email|rex|r|api/r|_next|icons|illustrations)(?:/|$)|favicon\\.ico$|robots\\.txt$|manifest\\.webmanifest$).*)",
  ],
};
