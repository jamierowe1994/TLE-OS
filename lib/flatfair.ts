import "server-only";
import { noteFailure } from "@/lib/auto-bugs";

/**
 * FLATFAIR, READ THROUGH ITS OWN API (29 Sep 2026).
 *
 * Flatfair registers TLE's deposits and runs its no-deposit plans. Until now
 * the OS read it through James's signed-in browser (26 Sep) and agents keyed
 * new deals in by hand from the "Set up in Flatfair" screen. The v2 API
 * (docs: https://app.flatfair.co.uk/api/v2/docs/) covers flatbonds, their
 * documents, branches, drafts, prices and referencing applications.
 *
 * ── Environments ──────────────────────────────────────────────────────────
 *
 * Flatfair runs three: live (app.), demo (demo.) and an internal staging. A
 * token belongs to ONE of them - the first token James was given is demo's,
 * and the live host answers it "Invalid token". FLATFAIR_API_BASE says which
 * host this service talks to; every stored row carries the environment it
 * came from, so demo test data can never reach the clean sweep. Demo sends
 * real emails (Flatfair, 28 Sep call), so anything written there uses our
 * own addresses.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 *
 * `Authorization: Bearer <token>`. The word matters: "Token <key>" is read
 * as no credentials at all.
 *
 * ── Writes ────────────────────────────────────────────────────────────────
 *
 * This file only reads. Creating a flatbond or a draft, attaching a document
 * or opening a referencing application goes through flatfairWrite(), which
 * refuses unless the caller has checked the Flatfair switch first.
 */

export type FlatfairEnv = "live" | "demo" | "staging";

const LIVE_BASE = "https://app.flatfair.co.uk/api/v2";
const TIMEOUT_MS = 20_000;

export function flatfairBase(): string {
  return (process.env.FLATFAIR_API_BASE ?? LIVE_BASE).trim().replace(/\/+$/, "");
}

export function flatfairEnv(): FlatfairEnv {
  const host = flatfairBase();
  if (/\/\/demo\./i.test(host)) return "demo";
  if (/\/\/staging\./i.test(host)) return "staging";
  return "live";
}

export function flatfairConfigured(): boolean {
  return Boolean((process.env.FLATFAIR_API_TOKEN ?? "").trim());
}

export interface FlatfairResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<FlatfairResult<T>> {
  const token = (process.env.FLATFAIR_API_TOKEN ?? "").trim();
  if (!token) return { ok: false, status: 0, data: null, error: "Flatfair is not connected here (no FLATFAIR_API_TOKEN)." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const what = `${method} ${path.split("?")[0]}`;
  try {
    const res = await fetch(`${flatfairBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const detail = (data as { detail?: unknown } | null)?.detail;
      const error = typeof detail === "string" ? detail : text.slice(0, 300) || `Flatfair answered ${res.status}`;
      /* A 404 on one record is an answer, not a fault. */
      if (res.status !== 404) noteFailure({ source: "Flatfair", what, status: res.status, message: error });
      return { ok: false, status: res.status, data: data as T | null, error };
    }
    return { ok: true, status: res.status, data: data as T, error: null };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    const error = timedOut ? "Flatfair did not answer in time." : e instanceof Error ? e.message : "Flatfair could not be reached.";
    noteFailure({ source: "Flatfair", what, message: error, timedOut });
    return { ok: false, status: 0, data: null, error };
  } finally {
    clearTimeout(timer);
  }
}

export const flatfairGet = <T>(path: string) => call<T>("GET", path);

/* ── The shapes, as the v2 schema and the demo answer them ────────────────── */

export interface FfBranch { id: number; name: string }

export interface FfTenant { id?: number; email: string; has_paid?: boolean; has_signed_tc?: boolean }

export interface FfTraditionalDeposit {
  managed_by?: "agent" | "landlord";
  deposit_amount?: string | null;
  deposit_provider?: "tds" | "dps" | "my_deposits" | "sds" | "tp" | null;
  deposit_type?: "custodial" | "insured" | null;
  has_been_registered?: boolean;
  deposit_registration_number?: string | null;
}

export interface FfFlatbond {
  id: number;
  branch: FfBranch | null;
  group: { id: number; name: string } | null;
  managed_by: "agent" | "landlord" | null;
  tenant_type: "private" | "company" | null;
  /** In pence, as Flatfair sends it. The period is not in the read shape. */
  rent: number | null;
  type: "new_tenancy" | "conversion" | null;
  status: string;
  start_date: string | null;
  close_date: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  product_type: string | null;
  landlord: { email: string } | null;
  tenants: FfTenant[];
  guarantors: { email?: string }[];
  tenancy_type: string | null;
  traditional_deposit: FfTraditionalDeposit | null;
  external_tenancy_id: string | null;
  deposit_amount: number | null;
}

export interface FfDocument { id: number; file_name: string | null; type: string; download_url?: string | null }

interface Page<T> { count: number; next: string | null; previous: string | null; results: T[] }

/** Every page of a list, 100 at a time. Stops on the first failure and says so. */
async function all<T>(path: string, cap = 5000): Promise<{ ok: boolean; rows: T[]; error: string | null }> {
  const rows: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let offset = 0; offset < cap; offset += 100) {
    const r = await flatfairGet<Page<T>>(`${path}${sep}limit=100&offset=${offset}`);
    if (!r.ok || !r.data) return { ok: false, rows, error: r.error };
    rows.push(...(r.data.results ?? []));
    if (!r.data.next || rows.length >= r.data.count) break;
  }
  return { ok: true, rows, error: null };
}

export const listBranches = () => all<FfBranch>("/organisation/branch/");
export const listFlatbonds = () => all<FfFlatbond>("/flatbond/");
export const getFlatbond = (id: number) => flatfairGet<FfFlatbond>(`/flatbond/${id}/`);
export const listFlatbondDocuments = (flatbondId: number) => all<FfDocument>(`/document/?flatbond=${flatbondId}`);
export const getDocument = (id: number) => flatfairGet<FfDocument>(`/document/${id}/`);

/**
 * A write. Only for callers that have already checked the Flatfair switch -
 * nothing in the OS creates a flatbond by accident. Kept separate from the
 * reads so a grep for "flatfairWrite" finds every place that can.
 */
export function flatfairWrite<T>(method: "POST" | "PUT" | "PATCH", path: string, body: unknown) {
  return call<T>(method, path, body);
}
