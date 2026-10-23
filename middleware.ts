import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
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
/** The user id in a valid token, or null. */
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
  /* The read log's own hand-over from this file (lib/read-log). The route
     refuses anything not signed with AUTH_SECRET, so the door adds nothing,
     and logging it would log the log. */
  "/api/internal/read-log",
  "/api/business/backfill",           // freezes closed months into gci_months
  "/api/business/income-months/warm", // the warmer James already scheduled
  "/api/teg/sync",                    // pulls the roster from the TEG Hub
  "/api/campaigns/run",               // nurture sends
  "/api/esign/poll",                  // DocuSeal envelope status
  "/api/scheduled-sends/run",         // queued email
  "/api/resend/webhook",              // Resend: delivered / bounced, signed by Resend
  "/api/pretenancy/alerts/run",       // the pre-tenancy digest
  "/api/pretenancy/watch",            // the Propoly watcher, every five minutes
  "/api/mail-threads/poll",           // PLC email replies, by hand (the watcher runs it every five minutes)
  "/api/compliance/warm",             // sweeps the book before anybody asks
  "/api/compliance/reminders/run",    // the 30/14/7 certificate chase
  "/api/agent-compliance/remind",     // the agent's own 30/14/7, and Michael's list
  "/api/lettings-capture/run",        // the daily market sweep
  "/api/leads/scan",                  // the lead ledger, every five minutes
  "/api/listings/stats/sweep",        // the day's portal figures for every live home
  /* Lead counts for marketing's Base44 app. The route asks for its own key
     (MARKETING_FEED_KEY) or a signed-in owner/marketing person, and gives
     counts only - no names, emails or phones. */
  "/api/marketing/leads-feed",
  "/api/marketing/leads-webhook",     // the new-lead ping: status, test, send (owner or cron key)
  "/api/push/scan",                   // the bell to the iPhone app, every five minutes (cron key)
  "/api/bugs/bot",                    // the bug bot: takes bugs, records its fixes (cron key)
  "/api/landlord/property-answers/chase", // signed but questions unfinished: 2, 5, 9 days
  "/api/viewings/sweep",              // the viewings ledger, nightly
  "/api/rex/snapshot",                // REX down: take the copy before it goes (cron key)
  "/api/viewings/texts/run",          // the hour-before viewing text, every five minutes (cron key)
  "/api/viewings/texts/test",         // one test text to a typed number (owner or cron key)
  /* Twilio POSTs a text back to the TLE number here. 503 with no
     TWILIO_AUTH_TOKEN, 401 on a signature that does not check out. */
  "/api/sms/inbound",
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
  /* Flatfair saying a flatbond changed (29 Sep 2026). Refuses with no
     FLATFAIR_WEBHOOK_SECRET and on a wrong ?key=, and only ever re-reads the
     flatbond from Flatfair's own API - the body is a pointer, never fact. */
  "/api/flatfair/webhook",
  "/api/flatfair/sync",               // our copy of Flatfair, on the cron key
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
  /* The clean sweep's running count (28 Sep 2026): counts only, and it checks
     the cron key or a session itself, failing shut without CRON_SECRET. */
  "/api/clean-sweep/summary",
  /* PayProp's files, read only (28 Sep 2026): cron key or see:wiring, checked
     in the route, failing shut without CRON_SECRET. */
  "/api/payprop/attachments",
  "/api/reminders/run",
  /* The weekly book health check (6 Oct 2026): cron key on POST, see:reports
     or the cron key on GET, both checked in the route and failing shut
     without CRON_SECRET. */
  "/api/book-health/run",
];

/**
 * The valuation demo's own appraisals (lib/showroom/demo-appraisals: ids "demo-ma-..."), reached as a
 * real address. Next falls back to a full page load when the demo declines a prefetch, so a press
 * inside the Showroom demo can land on /market-appraisals/demo-ma-raj itself. Coming from a demo
 * page, it goes back into the demo at the same story; anything else carries on as normal (sign in,
 * or "No such appraisal" - there is no real record by that id).
 */
function backIntoDemo(req: NextRequest): NextResponse | null {
  const m = req.nextUrl.pathname.match(/^\/market-appraisals(\/demo-ma-[a-z0-9-]+)?(\/[a-z-]+)?$/);
  if (!m) return null;
  let from: URL;
  try { from = new URL(req.headers.get("referer") ?? ""); } catch { return null; }
  /* Same site only, judged by the host the browser asked for (behind Railway's proxy nextUrl can be internal). */
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const pre = from.host === host || from.origin === req.nextUrl.origin ? from.pathname.match(/^(\/preview\/[^/]+\/back-office)\//)?.[1] : null;
  if (!pre || from.searchParams.get("story") !== "appraisal" || (!m[1] && req.nextUrl.pathname !== "/market-appraisals")) return null;
  const to = new URL(`${pre}/appraisals${m[1] ?? ""}${m[2] ?? ""}`, from.origin);
  for (const k of ["story", "at", "way"]) { const v = from.searchParams.get(k); if (v) to.searchParams.set(k, v); }
  req.nextUrl.searchParams.forEach((v, k) => { if (k !== "_rsc") to.searchParams.set(k, v); });
  return NextResponse.redirect(to);
}

/* A Portfolio home, a listing and a let open as pages of their own
   (/portfolio/<id> 7 Oct, /listings/<id> and /applications/<id> 12 Oct 2026).
   Every older link - search, the bell, Steve, emails, the book health check -
   says /portfolio?open=<id>, /listings?open=<id> or /applications?open=<id>
   (or ?deal=<Propoly id>), and the board's own redirect waited behind the
   whole board loading. Sent on here instead, ?tab= kept, and a notice from
   the bell (&notice=) landing on the home's Tenancy section as the board did.
   The page it lands on is behind every check below like any other. */
function movedToOwnPage(req: NextRequest): NextResponse | null {
  const { pathname, searchParams } = req.nextUrl;
  /* /maintenance?open=<job> goes to the job's own page (James, 21 Oct 2026),
     so every emailed link and reminder built before it lands there. */
  if (pathname !== "/listings" && pathname !== "/applications" && pathname !== "/portfolio" && pathname !== "/maintenance") return null;
  const id = searchParams.get("open") ?? (pathname === "/applications" ? searchParams.get("deal") : null);
  if (!id) return null;
  const url = req.nextUrl.clone();
  url.pathname = `${pathname}/${encodeURIComponent(id)}`;
  const notice = pathname === "/portfolio" ? searchParams.get("notice") : null;
  const tab = notice ? "tenancy" : searchParams.get("tab");
  const keep = new URLSearchParams();
  if (tab) keep.set("tab", tab);
  if (notice) keep.set("notice", notice);
  url.search = keep.size ? `?${keep.toString()}` : "";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const moved = movedToOwnPage(req);
  if (moved) return moved;
  const demo = backIntoDemo(req);
  if (demo) return demo;
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

/* ── The read log (10 Oct 2026, lib/read-log) ──────────────────────────────

   Every signed-in API call, written down against the person: the record of
   who has been reading what, and the only signal there is when somebody (or
   an AI in their browser) copies the book. Taken here because this is the one
   place every call passes with the person known. Queued in memory and handed
   to /api/internal/read-log in one signed batch every few seconds, never on
   the request's own time. */
const LOG_NOISE = new Set([
  /* What an open screen asks by itself on a timer. It would bury what the
     person chose to open and says nothing about them. */
  "/api/auth/me",
  "/api/auth/lock-state",
  "/api/area-access",
  "/api/notifications",
  "/api/m/chats",
  "/api/m/focus",
  "/api/track",
  "/api/prefs",
  "/api/business/freshness",
  "/api/clean-sweep/summary",
  "/api/pretenancy/refresh",
  "/api/rex/status",
  "/api/rex/waiting",
]);
/* The same, for addresses that carry an id (12 Oct 2026): an open chat asks
   for new messages every few seconds, and each face in it is one image call.
   Huddles left open in a tab would otherwise fill the read log and walk
   towards the pace pause on their own. Customer conversations are not here:
   opening one is a choice the log should keep. */
const LOG_NOISE_PREFIX = ["/api/m/rooms", "/api/m/face/", "/api/gifs"];
const isLogNoise = (path: string) => LOG_NOISE.has(path) || LOG_NOISE_PREFIX.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
/* Query values never written down, whatever route carries them. */
const LOG_SECRET_PARAM = /^(token|sig|signature|code|password|secret|state|apikey|api_key)$/i;
const LOG_FLUSH_MS = 5_000;
const LOG_BATCH = 1_000;
const LOG_MAX_QUEUED = 5_000;
type LogEntry = { at: number; userId: string; method: string; path: string; query: string; ip: string };
type LogAlert = { at: number; userId: string; kind: "reading_paused"; detail: string };
let logQueue: LogEntry[] = [];
/* Things an owner should hear about (a pace pause), sent with the next batch. */
let alertQueue: LogAlert[] = [];
let logTimer: ReturnType<typeof setTimeout> | null = null;
let logFlushing = false;
/* The latest request: askSelf works out this server's own address from one. */
let logVia: NextRequest | null = null;

function noteCall(req: NextRequest, userId: string): void {
  try {
    const path = req.nextUrl.pathname;
    if (!path.startsWith("/api/") || isLogNoise(path)) return;
    const query: string[] = [];
    for (const [k, v] of req.nextUrl.searchParams) query.push(LOG_SECRET_PARAM.test(k) ? `${k}=…` : `${k}=${v}`);
    logQueue.push({
      at: Date.now(),
      userId,
      method: req.method,
      path: path.slice(0, 300),
      query: query.join("&").slice(0, 300),
      ip: clientIp(req).slice(0, 64),
    });
    if (logQueue.length > LOG_MAX_QUEUED) logQueue.splice(0, logQueue.length - LOG_MAX_QUEUED);
    logVia = req;
    /* Due by size or by age - the age check as well as the timer, so a
       queue still goes if a timer never fires in this runtime. */
    if (logQueue.length >= LOG_BATCH || Date.now() - logQueue[0].at > LOG_FLUSH_MS * 2) void flushLog();
    else if (!logTimer) logTimer = setTimeout(() => void flushLog(), LOG_FLUSH_MS);
  } catch {
    /* Never in the way of the request. */
  }
}

function noteAlert(a: LogAlert): void {
  alertQueue.push(a);
  if (alertQueue.length > 200) alertQueue.splice(0, alertQueue.length - 200);
  void flushLog();
}

async function flushLog(): Promise<void> {
  if (logTimer) clearTimeout(logTimer);
  logTimer = null;
  if (logFlushing) return;
  const via = logVia;
  const secret = process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? DEV_SECRET : undefined);
  if (!via || !secret || (!logQueue.length && !alertQueue.length)) return;
  logFlushing = true;
  const batch = logQueue.splice(0, LOG_BATCH);
  const alerts = alertQueue.splice(0);
  try {
    const body = JSON.stringify({ entries: batch, alerts });
    const res = await askSelf(via, "/api/internal/read-log", 5_000, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "x-os-log-sig": await hmac(secret, `read-log.${body}`) },
    });
    /* Not taken: back on the front of the queue for the next go, inside the
       cap, so an outage costs the oldest calls and never the memory. */
    if (!res) {
      logQueue = [...batch, ...logQueue].slice(-LOG_MAX_QUEUED);
      alertQueue = [...alerts, ...alertQueue].slice(-200);
    }
  } catch {
    logQueue = [...batch, ...logQueue].slice(-LOG_MAX_QUEUED);
    alertQueue = [...alerts, ...alertQueue].slice(-200);
  } finally {
    logFlushing = false;
  }
  if ((logQueue.length || alertQueue.length) && !logTimer) logTimer = setTimeout(() => void flushLog(), LOG_FLUSH_MS);
}

/* The same words as lib/lockout LOCKED_MESSAGE, which this edge file cannot
   import (it reaches the database). */
const LOCKED_MESSAGE = "Your access to TLE OS has been paused. Speak to James.";
const LOCK_TTL_MS = 20_000;
type DoorState = { locked: boolean; capped: boolean };
const lockCache = new Map<string, { at: number; state: DoorState }>();

/**
 * Has an owner locked this person out, and does the pace cap apply to them
 * (everybody but an owner)? Asked of /api/auth/lock-state, which can read the
 * database, and remembered for twenty seconds per person, so it is one small
 * internal call per person per twenty seconds. No answer is "not locked,
 * capped" for five seconds: the routes still refuse a locked person from
 * their own list, so a blip here costs a tidy exit, never the lock itself.
 */
async function doorState(req: NextRequest, userId: string): Promise<DoorState> {
  if (req.nextUrl.pathname === "/api/auth/lock-state") return { locked: false, capped: false };
  const hit = lockCache.get(userId);
  if (hit && Date.now() < hit.at) return hit.state;
  let state: DoorState | null = null;
  try {
    const res = await askSelf(req, "/api/auth/lock-state", 1_500);
    const j = res ? ((await res.json()) as { ok?: boolean; locked?: boolean; capped?: boolean }) : null;
    if (j?.ok) state = { locked: j.locked === true, capped: j.capped !== false };
  } catch {
    /* Not JSON: no answer. */
  }
  if (lockCache.size > 2_000) lockCache.clear();
  lockCache.set(userId, { at: Date.now() + (state ? LOCK_TTL_MS : 5_000), state: state ?? { locked: false, capped: true } });
  return state ?? { locked: false, capped: true };
}

/* ── The pace cap (10 Oct 2026) ───────────────────────────────────────────

   The other half of the read log. Nobody opens four hundred different
   records in an hour by hand: on Friday 9 Oct the busiest person peaked at
   about 40 calls a minute and 49 different records in an hour (Railway's own
   request log). A copy job - a script with somebody's cookie, or an AI
   driving their browser - goes well past that, so past these lines the
   person's data calls are refused for fifteen minutes with a plain sentence,
   the pause goes into the audit trail and the owners' bell, and an owner can
   lock them out from there. Pages still open; only the data behind them
   waits. Owners are never capped.

   Counted in this process's memory, per person. Railway runs one instance;
   if that ever changes, each instance counts its own share, and a copy job
   is still caught, only a little later.

   RECORDS, NOT CALLS (20 Oct 2026). Sean McMahon was paused twice in an hour
   working through a listing's enquirers - his own Rightmove and OnTheMarket
   leads, one every eight seconds. Each lead he opened was about 22 calls
   (the lead's facts, tasks, guarantors, viewings, case states, plus the whole
   board reloading round it), and the hourly line counted every distinct
   address, so twenty-odd leads looked like four hundred records. It now
   counts the records a call names - a lead, a listing, a property, a
   contact, an email - so a lead opened is one to three, however many calls
   it takes. A call that names none counts as its own address. Measured over
   the week to 20 Oct: the busiest agent touched 135 records in an hour (364
   addresses); the line stays at 400 records. The call lines rise to where
   an open screen's own fan-out cannot reach them; they are there for a
   script hammering, which the record line alone would not see. */
const PACE = {
  perMinute: 300,
  perTenMinutes: 1500,
  recordsPerHour: 400,
  pauseMs: 15 * 60_000,
};
/* What a call names: REX/OS lead and contact ids, numeric ids of five digits
   or more (listings, properties, contacts, applications), UUIDs, emails.
   "property-123" and "123" are the same home. */
const RECORD_ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:rex|contact|os)-\d+|\d{5,}|[^=&?/\s]+@[^=&?/\s]+)/gi;
function recordKeys(req: NextRequest): string[] {
  const path = req.nextUrl.pathname;
  const search = req.nextUrl.search;
  let text = path;
  try {
    text = decodeURIComponent(path + search);
  } catch {
    text = path + search;
  }
  const ids = new Set<string>();
  for (const m of text.matchAll(RECORD_ID)) ids.add(m[1].toLowerCase().replace(/^property-/, ""));
  if (ids.size) return [...ids];
  return [path + search];
}
const PAUSED_MESSAGE =
  "You've opened a lot very quickly, so TLE OS has paused for a few minutes. If this is your real work, tell James.";
type Pace = { calls: number[]; seen: Map<string, number>; pausedUntil: number; why: string };
const paces = new Map<string, Pace>();

/** Count this call; the time the person is paused until, if they are. */
function paceCheck(req: NextRequest, userId: string): { until: number; why: string; fresh: boolean } | null {
  const now = Date.now();
  let p = paces.get(userId);
  if (!p) {
    if (paces.size > 5_000) paces.clear();
    p = { calls: [], seen: new Map(), pausedUntil: 0, why: "" };
    paces.set(userId, p);
  }
  if (p.pausedUntil > now) return { until: p.pausedUntil, why: p.why, fresh: false };

  while (p.calls.length && now - p.calls[0] > 10 * 60_000) p.calls.shift();
  p.calls.push(now);
  if (req.method === "GET") {
    for (const key of recordKeys(req)) {
      p.seen.delete(key); // re-set moves it to the end, so the oldest stay first
      p.seen.set(key, now);
    }
    for (const [k, at] of p.seen) {
      if (now - at <= 60 * 60_000) break;
      p.seen.delete(k);
    }
  }
  let lastMinute = 0;
  for (let i = p.calls.length - 1; i >= 0 && now - p.calls[i] <= 60_000; i--) lastMinute++;

  const why =
    lastMinute > PACE.perMinute
      ? `${lastMinute} calls in a minute`
      : p.calls.length > PACE.perTenMinutes
        ? `${p.calls.length} calls in ten minutes`
        : p.seen.size > PACE.recordsPerHour
          ? `${p.seen.size} different records in an hour`
          : null;
  if (!why) return null;
  p.pausedUntil = now + PACE.pauseMs;
  p.why = why;
  /* The minute and ten-minute counts start again after the pause; the
     records opened in the hour do not, so carrying on where it stopped
     pauses a copy job again almost at once. */
  p.calls = [];
  return { until: p.pausedUntil, why, fresh: true };
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

  const userId = await sessionUserId(req.cookies.get("os_session")?.value, process.env.AUTH_SECRET);
  if (userId) {
    const door = await doorState(req, userId);
    /* The REX copy asking the screens again as each person (lib/rex-snapshot,
       21 Oct 2026): not their reading, so not in the read log or their pace. */
    if (!door.locked && process.env.CRON_SECRET && req.headers.get("x-os-rex-snapshot") === process.env.CRON_SECRET) {
      return NextResponse.next();
    }
    if (!door.locked) {
      noteCall(req, userId);
      const paused =
        door.capped && req.nextUrl.pathname.startsWith("/api/") && !isLogNoise(req.nextUrl.pathname)
          ? paceCheck(req, userId)
          : null;
      if (!paused) return NextResponse.next();
      if (paused.fresh) noteAlert({ at: Date.now(), userId, kind: "reading_paused", detail: `${paused.why}; paused 15 minutes` });
      return NextResponse.json(
        { ok: false, error: PAUSED_MESSAGE, paused: true },
        {
          status: 429,
          headers: { "x-os-paused": "1", "retry-after": String(Math.max(1, Math.ceil((paused.until - Date.now()) / 1000))) },
        }
      );
    }
    /* Locked out by an owner (lib/lockout, 10 Oct 2026). The routes refuse
       them anyway; this ends the visit cleanly: the cookie goes, a call gets
       the signed-out answer the shell's fetch watcher acts on, and a page goes
       to sign-in, which says why. */
    const res = req.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json(
          { ok: false, error: LOCKED_MESSAGE, signedOut: true, locked: true },
          { status: 401, headers: { "x-os-signed-out": "1" } }
        )
      : NextResponse.redirect(new URL("/sign-in?locked=1", req.url));
    res.cookies.delete("os_session");
    return res;
  }

  /* An API call gets an answer it can read (Rig run 4, P-054, 10 Oct 2026):
     a 307 to the sign-in PAGE made every fetch fail to parse, so a screen whose
     session had ended said "Couldn't refresh" and went on showing its last
     figures as live. A 401 marked x-os-signed-out, which the shell's fetch
     watcher (components/SignedOutWatch) turns into a trip to sign in. */
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Your session has ended. Sign in again.", signedOut: true },
      { status: 401, headers: { "x-os-signed-out": "1" } }
    );
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
    /* The maintenance rehearsal (/rehearsal) was retired on 7 Oct 2026 for the
       Showroom's back office walkthroughs, which live under `preview` and
       write nothing, so its exemption went with it. */
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
    /* `api/tenant/apply` is a listing's application form (1 Oct 2026): the
       link an agent copies or sends from the listing, filled in by an
       applicant who has no account. It answers only for a home on the market
       now, reads nothing Rightmove does not already show, and writes only the
       application itself - never to REX. See app/api/tenant/apply. */
    /* `api/tenant/offer-part` is one adult's part of an offer (14 Oct 2026):
       the link the lead tenant or the agent sends to another adult moving
       in. The token opens that one part only, and nothing else about the
       offer. See app/api/tenant/offer-part. */
    /* `mail-img` is a newsletter picture (30 Sep 2026): fetched by the mail
       client of whoever opens the email, which has no session. Safe because
       the route only serves a uuid name from its own R2 prefix - see
       app/mail-img/[name]. `nl` is the same reader's open pixel and link
       clicks (1 Oct 2026, app/nl/*): a token, never a session, and a signed
       link that only ever leads to an address that was in the email. */
    /* `library` is a marketing library file by its knowledge entry id (13 Oct
       2026, app/library/[id]): the tour's Steve hands them out to anybody.
       Only files with a "Marketing library" entry, nothing else in storage. */
    /* `sw.js` is the app's service worker (2 Oct 2026, public/sw.js): a
       browser fetches it with no say over the redirect, and a 307 to the
       sign-in page means no phone alerts at all. A static file, at the root
       only, holding nothing but the code that shows an alert. */
    "/((?!(?:sign-in|join|reset|preview|api/auth/login|api/auth/logout|api/auth/me|api/auth/verify|api/auth/reset|tenant|landlord|present|api/present|sign|api/sign|invoice|contractor|api/contractor|repair|api/repair|visit|api/visit|proof|send|api/tenant/passport|api/tenant/feedback|api/tenant/apply|api/tenant/offer-part|api/tenant/homes|api/tenant/session|api/tenant/maintenance|api/tenant/documents|api/tenant/messages|api/landlord|api/calendar|brand|email|mail-img|nl|rex|r|api/r|library|_next|icons|illustrations)(?:/|$)|favicon\\.ico$|robots\\.txt$|manifest\\.webmanifest$|sw\\.js$).*)",
  ],
};
