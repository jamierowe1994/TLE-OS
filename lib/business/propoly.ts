import "server-only";

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

let cached: { token: string; clientName: string | null; expiresAt: number } | null = null;
// After a 429 from the token endpoint, don't ask again for a minute —
// re-requesting immediately just extends the rate-limit window.
let tokenBackoffUntil = 0;

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

async function getToken(force = false): Promise<string> {
  if (!propolyConfigured()) throw new Error("Propoly is not configured");
  if (!force && cached && Date.now() < cached.expiresAt) return cached.token;
  if (Date.now() < tokenBackoffUntil) {
    throw new Error("Propoly token requests are rate-limited — backing off");
  }

  const res = await fetch(`${BASE}/api/v1/token`, {
    headers: {
      "x-api-key": apiKey(),
      "agent-name": agentName(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 429) {
    tokenBackoffUntil = Date.now() + 60_000;
    throw new Error("Propoly token request failed: 429 (rate limited)");
  }
  if (!res.ok) {
    throw new Error(`Propoly token request failed: ${res.status}`);
  }
  const data = (await res.json()) as TokenResponse;
  if (!data.token) throw new Error("Propoly token response had no token");
  cached = {
    token: data.token,
    clientName: data.client_name ?? null,
    expiresAt: jwtExpiry(data.token),
  };
  return cached.token;
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
export async function propolyGet(path: string): Promise<PropolyResult> {
  const keyHeaders = { "x-api-key": apiKey(), "agent-name": agentName() };
  let token = await getToken();
  let res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...keyHeaders },
    cache: "no-store",
  });
  if (res.status === 401) {
    token = await getToken(true);
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
  return { status: res.status, body };
}

/** The client name Propoly reported with the last token (null until fetched). */
export function propolyClientName(): string | null {
  return cached?.clientName ?? null;
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
