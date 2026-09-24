import "server-only";
import { noteFailure } from "@/lib/auto-bugs";
import { hasDb, q } from "@/lib/db";

// Propoly (tenancy progression) client — the third live integration, after
// REX and Meta. Auth flow per their Swagger (prod.propoly.com/api-docs):
//
//   GET /api/v1/token   headers: x-api-key + agent-name
//                       → { token, client_name }         (JWT)
//   everything else     header:  Authorization: Bearer <token>
//
// Same defensive posture as lib/rex.ts: never throw into a page — callers
// catch and fall back to snapshot. Response shapes aren't in their public
// docs, so the fetchers return raw JSON; /api/admin/propoly-probe exposes
// samples to the admin Diagnostics tab so we can wire exact mappings from
// real data.

const BASE = (process.env.PROPOLY_API_BASE ?? "https://api.propoly.com").replace(/\/$/, "");

/**
 * Read on every call, NOT captured once when the module loads.
 *
 * These were three top-level consts. A top-level const is evaluated the first
 * time the module is imported, and in a Next build that can happen while the
 * bundle is being produced rather than while the server is running — at which
 * point the value is whatever the BUILD had, and a variable added afterwards
 * can never be seen no matter how many times the service restarts. The symptom
 * is exactly the one James hit: the variables are plainly set on Railway and
 * the app insists Propoly is not configured.
 *
 * Reading inside a function costs nothing measurable and removes the entire
 * class of problem. Both naming schemes stay: the Railway variables predate our
 * seeing the real header names, so PROPOLY_PASSWORD / PROPOLY_USERNAME are as
 * valid as PROPOLY_API_KEY / PROPOLY_AGENT_NAME and always have been.
 *
 * Trimmed, because a value pasted into a dashboard with a trailing newline or a
 * stray space is still truthy and still fails at the header — which looks
 * identical to a wrong key and is a far worse afternoon.
 */
function apiKey(): string {
  return (process.env.PROPOLY_API_KEY ?? process.env.PROPOLY_PASSWORD ?? "").trim();
}

function agentName(): string {
  return (process.env.PROPOLY_AGENT_NAME ?? process.env.PROPOLY_USERNAME ?? "").trim();
}

export function propolyConfigured(): boolean {
  return Boolean(apiKey() && agentName());
}

/* ------------------------------------------------------------------------ */
/* Token                                                                     */
/* ------------------------------------------------------------------------ */

interface TokenResponse {
  token: string;
  client_name?: string;
}

interface HeldToken {
  token: string;
  clientName: string | null;
  expiresAt: number;
  /** When Propoly gave it to us - how old a token was when it was cancelled. */
  issuedAt?: number;
}

/**
 * ONE TOKEN FOR THE WHOLE SERVER, AND IT OUTLIVES A DEPLOY (23 Sep 2026).
 *
 * This state used to be three module-level variables, and the build carries
 * this file in six places - four routes inline it, two shared chunks hold it -
 * so the live server had six caches, six "one at a time" rules and six
 * one-minute back-offs that knew nothing of each other. After a 429 the other
 * five went straight on asking, which is what keeps a rate-limit window open,
 * and every deploy (five on 23 Sep) started all six cold. The token ticket
 * (b59189a2) kept ticking at about one every fifteen minutes after the 22 Sep
 * fix for exactly this reason.
 *
 * Now the state hangs off globalThis, so every copy in the process shares it,
 * and the token and any back-off are also kept in os_cache, so a fresh
 * process picks up the token the last one was given instead of asking again.
 * The database is only a convenience here: if it does not answer, the token
 * is simply asked for, as before.
 */
interface TokenState {
  cached: HeldToken | null;
  /** After a 429 from the token endpoint, nobody asks again until this. */
  backoffUntil: number;
  /** The token request in flight, shared by everyone who asks while it runs. */
  inFlight: Promise<string> | null;
  /** When Propoly last answered us properly - a token, or a read it took. */
  lastGoodAt: number;
}
declare global {
  // eslint-disable-next-line no-var
  var __propolyToken: TokenState | undefined;
}
const state: TokenState = (globalThis.__propolyToken ??= { cached: null, backoffUntil: 0, inFlight: null, lastGoodAt: 0 });
state.lastGoodAt ??= 0;

const TOKEN_ROW = "propoly:token";
const MIN_BACKOFF_MS = 60_000;

/**
 * A REFUSED TOKEN IS NOT AN OUTAGE (24 Sep 2026, ticket b59189a2).
 *
 * After the shared token went in, the ticket still came in about every
 * fifteen minutes - one per watcher run - while the watcher went on reading
 * its deals: 28 in the three hours to 19:30 on 23 Sep. What was refused was a
 * REPLACEMENT token, asked for when Propoly said no to one we still thought
 * good (a 401 mid-life); Propoly then said we had asked too recently. The
 * likeliest reason is that Propoly keeps one live token per login and TLE-OS
 * and the TLE portal share a login (same key, fingerprinted 23 Sep), so the
 * other side signing in cancels ours.
 *
 * So a refusal is only a bug once Propoly has been out of reach for a while:
 * no token and no read it would take for OUTAGE_MS. Before that it is the
 * back-off doing its job, and it is logged, not ticketed. The log says how
 * long each token lasts and how old one was when Propoly cancelled it, which
 * is what proves or disproves the shared-login reading.
 */
const OUTAGE_MS = 10 * 60_000;

function markGood(): void {
  state.lastGoodAt = Date.now();
}

/** True once Propoly has given us nothing usable for OUTAGE_MS. */
function outOfReach(lastGoodAt: number): boolean {
  return lastGoodAt > 0 ? Date.now() - lastGoodAt > OUTAGE_MS : process.uptime() * 1000 > OUTAGE_MS;
}

/** One line in the service log, at most once a minute per kind. */
const saidAt = new Map<string, number>();
function say(kind: string, line: string): void {
  const last = saidAt.get(kind) ?? 0;
  if (Date.now() - last < 60_000) return;
  saidAt.set(kind, Date.now());
  console.log(`[propoly] ${line}`);
}

/** What the last process kept: a token, or a back-off still running. Null on any doubt. */
async function readKept(): Promise<{ held: HeldToken | null; backoffUntil: number } | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { token?: string; clientName?: string | null; expiresAt?: number; issuedAt?: number; backoffUntil?: number; lastGoodAt?: number } }>(
      "SELECT payload FROM os_cache WHERE key = $1",
      [TOKEN_ROW]
    );
    const p = rows[0]?.payload;
    if (!p) return null;
    const held = p.token && Number(p.expiresAt) > Date.now()
      ? { token: p.token, clientName: p.clientName ?? null, expiresAt: Number(p.expiresAt), issuedAt: Number(p.issuedAt) || undefined }
      : null;
    state.lastGoodAt = Math.max(state.lastGoodAt, Number(p.lastGoodAt) || 0);
    return { held, backoffUntil: Number(p.backoffUntil) || 0 };
  } catch {
    return null;
  }
}

/**
 * Written as a merge. A refusal used to write the row as `{ backoffUntil }`
 * alone, wiping the token another process had just been given and every
 * other thing we knew; now a refusal adds its back-off and leaves the rest.
 */
async function keep(change: Partial<HeldToken> & { backoffUntil?: number; lastGoodAt?: number }): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET payload = os_cache.payload || EXCLUDED.payload, computed_at = NOW()`,
    [TOKEN_ROW, JSON.stringify(change)]
  ).catch(() => {});
}

/** Best-effort JWT expiry (ms epoch); falls back to a 50-minute lifetime. */
function jwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    ) as { exp?: number };
    if (typeof payload.exp === "number") {
      // Refresh a minute early so we never present a just-expired token.
      return payload.exp * 1000 - 60_000;
    }
  } catch {
    // opaque or malformed — use the fallback lifetime
  }
  return Date.now() + 50 * 60_000;
}

/**
 * ONE TOKEN REQUEST AT A TIME.
 *
 * The cache is per process, and the moment it is cold or the token expires,
 * every waiting call arrived here together: a deals read alone fires thirty
 * requests, each asked Propoly for its own token in the same second, and
 * Propoly answered 429 to most of them - 589 tickets in a day (22 Sep 2026,
 * bug 009d19cf). Same cure as oneWalk gave the list walks: the second and
 * later callers wait on the request already running instead of starting one.
 *
 * `stale` is the token a caller has just been refused with (401). If somebody
 * else has already replaced it, the replacement is handed back without another
 * request; only a token nobody has refreshed yet is fetched again.
 */
async function getToken(stale: string | null = null): Promise<string> {
  if (!propolyConfigured()) throw new Error("Propoly is not configured");
  const c = state.cached;
  if (c && Date.now() < c.expiresAt && c.token !== stale) return c.token;
  if (state.inFlight) return state.inFlight;
  if (Date.now() < state.backoffUntil) {
    throw new Error("Propoly token requests are rate-limited — backing off");
  }
  state.inFlight = obtainToken(stale).finally(() => {
    state.inFlight = null;
  });
  return state.inFlight;
}

/** The kept token if there is a good one, otherwise one from Propoly. */
async function obtainToken(stale: string | null): Promise<string> {
  if (stale && state.cached?.token === stale) {
    const age = state.cached.issuedAt ? Math.round((Date.now() - state.cached.issuedAt) / 60_000) : null;
    const left = Math.round((state.cached.expiresAt - Date.now()) / 60_000);
    say("cancelled", `Propoly refused a token ${age == null ? "of unknown age" : `${age} min old`} with ${left} min still to run - something else signed in with the same login?`);
  }
  const kept = await readKept();
  if (kept?.held && kept.held.token !== stale) {
    state.cached = kept.held;
    return kept.held.token;
  }
  if (kept && Date.now() < kept.backoffUntil) {
    state.backoffUntil = kept.backoffUntil;
    throw new Error("Propoly token requests are rate-limited — backing off");
  }
  return fetchToken();
}

async function fetchToken(): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/token`, {
    headers: {
      "x-api-key": apiKey(),
      "agent-name": agentName(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 429) {
    /* Their Retry-After when they give one, never less than a minute. */
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    state.backoffUntil = Date.now() + Math.max(MIN_BACKOFF_MS, Number.isFinite(retryAfter) ? retryAfter : 0);
    await keep({ backoffUntil: state.backoffUntil });
    if (outOfReach(state.lastGoodAt)) {
      noteFailure({ source: "Propoly", what: "token", status: 429, message: "no token for over ten minutes - Propoly keeps saying we asked too recently" });
    } else {
      say("429", `token refused (429), backing off ${Math.round((state.backoffUntil - Date.now()) / 1000)}s - last good answer ${Math.round((Date.now() - state.lastGoodAt) / 1000)}s ago`);
    }
    throw new Error("Propoly token request failed: 429 (rate limited)");
  }
  if (!res.ok) {
    /* A 403 here is the key itself being refused: that is never the back-off. */
    if (res.status === 403 || outOfReach(state.lastGoodAt)) {
      noteFailure({ source: "Propoly", what: "token", status: res.status, message: "would not give us a token" });
    } else {
      say("token-fail", `token request failed (${res.status}) - last good answer ${Math.round((Date.now() - state.lastGoodAt) / 1000)}s ago`);
    }
    throw new Error(`Propoly token request failed: ${res.status}`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.token) throw new Error("Propoly token response had no token");
  const held: HeldToken = { token: data.token, clientName: data.client_name ?? null, expiresAt: jwtExpiry(data.token), issuedAt: Date.now() };
  state.cached = held;
  markGood();
  await keep({ ...held, backoffUntil: 0, lastGoodAt: state.lastGoodAt });
  say("issued", `new token, good for ${Math.round((held.expiresAt + 60_000 - held.issuedAt!) / 60_000)} min`);
  return held.token;
}

/* ------------------------------------------------------------------------ */
/* Authenticated fetch                                                       */
/* ------------------------------------------------------------------------ */

export interface PropolyResult {
  status: number;
  body: unknown;
}

/**
 * GET an API path ("/api/v1/deals") with the working auth style, confirmed
 * against the live API on 21 Jul 2026: Propoly requires the Bearer token AND
 * the x-api-key + agent-name headers together on every data call — bearer
 * alone 401s. Refreshes the token once on a 401 (expired mid-flight).
 * Returns status + parsed body rather than throwing on non-2xx, so the
 * probe can show exactly what the API said.
 */
/**
 * ASK WHAT A PATH ALLOWS, WITHOUT DOING IT.
 *
 * Propoly will not show us its API document — /api-docs, /api-docs.json and
 * /swagger.json all answer 403 to our agent credential, authenticated or not
 * (measured 30 Aug 2026). So capability has to be established some other way,
 * and the honest way is OPTIONS: the request asks the server which methods a
 * path accepts and the `Allow` header answers, without invoking any of them.
 *
 * This matters because Propoly generates the contracts. Discovering that a
 * POST works by sending one would mean creating a real record in the system a
 * tenancy is built from. OPTIONS finds out for free.
 *
 * Returns the raw Allow header, unparsed — a server that does not implement
 * OPTIONS says so with a 405 or an empty header, and that is a different
 * answer from "this path is read-only". Never collapse the two.
 */
export async function propolyOptions(
  path: string
): Promise<{ status: number; allow: string | null }> {
  const keyHeaders = { "x-api-key": apiKey(), "agent-name": agentName() };
  try {
    /* Inside the try: a token Propoly will not give us is the same answer as
       a path that will not connect, not a reason to end the caller. */
    const token = await getToken();
    const res = await fetch(`${BASE}${path}`, {
      method: "OPTIONS",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...keyHeaders },
      cache: "no-store",
    });
    return {
      status: res.status,
      allow: res.headers.get("allow") ?? res.headers.get("access-control-allow-methods"),
    };
  } catch {
    return { status: 0, allow: null };
  }
}

/**
 * Which Propoly answers raise a bug by themselves (15 Sep 2026, lib/auto-bugs):
 * any refused write, any rate limit or server error, and a read that was
 * refused rather than merely empty. A 404 on a read is an answer, not a fault.
 * The path is kept with its ids taken out, so one broken endpoint is one bug.
 */
function reportPropoly(method: string, path: string, status: number): void {
  const write = method !== "GET";
  if (status < 400) return;
  if (!write && status === 404) return;
  noteFailure({
    source: "Propoly",
    what: `${method} ${path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|\d+/gi, ":id")}`,
    status,
    message: status === 429 ? "rate limited" : write ? "refused the write" : "refused the read",
  });
}

/**
 * A PROBE'S REFUSAL IS ITS ANSWER, NOT A FAULT.
 *
 * The wiring sheet asks Propoly for paths nobody expects to be allowed — a
 * census of endpoints that may not exist, a control path that certainly does
 * not, document routes asked in the hope of a 200. Every one of those 403s was
 * being filed as an automatic bug, so opening the wiring sheet raised tickets
 * and emailed the owners about the questions it had just asked. Callers whose
 * refusal is the finding pass `probe`, and their answers stay on the sheet
 * where they belong. Everything the OS calls in anger still reports.
 */
export async function propolyGet(path: string, opts?: { probe?: boolean }): Promise<PropolyResult> {
  const keyHeaders = { "x-api-key": apiKey(), "agent-name": agentName() };
  let token = await getToken();
  let res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...keyHeaders },
    cache: "no-store",
  });
  if (res.status === 401) {
    token = await getToken(token);
    res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...keyHeaders },
      cache: "no-store",
    });
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) noteGoodRead();
  if (!opts?.probe) reportPropoly("GET", path, res.status);
  return { status: res.status, body };
}

/** A read Propoly took. Kept on the row at most once a minute, for the next process. */
let goodKeptAt = 0;
function noteGoodRead(): void {
  markGood();
  if (Date.now() - goodKeptAt < 60_000) return;
  goodKeptAt = Date.now();
  void keep({ lastGoodAt: state.lastGoodAt });
}

/** The client name Propoly reported with the last token (null until fetched). */
/**
 * Writes. Propoly is the live lettings system, so nothing here sends a POST
 * or PATCH unless the offer-accepted handover has been switched on for real
 * in Admin (lib/switches, "handover_live"). Below that switch these throw
 * before a request is built - shadow mode never reaches them.
 */
export class PropolyWriteBlocked extends Error {
  constructor(method: string, path: string) {
    super(
      `Refusing to ${method} ${path} - Propoly writes are off. Switch on "Handover: create in Propoly" in Admin → Switches to allow them.`
    );
    this.name = "PropolyWriteBlocked";
  }
}

async function propolyWrite(method: "POST" | "PATCH", path: string, payload: unknown): Promise<PropolyResult> {
  const { switchOn } = await import("@/lib/switches");
  if (!(await switchOn("handover_live"))) throw new PropolyWriteBlocked(method, path);
  const keyHeaders = { "x-api-key": apiKey(), "agent-name": agentName() };
  const send = async (token: string) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...keyHeaders,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  const token = await getToken();
  let res = await send(token);
  if (res.status === 401) res = await send(await getToken(token));
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  reportPropoly(method, path, res.status);
  return { status: res.status, body };
}

export const propolyPost = (path: string, payload: unknown) => propolyWrite("POST", path, payload);

/**
 * A multipart upload, behind ITS OWN switch. Documents are the second kind of
 * Propoly write and are armed separately from the handover: attaching a gas
 * certificate to a deal is not the same decision as creating a landlord.
 * Content-Type is left to fetch, which sets the boundary.
 */
export async function propolyUpload(path: string, form: FormData): Promise<PropolyResult> {
  const { switchOn } = await import("@/lib/switches");
  if (!(await switchOn("propoly_documents"))) {
    throw new PropolyWriteBlocked("POST (multipart)", path);
  }
  const keyHeaders = { "x-api-key": apiKey(), "agent-name": agentName() };
  const send = async (token: string) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...keyHeaders },
      body: form,
      cache: "no-store",
    });
  const token = await getToken();
  let res = await send(token);
  if (res.status === 401) res = await send(await getToken(token));
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  reportPropoly("POST", path, res.status);
  return { status: res.status, body };
}
export const propolyPatch = (path: string, payload: unknown) => propolyWrite("PATCH", path, payload);

export function propolyClientName(): string | null {
  return state.cached?.clientName ?? null;
}

/* ------------------------------------------------------------------------ */
/* Read endpoints the portal cares about                                     */
/* ------------------------------------------------------------------------ */

export const getPropolyAgents = () => propolyGet("/api/v1/agents");
export const getPropolyBranches = () => propolyGet("/api/v1/branches");
export const getPropolyDeals = () => propolyGet("/api/v1/deals");
export const getPropolyDeal = (id: string | number) => propolyGet(`/api/v1/deals/${id}`);
export const getPropolyProperties = () => propolyGet("/api/v1/properties");
export const getPropolyProperty = (id: string | number) => propolyGet(`/api/v1/properties/${id}`);
export const getPropolyTenant = (id: string | number) => propolyGet(`/api/v1/tenants/${id}`);
export const getPropolyTenants = () => propolyGet("/api/v1/tenants");
export const getPropolyLandlords = () => propolyGet("/api/v1/landlords");

/* Configuration lists — the business's own vocabulary, straight from Propoly.
 *
 * From the production OpenAPI spec (docs/propoly-openapi.yaml). These matter
 * more than they look: `document_types` is the authoritative list of what
 * Propoly recognises as a compliance certificate, and the upload endpoint
 * enforces jurisdiction rules against it — a portable appliance test and a
 * legionella assessment are Scotland-only, a gas certificate is rejected on a
 * property without gas. That is the nation-by-nation rule set the compliance
 * work needs, asserted by a system the business already runs on rather than
 * invented by us. */
export const getPropolyTenancyAgreementOptions = () =>
  propolyGet("/api/v1/configuration/tenancy_agreements");
export const getPropolyDepositSchemes = () =>
  propolyGet("/api/v1/configuration/deposit_schemes");
export const getPropolyDocumentTypes = () =>
  propolyGet("/api/v1/configuration/document_types");
