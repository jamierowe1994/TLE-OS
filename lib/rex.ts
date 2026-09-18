import "server-only";
import { noteFailure } from "@/lib/auto-bugs";

// REX CRM client for TLE OS — ported from the portal's lib/rex.ts.
//
// Rex API shape (api-docs.rexsoftware.com):
//   • Every call is POST {BASE}/v1/rex/{Service}/{method}, JSON body. Rex only
//     accepts POST — even reads.
//   • Auth: POST Authentication/login { email, password, token_lifetime,
//     account_id? } returns a token — bare string or { token }. Sent as
//     `Authorization: Bearer <token>` on every other call.
//   • Responses are a { result, error } envelope. Treat any envelope `error`
//     as failure even on HTTP 200. Search results may be a bare array or
//     { rows: [...] } — handle both.
//
// Config via env (Railway variables; local dev copies from the portal repo):
//   REX_API_EMAIL / REX_API_PASSWORD — dedicated API user. Required.
//   REX_API_BASE   — defaults to the UK host.
//   REX_ACCOUNT_ID — the shared Property/Lettings account (3517).
//
// Nothing here runs at import time — env reads and network calls are lazy,
// so the OS builds and demos with zero env vars set.

const TOKEN_LIFETIME = 4 * 60 * 60; // seconds
const TOKEN_SKEW_MS = 5 * 60 * 1000;
/**
 * 20 seconds, not 10 — and the difference matters more than it looks.
 *
 * **REX commonly takes ~15s for a single call.** That is measured, not
 * estimated: the Fine & Country codebase runs against this same account and
 * sets its own per-call timeout to 20s with the comment "Rex commonly takes
 * ~15s per call", after a function spent a fortnight returning
 * "operation aborted due to timeout" and processing nothing.
 *
 * Our 10s ceiling was therefore BELOW REX's normal response time. The symptom
 * looked like a concurrency problem — firing six searches at once made every
 * one fail — but concurrency was never the cause. Each call simply needed
 * longer than it was given, and the abort surfaced as
 * "This operation was aborted", which reads like the browser giving up rather
 * than our own timeout firing.
 *
 * If a page needs to be fast, the fix is fewer calls (see MailMergeEventLogs,
 * capped at 3 concurrent), not a shorter fuse.
 */
const CALL_TIMEOUT_MS = 20_000;

function base(): string {
  return process.env.REX_API_BASE ?? "https://api.uk.rexsoftware.com";
}

export function rexConfigured(): boolean {
  return !!(process.env.REX_API_EMAIL && process.env.REX_API_PASSWORD);
}

function rexAccountId(): string | null {
  return process.env.REX_ACCOUNT_ID || null;
}

export interface RexResponse {
  status: number;
  ok: boolean; // HTTP ok AND no `error` in the envelope
  result: unknown;
  error: string | null;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function accountKey(accountId: string | null): string {
  return accountId ?? "__default__";
}

function isTokenError(res: RexResponse): boolean {
  const e = (res.error ?? "").toLowerCase();
  return res.status === 401 || e.includes("token") || e.includes("authenticate");
}

async function rexPost(path: string, body: unknown, token?: string): Promise<RexResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base()}/v1/rex/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  let data: { result?: unknown; error?: unknown } = {};
  try {
    data = (await res.json()) as { result?: unknown; error?: unknown };
  } catch {
    /* empty/non-JSON body */
  }
  const error = safeError(data?.error);
  return { status: res.status, ok: res.ok && !error, result: data?.result, error };
}

/**
 * REX's error, with the credentials taken out.
 *
 * ⚠️ REX ECHOES THE SESSION TOKEN IN EVERY ERROR BODY. A failed call comes
 * back as:
 *
 *   {"message":"A record with the id '999999999' was not found…",
 *    "type":"RecordNotFoundException",
 *    "extra":{"request_data":{"method":"Listings::read","args":{…},
 *                             "token":"6e47-ddc7-dedc-7894-…"}}}
 *
 * This used to be `JSON.stringify(data.error)` and handed back whole. At least
 * six API routes forward that string to the browser verbatim, so any REX call
 * that failed — a mistyped id was enough — put a live REX bearer token in a
 * network response, where anything with devtools could lift it and query the
 * six businesses' CRM as us. Found 1 Sep 2026 by curling a nonsense listing id.
 *
 * `request_data` goes entirely: it carries the token, and its `args` can hold a
 * tenant's details on a contact write. `message` and `type` are what a person
 * actually needs, and they are safe.
 */
function safeError(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;

  const e = raw as { message?: unknown; type?: unknown };
  const message = typeof e.message === "string" ? e.message : null;
  const type = typeof e.type === "string" ? e.type : null;
  if (message) return type ? `${message} (${type})` : message;

  /* An unrecognised shape. Rather than stringify something that might carry a
     token in a field we haven't seen, say so and let the server log hold the
     detail — a redactor that fails open is not a redactor. */
  try {
    console.error("[rex] unrecognised error shape", JSON.stringify(raw).slice(0, 2000));
  } catch {
    /* not serialisable — nothing to log */
  }
  return "REX returned an error.";
}

async function login(accountId: string | null): Promise<string> {
  const payload: Record<string, unknown> = {
    email: process.env.REX_API_EMAIL,
    password: process.env.REX_API_PASSWORD,
    token_lifetime: TOKEN_LIFETIME,
  };
  if (accountId) payload.account_id = accountId;
  const res = await rexPost("Authentication/login", payload);
  const token =
    typeof res.result === "string"
      ? res.result
      : ((res.result as { token?: string } | undefined)?.token ?? null);
  if (!res.ok || !token) {
    throw new Error(res.error ?? `Rex login failed (${res.status})`);
  }
  tokenCache.set(accountKey(accountId), {
    token,
    expiresAt: Date.now() + TOKEN_LIFETIME * 1000 - TOKEN_SKEW_MS,
  });
  return token;
}

/**
 * One login at a time, per account.
 *
 * Without this, two REX calls that start together on a cold or expired token
 * both log in - and REX hands the second login a new token while retiring the
 * first, so whichever call was holding the older one fails with "the token you
 * have provided was not found". It is intermittent by nature: it needs two
 * calls to overlap AND the cache to be cold, which is exactly the state a
 * screen is in after a deploy or a quiet hour.
 *
 * Found 15 Sep 2026, when the search box started asking REX for properties and
 * people at the same time and both came back empty. It was never specific to
 * that feature: any two overlapping REX reads could have hit it, which may be
 * the explanation for odd one-off REX failures elsewhere.
 *
 * So the login is memoised while it is in flight and everyone waiting gets the
 * same token.
 */
const loggingIn = new Map<string, Promise<string>>();

async function getToken(accountId: string | null, force = false): Promise<string> {
  const key = accountKey(accountId);
  const cached = tokenCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;

  const already = loggingIn.get(key);
  /* A forced re-login means the caller KNOWS the token is dead, so it must not
     be handed the in-flight promise that is about to resolve to it. */
  if (already && !force) return already;

  const work = login(accountId).finally(() => {
    if (loggingIn.get(key) === work) loggingIn.delete(key);
  });
  loggingIn.set(key, work);
  return work;
}


/* ==========================================================================
   THE WRITE LOCK — nothing this OS does may change anything in REX.

   REX is the live system six businesses run on. Until the team has actually
   moved onto this platform, a stray write here doesn't corrupt a demo — it
   edits a real agent's real property record, and there is no undo.

   So writes are not merely "not implemented", they are REFUSED at the only
   door: every REX call goes through rexCall, and rexCall will only carry a
   method it recognises as read-only.

   It is an ALLOWLIST, deliberately. A denylist would have to predict every
   dangerous method REX has or ever adds; an allowlist means anything new or
   unrecognised is blocked by default and someone has to think about it.

   To lift it (one supervised test, with James watching), set REX_ALLOW_WRITES
   to the exact method being tested — e.g. "ListingPublication/publish". No
   blanket "true": unlocking everything at once is how the first careful test
   becomes an accident.
   ========================================================================== */

/** Method names, and prefixes, that only ever read. */
const READ_ONLY_EXACT = new Set([
  "search", "read", "describe", "autocomplete",
  "describeModel", "describeSearchFields", "describeDeleteModes",
  "describeFeedFormats", "searchValidateCriteria", "searchValidateOrderBys",
]);
const READ_ONLY_PREFIX = ["get", "download", "describe", "is", "list", "preview", "check"];

export function isReadOnlyMethod(method: string): boolean {
  if (READ_ONLY_EXACT.has(method)) return true;
  // "getPublicationStatus", "downloadEpcGraph" — reads by name and by nature.
  // Anything starting "set", "create", "update", "publish", "queue", "upload",
  // "send", "archive", "trash", "purge", "toggle", "reassign", "link", "sync",
  // "make" or "complete" falls through and is refused.
  return READ_ONLY_PREFIX.some(
    (p) => method.startsWith(p) && method.length > p.length && method[p.length] === method[p.length].toUpperCase()
  );
}

/** Is this exact call the one write we've been explicitly unlocked for? */
function writeIsUnlocked(service: string, method: string): boolean {
  const allowed = (process.env.REX_ALLOW_WRITES ?? "").trim();
  if (!allowed) return false;
  return allowed
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(`${service}/${method}`.toLowerCase());
}

/**
 * Is the lock on?
 *
 * With no arguments this answers the wiring sheet's question — "is ANY write
 * unlocked". Pass a service and method and it answers the only question a
 * caller actually cares about: "is THIS write unlocked". The difference is not
 * academic. REX_ALLOW_WRITES holds one named method, so an endpoint that
 * reported the bare flag next to its own refusal said `writesLocked: false`
 * while refusing — true of the environment, and the opposite of what the
 * reader would conclude.
 */
export function rexWritesLocked(service?: string, method?: string): boolean {
  if (service && method) return !writeIsUnlocked(service, method);
  return !(process.env.REX_ALLOW_WRITES ?? "").trim();
}

export class RexWriteBlocked extends Error {
  constructor(service: string, method: string) {
    super(
      `Refusing to call ${service}/${method} — the OS is locked to read-only against REX. ` +
        `REX is the team's live system and nothing here may change it yet. To run one ` +
        `supervised test, set REX_ALLOW_WRITES="${service}/${method}" on the environment.`
    );
    this.name = "RexWriteBlocked";
  }
}

// Authenticated call: resolve a token, POST, retry ONCE on a token error.
/**
 * `actorToken` is a REX token belonging to a PERSON, from lib/rex-user.
 *
 * Pass it and the call is made as them, so REX stamps their name on whatever
 * it touches. That is the entire point: a record created by Susan should say
 * Susan, not the office API user, and certainly not James.
 */
export async function rexCall(
  service: string,
  method: string,
  body?: unknown,
  actorToken?: string | null
): Promise<RexResponse> {
  if (!rexConfigured()) {
    throw new Error("Rex isn't connected yet (missing REX_API_EMAIL/PASSWORD).");
  }
  // The lock. Before a token is even fetched.
  if (!isReadOnlyMethod(method) && !writeIsUnlocked(service, method)) {
    throw new RexWriteBlocked(service, method);
  }
  const accountId = rexAccountId();
  const path = `${service}/${method}`;

  let res: RexResponse;
  try {
    if (actorToken) {
      res = await rexPost(path, body, actorToken);
      // NO fallback to the office account. A person's token expiring must
      // surface as "sign in again", never as the office quietly doing it for
      // them — that would put the wrong name on the record, which is the one
      // outcome this whole mechanism exists to prevent.
    } else {
      let token = await getToken(accountId);
      res = await rexPost(path, body, token);
      if (isTokenError(res)) {
        token = await getToken(accountId, true);
        res = await rexPost(path, body, token);
      }
    }
  } catch (e) {
    const name = (e as Error)?.name ?? "";
    const gaveUpWaiting = name === "AbortError";
    noteFailure({
      source: "REX",
      what: path,
      status: null,
      /* Said so plainly: REX being slow and REX turning us away are one bug,
         and without this the abort has no status to say it with. */
      timedOut: gaveUpWaiting,
      message: gaveUpWaiting ? `no answer after ${Math.round(CALL_TIMEOUT_MS / 1000)}s` : (e as Error)?.message || "did not answer",
    });
    throw e;
  }
  if (!res.ok && worthReporting(res, service, method, Boolean(actorToken))) {
    noteFailure({ source: "REX", what: path, status: res.status, message: res.error ?? `answered ${res.status}` });
  }
  return res;
}

/**
 * Which REX failures raise a bug by themselves (15 Sep 2026, lib/auto-bugs).
 *
 * Every refused WRITE, every rate limit, every server error. A READ that finds
 * nothing is not a fault - plenty of code asks "is this id still there?" - so
 * RecordNotFound on a read is left out. So is a person's own sign-in lapsing:
 * that is "connect REX again" on their screen, not a bug in ours.
 *
 * And one refusal that is the plan rather than a fault (18 Sep 2026): REX keeps
 * one active compliance entry per type per home and turns a second create away.
 * writeCertificateToRex in lib/plc-rex expects exactly that and goes on to
 * update the entry already there - so reporting it raised a ticket for every
 * certificate filed on a home REX already knew about. The update that follows
 * still reports its own refusal, so a real failure is not lost.
 */
function worthReporting(res: RexResponse, service: string, method: string, asPerson: boolean): boolean {
  if (asPerson && isTokenError(res)) return false;
  if (res.status === 429 || res.status >= 500) return true;
  if (service === "ComplianceEntries" && method === "create" && /already an active compliance entry/i.test(res.error ?? "")) return false;
  const readOnly = isReadOnlyMethod(method);
  if (readOnly && /recordnotfound|not found/i.test(res.error ?? "")) return false;
  return true;
}

/** Did REX reject the token we sent? Exported so callers acting AS a person
 *  can tell "your sign-in has lapsed" from "that failed". */
export function isExpiredToken(res: RexResponse): boolean {
  return isTokenError(res);
}

// Rex results are either a bare array or { rows: [...] } — normalise to rows.
export function rexRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

/* ==========================================================================
   SEARCHING WITHOUT LYING TO YOURSELF

   `rexCall` + `rexRows` is a trap, and it has now cost us twice.

   REX answers a rejected search with an ERROR **and** an empty result. So
   `rexRows(res.result)` returns `[]`, the caller sees no rows, and reports
   "there is nothing there" — which is a completely different statement from
   "REX refused the question".

   Measured, 22 Aug 2026, both on the live account:

     • `Invoices/search { order_by: { system_ctime: 'desc' } }`
         → 0 rows + "not a permissible order by field".
         The class actually holds 2,348 rows. A first pass concluded REX PM
         was empty. It was not.

     • `Listings/search { limit: 1000 }`
         → 0 rows + an error, because the row cap is 100.
         The same query with `result_format: 'ids'` returns 1,000 ids.

   Both times the wrong answer was confident, plausible and unfalsifiable —
   the worst combination there is. So: anything that searches should use the
   helpers below, which THROW rather than shrug.
   ========================================================================== */

export class RexError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly path: string;
  constructor(path: string, res: RexResponse) {
    super(`REX ${path} (${res.status}): ${res.error ?? "refused the request"}`);
    this.name = "RexError";
    this.status = res.status;
    this.body = res.result;
    this.path = path;
  }
}

/**
 * Search, and throw if REX refused.
 *
 * The one difference from `rexCall(..., "search", ...)` is the only one that
 * matters: an empty array from this function means REX said there is nothing,
 * not that REX declined to look.
 */
export async function rexSearch(
  service: string,
  body: Record<string, unknown>,
  actorToken?: string | null
): Promise<Array<Record<string, unknown>>> {
  const res = await rexCall(service, "search", body, actorToken);
  if (!res.ok) throw new RexError(`${service}/search`, res);
  return rexRows(res.result);
}

/** REX's row cap. Asking for more returns an empty array AND an error. */
export const REX_ROW_CAP = 100;
/** …but ids are cheap, and the cap on those is ten times higher. */
export const REX_ID_CAP = 1000;

/**
 * Every matching id, in ONE call.
 *
 * `result_format: 'ids'` lifts the cap from 100 to 1,000 — verified live:
 * `Listings/search` returns 1,000 ids where the same query for rows returns
 * zero and an error. For anything up to a thousand records this replaces ten
 * round trips with one, against a service that commonly takes ~15s a call.
 *
 * Returns ids as strings, because REX is inconsistent about whether an id is
 * a number or a numeric string and comparing the two silently fails.
 */
export async function rexSearchIds(
  service: string,
  body: Record<string, unknown> = {},
  actorToken?: string | null
): Promise<string[]> {
  const res = await rexCall(
    service,
    "search",
    { ...body, result_format: "ids", limit: REX_ID_CAP },
    actorToken
  );
  if (!res.ok) throw new RexError(`${service}/search[ids]`, res);
  const raw = res.result;
  const list = Array.isArray(raw)
    ? raw
    : ((raw as { rows?: unknown[]; ids?: unknown[] } | null)?.ids ??
       (raw as { rows?: unknown[] } | null)?.rows ??
       []);
  return (list as unknown[])
    .map((v) => (v == null ? null : String(typeof v === "object" ? (v as { id?: unknown }).id : v)))
    .filter((v): v is string => Boolean(v));
}

/**
 * Page every row, safely.
 *
 * Stops on a short page rather than trusting a total — REX's `total` is not
 * always present and not always right. Throws on refusal, so a caller can
 * never mistake "rejected" for "empty".
 *
 * `max` exists to stop an unbounded sweep of a class nobody measured first.
 */
export async function rexSearchAll(
  service: string,
  body: Record<string, unknown> = {},
  { max = 1000, actorToken }: { max?: number; actorToken?: string | null } = {}
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (let offset = 0; out.length < max; offset += REX_ROW_CAP) {
    const page = await rexSearch(
      service,
      { ...body, limit: Math.min(REX_ROW_CAP, max - out.length), offset },
      actorToken
    );
    out.push(...page);
    if (page.length < REX_ROW_CAP) break;
  }
  return out;
}
