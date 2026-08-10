import "server-only";

// PayProp Agency API v1.1 client for TLE OS — read-only, API-key auth only.
//
// TWO AGENCIES: the business runs Scotland and the rest of the UK as separate
// PayProp accounts that cannot see each other. Each wants its own API key.
//
// THIS OS NEVER REFRESHES A PAYPROP TOKEN. There is exactly one PayProp
// connection (Susan's consent, 30 Jul 2026) and no machine-to-machine grant
// — v1.1 and v2.0 both accept only authorization_code and refresh_token, so
// the OS cannot authenticate for itself. Two apps refreshing the same
// credential would race, and PayProp mints a new refresh token every time,
// leaving the loser holding a dead one. So: the PORTAL stays the single
// refresher and lends this OS short-lived access tokens (lib/payprop-bridge).
// An API key, where one exists, is used in preference — keys don't rotate.
//
// Spec traps that matter even for health checks:
//   • rows is silently capped at 25 — trust pagination, never page length
//   • export/* return { items }, report/* return their own key
//   • GET /meta/me returns the key's exact scope list — the honest measure
//     of what this environment can do.

const DEFAULT_BASE = "https://uk.payprop.com/api/agency/v1.1";
const TIMEOUT_MS = 15_000;

export type PayPropAccountId = "scotland" | "uk";

const ACCOUNT_ENV: Record<PayPropAccountId, string[]> = {
  // PAYPROP_API_KEY is the original single-account name — kept as a fallback
  // so the same values the portal uses drop straight in.
  scotland: ["PAYPROP_API_KEY_SCOTLAND", "PAYPROP_API_KEY"],
  uk: ["PAYPROP_API_KEY_UK"],
};

export const PAYPROP_ACCOUNTS: { id: PayPropAccountId; label: string }[] = [
  { id: "scotland", label: "Scotland" },
  { id: "uk", label: "Rest of UK" },
];

function base(): string {
  return (process.env.PAYPROP_API_BASE ?? DEFAULT_BASE).replace(/\/$/, "");
}

export function payPropKeyFor(account: PayPropAccountId): string | null {
  for (const name of ACCOUNT_ENV[account]) {
    const v = process.env[name];
    if (v) return v;
  }
  return null;
}

/**
 * Does this look like a PayProp key at all?
 *
 * This guard exists because the mistake already happened: the portal's
 * PAYPROP_API_KEY_UK held the PROPOLY api key for weeks (found 4 Aug 2026).
 * Every UK call would have posted a live Propoly secret into PayProp's logs.
 *
 * The two are trivially distinguishable — PayProp issues 60-character padded
 * base64, Propoly's is 40 characters unpadded — so we check the shape and
 * refuse to send anything that fails it. A key we won't send can't leak.
 */
export function payPropKeyLooksValid(key: string): boolean {
  return key.length >= 50 && /^[A-Za-z0-9+/]+=*$/.test(key) && key.endsWith("=");
}

export function payPropConfigured(): boolean {
  // Either an API key of our own, or a borrowing arrangement with the portal.
  if (PAYPROP_ACCOUNTS.some((a) => payPropKeyFor(a.id))) return true;
  return Boolean(process.env.PORTAL_ORIGIN && process.env.OS_BRIDGE_SECRET);
}

export interface PayPropResponse {
  status: number;
  ok: boolean;
  result: unknown;
  error: string | null;
}

/** GET one path on one agency. Query params via `params`. Never throws. */
export async function payPropGet(
  account: PayPropAccountId,
  path: string,
  params?: Record<string, string>
): Promise<PayPropResponse> {
  // An API key if we have one; otherwise borrow a bearer token from the
  // portal, which owns the single OAuth connection.
  const key = payPropKeyFor(account);
  let auth: string | null = null;
  if (key) {
    if (!payPropKeyLooksValid(key)) {
      return {
        status: 0, ok: false, result: null,
        error: "The key set for this agency isn't shaped like a PayProp key (they are 60-character padded base64) — refusing to send it, in case it belongs to another system.",
      };
    }
    auth = `APIkey ${key}`;
  } else {
    const { payPropBearer, bridgeConfigured } = await import("@/lib/payprop-bridge");
    if (!bridgeConfigured()) {
      return { status: 0, ok: false, result: null, error: "No PayProp access on this environment — set PORTAL_ORIGIN and OS_BRIDGE_SECRET, or an API key." };
    }
    const bearer = await payPropBearer(account);
    if (!bearer) {
      return { status: 0, ok: false, result: null, error: "The portal wouldn't lend a PayProp token — check OS_BRIDGE_SECRET matches on both." };
    }
    auth = `Bearer ${bearer}`;
  }

  const url = new URL(`${base()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: auth },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, ok: false, result: null, error: e instanceof Error ? e.message : "network error" };
  }
  clearTimeout(timer);

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  const errText = !res.ok
    ? ((data as { errors?: Array<{ message?: string }> } | null)?.errors?.[0]?.message ??
      (data as { message?: string } | null)?.message ??
      `HTTP ${res.status}`)
    : null;
  return { status: res.status, ok: res.ok, result: data, error: errText };
}
