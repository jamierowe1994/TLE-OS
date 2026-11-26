import "server-only";

/**
 * Teamtailor, the recruitment system - READ ONLY.
 *
 * James, 26 Nov 2026: recruitment figures for Susan's Company Figures, read
 * from Teamtailor. This file only ever sends GET. There is no write helper
 * here on purpose, and the key it is given should be an Admin key with Read
 * access only (Teamtailor, Settings, Integrations, API keys).
 *
 * What the API is (docs.teamtailor.com, read 26 Nov 2026):
 *   - JSON:API. `Authorization: Token token=<key>` and a dated
 *     `X-Api-Version` header on every request (required).
 *   - 50 requests every 10 seconds, then 429. Pages of 30 at most.
 *   - No report or analytics endpoint: figures are counted from the raw
 *     applications, stages, offers and jobs (lib/business/recruitment-figures).
 *
 * The key reads every candidate's personal details, so nothing here returns a
 * candidate: callers ask for applications without `include=candidate`, and the
 * figures file keeps counts only.
 */

const DEFAULT_BASE = "https://api.teamtailor.com/v1";
const API_VERSION = "20240404";
const PAGE_SIZE = 30;
/** Under the 50-per-10-seconds bucket with room for a second reader. */
const GAP_MS = 260;

export interface TtResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | { id: string; type: string }[] | null }>;
}

interface TtPage {
  data?: TtResource[] | TtResource | null;
  included?: TtResource[];
  links?: { next?: string | null };
  meta?: { "record-count"?: number; "page-count"?: number };
}

export class TeamtailorError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function teamtailorBase(): string {
  return (process.env.TEAMTAILOR_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

export function teamtailorConfigured(): boolean {
  return Boolean(process.env.TEAMTAILOR_API_KEY);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;

/** One GET. Waits its turn, and waits out a 429 once before giving up. */
async function get(url: string): Promise<TtPage> {
  const key = process.env.TEAMTAILOR_API_KEY;
  if (!key) throw new TeamtailorError(0, "Teamtailor is not connected.");
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Token token=${key}`,
          "X-Api-Version": API_VERSION,
          Accept: "application/vnd.api+json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt < 3) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new TeamtailorError(0, e instanceof Error && e.name === "AbortError" ? "Teamtailor did not answer in time." : "Teamtailor could not be reached.");
    }
    clearTimeout(timer);
    if (res.status === 429 || res.status === 409 || res.status >= 500) {
      /* 429: the bucket is empty, and the header says how long until it
         refills. 409 is Teamtailor's own "try again". */
      const reset = Number(res.headers.get("x-rate-limit-reset"));
      if (attempt < 3) {
        await sleep(res.status === 429 ? Math.min(Math.max(reset || 10, 1), 12) * 1000 : 1500 * (attempt + 1));
        continue;
      }
      throw new TeamtailorError(res.status, `Teamtailor answered ${res.status}.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new TeamtailorError(res.status, "Teamtailor refused the key. It needs an Admin key with Read access.");
    }
    if (!res.ok) throw new TeamtailorError(res.status, `Teamtailor answered ${res.status}.`);
    const remaining = Number(res.headers.get("x-rate-limit-remaining"));
    if (Number.isFinite(remaining) && remaining <= 3) {
      const reset = Number(res.headers.get("x-rate-limit-reset"));
      await sleep(Math.min(Math.max(reset || 2, 1), 10) * 1000);
    }
    return (await res.json()) as TtPage;
  }
  throw new TeamtailorError(0, "Teamtailor could not be reached.");
}

function buildUrl(path: string, params: Record<string, string | undefined>): string {
  const u = new URL(`${teamtailorBase()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
  return u.toString();
}

export interface TtList {
  rows: TtResource[];
  /** Included resources, by "type:id". */
  included: Map<string, TtResource>;
  /** False when the page limit stopped the walk before the end. */
  complete: boolean;
  pages: number;
}

/**
 * Every page of a list. `maxPages` is a hard stop so one runaway list cannot
 * hold the bucket for an hour; the caller treats an incomplete walk as a
 * failed read, never as a smaller number.
 */
export async function teamtailorList(
  path: string,
  params: Record<string, string | undefined> = {},
  maxPages = 400
): Promise<TtList> {
  const origin = new URL(teamtailorBase()).origin;
  const rows: TtResource[] = [];
  const included = new Map<string, TtResource>();
  let url: string | null = buildUrl(path, { "page[size]": String(PAGE_SIZE), ...params });
  let pages = 0;
  while (url) {
    if (pages >= maxPages) return { rows, included, complete: false, pages };
    const page: TtPage = await get(url);
    pages++;
    const data = Array.isArray(page.data) ? page.data : page.data ? [page.data] : [];
    rows.push(...data);
    for (const inc of page.included ?? []) included.set(`${inc.type}:${inc.id}`, inc);
    const next: string | null = page.links?.next ?? null;
    /* The key only ever goes to Teamtailor: a next link pointing anywhere
       else ends the walk as failed. */
    if (next && new URL(next, origin).origin !== origin) throw new TeamtailorError(0, "Teamtailor sent a link to another address.");
    url = next && data.length ? new URL(next, origin).toString() : null;
  }
  return { rows, included, complete: true, pages };
}

/** One record, or null on 404. */
export async function teamtailorOne(path: string, params: Record<string, string | undefined> = {}): Promise<{ row: TtResource | null; included: Map<string, TtResource> }> {
  try {
    const page = await get(buildUrl(path, params));
    const row = Array.isArray(page.data) ? page.data[0] ?? null : page.data ?? null;
    const included = new Map<string, TtResource>();
    for (const inc of page.included ?? []) included.set(`${inc.type}:${inc.id}`, inc);
    return { row, included };
  } catch (e) {
    if (e instanceof TeamtailorError && e.status === 404) return { row: null, included: new Map() };
    throw e;
  }
}

/** The id a to-one relationship points at, if the response carried it. */
export function relId(r: TtResource, name: string): string | null {
  const d = r.relationships?.[name]?.data;
  return d && !Array.isArray(d) ? d.id : null;
}

export function relIds(r: TtResource, name: string): string[] {
  const d = r.relationships?.[name]?.data;
  return Array.isArray(d) ? d.map((x) => x.id) : d ? [d.id] : [];
}

export const attr = (r: TtResource | undefined | null, name: string): unknown => r?.attributes?.[name];
export const attrStr = (r: TtResource | undefined | null, name: string): string | null => {
  const v = r?.attributes?.[name];
  return typeof v === "string" && v ? v : null;
};
