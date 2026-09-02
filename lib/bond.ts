import "server-only";
import { hasDb, q } from "@/lib/db";
import { getProspect } from "@/lib/radar";
import type { AddressCandidate, Prospect } from "@/lib/radar-signals";

/**
 * Bond — the prospecting workspace. Radar finds the property; Bond is where
 * somebody works it: pins the listing to a front door, asks the Land Registry
 * who owns it, sends the postcard, and can see what they and their colleagues
 * have done.
 *
 * ── What is real and what is waiting ─────────────────────────────────────
 *
 * Address resolution is real: it runs on Homesearch, which we already pay
 * for. The owner lookup and the postcard need accounts James has not opened
 * yet (a Land Registry route and a print house), so those two report
 * "not connected" with what is needed, and write nothing. A screen that
 * pretended to have looked an owner up would be worse than one that says it
 * cannot yet.
 *
 * ── Why the confidence is arithmetic, not a feeling ──────────────────────
 *
 * OpenRent publishes a street and a postcode and nothing else. A postcode
 * holds a handful of doors; the property register knows how many bedrooms
 * each has. The listing says three beds; two doors in the postcode have
 * three beds; the confidence is 50%, and the screen shows both doors. That
 * is a number a person can argue with, which is the point.
 */

const HS = "https://data.homesearch.co.uk/avi/api/v1";
export const hsToken = () => (process.env.HOMESEARCH_TOKEN ?? "").trim();

export async function hs<T>(path: string): Promise<T | null> {
  const token = hsToken();
  if (!token) return null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${HS}/${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (r.ok) return (await r.json()) as T;
      if (r.status !== 429 && r.status !== 503) return null;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    } catch {
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  return null;
}

export function unwrap<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const o = raw as { data?: unknown } | null;
  return Array.isArray(o?.data) ? (o!.data as T[]) : [];
}

/* ── Activity ─────────────────────────────────────────────────────────────── */

export type ActivityKind =
  | "stage"
  | "note"
  | "assigned"
  | "appraisal"
  | "address"
  | "owner"
  | "postcard";

export interface Activity extends Record<string, unknown> {
  id: number;
  actor: string;
  kind: ActivityKind;
  property_key: string | null;
  address: string;
  detail: string;
  at: string;
}

export async function logActivity(a: {
  actor: string;
  kind: ActivityKind;
  property_key?: string | null;
  address?: string;
  detail: string;
}): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_bond_activity (actor, kind, property_key, address, detail) VALUES ($1,$2,$3,$4,$5)`,
    [a.actor, a.kind, a.property_key ?? null, a.address ?? "", a.detail]
  );
}

export async function recentActivity(limit = 40): Promise<Activity[]> {
  if (!hasDb()) return [];
  const rows = await q<Activity>(
    `SELECT id, actor, kind, property_key, address, detail, at FROM os_bond_activity ORDER BY at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}

/* ── Today ────────────────────────────────────────────────────────────────── */

export interface BondSummary {
  flagged: number;
  newToday: number;
  workedThisWeek: number;
  appraisalsBooked: number;
  ownersFound: number;
  postcardsSent: number;
  /** Tenancies whose anniversary falls in the next 60 days. */
  anniversariesSoon: number;
  lastSweep: string | null;
  districts: number;
}

export async function bondSummary(): Promise<BondSummary> {
  const empty: BondSummary = {
    flagged: 0, newToday: 0, workedThisWeek: 0, appraisalsBooked: 0, ownersFound: 0, postcardsSent: 0, anniversariesSoon: 0, lastSweep: null, districts: 0,
  };
  if (!hasDb()) return empty;
  const [p] = await q<{ flagged: string; new_today: string; booked: string }>(
    `SELECT count(*) FILTER (WHERE score > 0) AS flagged,
            count(*) FILTER (WHERE score > 0 AND first_flagged >= date_trunc('day', NOW())) AS new_today,
            count(*) FILTER (WHERE stage = 'appraisal_booked') AS booked
       FROM os_radar_prospects`
  );
  const [w] = await q<{ n: string }>(
    `SELECT count(DISTINCT property_key) AS n FROM os_bond_activity WHERE at > NOW() - INTERVAL '7 days'`
  );
  const [o] = await q<{ n: string }>(`SELECT count(*) AS n FROM os_bond_owner_lookups WHERE status = 'found'`);
  const [c] = await q<{ n: string }>(`SELECT count(*) AS n FROM os_bond_postcards WHERE status = 'sent'`);
  const [d] = await q<{ n: string; last: string | null }>(
    `SELECT count(*) AS n, max(last_run_at) AS last FROM os_radar_districts`
  );
  const [a] = await q<{ n: string }>(
    `SELECT count(*) AS n FROM os_radar_prospects
      WHERE next_anniversary BETWEEN CURRENT_DATE AND CURRENT_DATE + 60`
  );
  return {
    flagged: Number(p?.flagged ?? 0),
    newToday: Number(p?.new_today ?? 0),
    workedThisWeek: Number(w?.n ?? 0),
    appraisalsBooked: Number(p?.booked ?? 0),
    ownersFound: Number(o?.n ?? 0),
    postcardsSent: Number(c?.n ?? 0),
    anniversariesSoon: Number(a?.n ?? 0),
    lastSweep: d?.last ? new Date(d.last).toISOString() : null,
    districts: Number(d?.n ?? 0),
  };
}

/* ── Pinning the address ──────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function typeFits(listingType: string | null, category: string | null): boolean {
  if (!listingType || !category) return true;
  const l = listingType.toLowerCase();
  const c = category.toLowerCase();
  const flatWords = /flat|apartment|maisonette/;
  const lFlat = flatWords.test(l);
  const cFlat = flatWords.test(c);
  return lFlat === cFlat;
}

export interface ResolveResult {
  ok: boolean;
  reason?: string;
  prospect?: Prospect;
}

/**
 * Pin a listing to one front door.
 *
 * Every address in the postcode, from the register; keep the ones on the
 * listing's street; ask the register how many bedrooms each has; the ones
 * that agree with the listing are the candidates. One candidate is a near
 * certainty, two is a coin toss, and the screen shows all of them so the
 * person can choose.
 */
export async function resolveAddress(key: string, actor: string): Promise<ResolveResult> {
  const p = await getProspect(key);
  if (!p) return { ok: false, reason: "No such property." };
  if (!hsToken()) return { ok: false, reason: "Homesearch is not connected on this environment." };

  /* Already a full address in the feed: one call to confirm the door. */
  const full = p.address && /\d/.test(p.address) && p.address.toUpperCase().includes(p.postcode.toUpperCase());

  const found = unwrap<{ hs_id?: string | number; address_label?: string }>(
    await hs(`find_addresses/${encodeURIComponent(p.postcode)}`)
  )
    .filter((a) => a.hs_id != null && a.address_label)
    .map((a) => ({ hs_id: String(a.hs_id), label: String(a.address_label) }));
  if (found.length === 0) {
    return { ok: false, reason: `The register has no addresses for ${p.postcode}.` };
  }

  let pool = found;
  if (full) {
    const want = norm(p.address);
    const exact = found.filter((a) => norm(a.label) === want || norm(a.label).startsWith(want.split(" ").slice(0, 2).join(" ")));
    if (exact.length) pool = exact;
  } else if (p.street) {
    const street = norm(p.street);
    const onStreet = found.filter((a) => norm(a.label).includes(street));
    if (onStreet.length) pool = onStreet;
  }

  /* Bedrooms for each door, sequentially with a breath - Homesearch throttles. */
  const candidates: AddressCandidate[] = [];
  for (const [i, a] of pool.slice(0, 40).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 150));
    const mat = await hs<{ bedrooms?: number | null; category?: string | null }>(`matinfo/basic/${a.hs_id}`);
    const m = (mat && typeof mat === "object" && "data" in (mat as object) ? (mat as { data: typeof mat }).data : mat) ?? {};
    const beds = typeof m.bedrooms === "number" ? m.bedrooms : m.bedrooms != null ? Number(m.bedrooms) : null;
    const category = m.category ?? null;
    const fits =
      (p.beds == null || beds == null || beds === p.beds) && typeFits(p.property_type, category);
    candidates.push({ hs_id: a.hs_id, label: a.label, beds: Number.isFinite(beds as number) ? beds : null, category, fits });
  }

  const fitting = candidates.filter((c) => c.fits);
  const chosen = full ? (fitting[0] ?? candidates[0]) : fitting.length === 1 ? fitting[0] : null;
  const confidence = full
    ? 95
    : fitting.length === 0
      ? Math.round(100 / Math.max(candidates.length, 1))
      : Math.round(100 / fitting.length);

  let uprn: string | null = null;
  if (chosen) {
    const det = await hs<{ uprn?: string | number; data?: { uprn?: string | number } }>(
      `return_address_details/${chosen.hs_id}`
    );
    const u = det?.uprn ?? det?.data?.uprn;
    uprn = u == null ? null : String(u);
  }

  await q(
    `UPDATE os_radar_prospects
        SET resolved_hs_id = $2, resolved_address = $3, resolved_uprn = $4,
            address_confidence = $5, address_candidates = $6::jsonb, resolved_at = NOW(), updated_at = NOW()
      WHERE property_key = $1`,
    [key, chosen?.hs_id ?? null, chosen?.label ?? null, uprn, confidence, JSON.stringify(candidates)]
  );
  await logActivity({
    actor,
    kind: "address",
    property_key: key,
    address: p.address || p.street || p.postcode,
    detail: chosen
      ? `Pinned to ${chosen.label} at ${confidence}%`
      : `${fitting.length || candidates.length} possible doors in ${p.postcode}, ${confidence}% each`,
  });
  return { ok: true, prospect: (await getProspect(key)) ?? undefined };
}

/* ── Owners and postcards: the two doors not yet open ─────────────────────── */

export interface ProviderStatus {
  connected: boolean;
  name: string | null;
  /** What it will cost, in plain words, once connected. */
  cost: string;
  needs: string[];
}

export function ownerProvider(): ProviderStatus {
  const provider = (process.env.LAND_REGISTRY_PROVIDER ?? "").trim();
  return {
    connected: Boolean(provider && process.env.LAND_REGISTRY_API_KEY),
    name: provider || null,
    cost: "£7 a title, whichever route: HM Land Registry raised the digital official-copy fee from £3 to £7 in December 2024.",
    needs: [
      "A Land Registry route: an HMLR Business e-services account with Business Gateway API access, or a reseller that sells title registers per call.",
      "LAND_REGISTRY_PROVIDER and LAND_REGISTRY_API_KEY on Railway.",
      "The legitimate interests note signed off, because an owner's name is personal data.",
    ],
  };
}

export function postcardProvider(): ProviderStatus {
  const key = (process.env.STANNP_API_KEY ?? "").trim();
  return {
    connected: Boolean(key),
    name: key ? "Stannp" : null,
    cost: "Under a pound a card, printed and posted next working day.",
    needs: ["A Stannp account and STANNP_API_KEY on Railway.", "The postcard design, signed off by James.", "An opt-out line on every card."],
  };
}

export interface OwnerLookup extends Record<string, unknown> {
  id: number;
  property_key: string;
  address: string;
  status: string;
  provider: string | null;
  title_number: string | null;
  owner_name: string | null;
  correspondence_address: string | null;
  cost_pence: number | null;
  requested_by: string;
  requested_at: string;
  completed_at: string | null;
}

export async function ownerLookups(limit = 100): Promise<OwnerLookup[]> {
  if (!hasDb()) return [];
  const rows = await q<OwnerLookup>(`SELECT * FROM os_bond_owner_lookups ORDER BY requested_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    ...r,
    requested_at: new Date(r.requested_at).toISOString(),
    completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  }));
}

/**
 * Ask who owns it. With no provider connected this REFUSES and says why,
 * writing nothing: a "requested" row that nobody will ever fulfil would sit
 * on the Owners screen as a promise.
 */
export async function requestOwner(key: string, actor: string): Promise<{ ok: boolean; reason?: string; provider: ProviderStatus }> {
  const provider = ownerProvider();
  const p = await getProspect(key);
  if (!p) return { ok: false, reason: "No such property.", provider };
  if (!provider.connected) {
    return { ok: false, reason: "The Land Registry is not connected yet, so nothing was ordered.", provider };
  }
  /* When a provider lands, the call goes here and the row records what it said. */
  return { ok: false, reason: `${provider.name} is named but the lookup is not wired yet.`, provider };
}

/** Where a manually recorded owner came from. The label is what the screen shows. */
export const OWNER_SOURCES: Record<string, string> = {
  landinsight: "LandInsight",
  land_registry: "Land Registry title",
  companies_house: "Companies House",
  hmo_register: "HMO licence register",
  planning: "Planning register",
  electoral: "Open electoral register",
  other: "Other",
};

/**
 * Somebody looked the owner up elsewhere and typed it in. This is the manual
 * half of the waterfall: LandInsight on one screen, Bond on the other. The
 * row is a real lookup with status found, so everything downstream - the
 * Owners room, the postcard, the Today figures - treats it exactly like a
 * provider's answer. The provider column records where it came from.
 */
export async function recordOwner(
  key: string,
  actor: string,
  input: { name: unknown; address: unknown; source: unknown; title_number?: unknown; note?: unknown }
): Promise<{ ok: boolean; reason?: string; prospect?: Prospect }> {
  const p = await getProspect(key);
  if (!p) return { ok: false, reason: "No such property." };
  const name = String(input.name ?? "").trim();
  const address = String(input.address ?? "").trim();
  const source = String(input.source ?? "").trim();
  if (!name) return { ok: false, reason: "The owner's name is needed." };
  if (!address) return { ok: false, reason: "The correspondence address is needed. Without one there is nowhere to write." };
  if (!(source in OWNER_SOURCES)) return { ok: false, reason: "Say where it came from." };
  const title = String(input.title_number ?? "").trim() || null;
  const propertyAddress = p.resolved_address || p.address || p.street || p.postcode;
  await q(
    `INSERT INTO os_bond_owner_lookups
       (property_key, address, status, provider, title_number, owner_name, correspondence_address, cost_pence, requested_by, completed_at)
     VALUES ($1, $2, 'found', $3, $4, $5, $6, 0, $7, NOW())`,
    [key, propertyAddress, `manual:${source}`, title, name, address, actor]
  );
  await logActivity({
    actor,
    kind: "owner",
    property_key: key,
    address: propertyAddress,
    detail: `Owner recorded from ${OWNER_SOURCES[source]}${String(input.note ?? "").trim() ? `: ${String(input.note).trim().slice(0, 120)}` : ""}`,
  });
  return { ok: true, prospect: (await getProspect(key)) ?? undefined };
}

export interface Postcard extends Record<string, unknown> {
  id: number;
  property_key: string;
  property: string;
  to_name: string | null;
  to_address: string;
  status: string;
  provider: string | null;
  provider_ref: string | null;
  cost_pence: number | null;
  requested_by: string;
  requested_at: string;
  sent_at: string | null;
}

export async function postcards(limit = 100): Promise<Postcard[]> {
  if (!hasDb()) return [];
  const rows = await q<Postcard>(`SELECT * FROM os_bond_postcards ORDER BY requested_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    ...r,
    requested_at: new Date(r.requested_at).toISOString(),
    sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : null,
  }));
}
