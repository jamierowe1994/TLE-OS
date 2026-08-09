import "server-only";

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
const CALL_TIMEOUT_MS = 10_000;

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
  const error =
    typeof data?.error === "string"
      ? data.error
      : data?.error
        ? JSON.stringify(data.error)
        : null;
  return { status: res.status, ok: res.ok && !error, result: data?.result, error };
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

async function getToken(accountId: string | null, force = false): Promise<string> {
  const key = accountKey(accountId);
  const cached = tokenCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  return login(accountId);
}

// Authenticated call: resolve a token, POST, retry ONCE on a token error.
export async function rexCall(service: string, method: string, body?: unknown): Promise<RexResponse> {
  if (!rexConfigured()) {
    throw new Error("Rex isn't connected yet (missing REX_API_EMAIL/PASSWORD).");
  }
  const accountId = rexAccountId();
  const path = `${service}/${method}`;
  let token = await getToken(accountId);
  let res = await rexPost(path, body, token);
  if (isTokenError(res)) {
    token = await getToken(accountId, true);
    res = await rexPost(path, body, token);
  }
  return res;
}

// Rex results are either a bare array or { rows: [...] } — normalise to rows.
export function rexRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}
