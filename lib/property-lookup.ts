import "server-only";
import { hasDb, q } from "@/lib/db";
import { hs, hsToken, logActivity, unwrap } from "@/lib/bond";
import { getProspect } from "@/lib/radar";
import { districtOf, sectorOf } from "@/lib/ma-research";
import { SIGNALS, type Prospect } from "@/lib/radar-signals";

/**
 * Look up any address in the patch, flagged or not.
 *
 * James, 2 Sep: "can we do searches on things like property addresses". Yes:
 * the address goes to the property register for its id and facts, then
 * everything Bond already holds about that door is gathered - every listing
 * the sweep has seen, to let and for sale; the tenancy estimate; the company
 * on the title; completed sales; the prospect record if there is one.
 *
 * And "Add a property": the same door, put on the board by hand with a
 * reason. Seen on Facebook, a board, a conversation. The reason is the
 * signal's detail and never says more on the screen than the person typed.
 */

export interface Candidate {
  hs_id: string;
  label: string;
}

export interface Facts {
  hs_id: string;
  uprn: string | null;
  address: string;
  postcode: string;
  beds: number | null;
  category: string | null;
  tenure: string | null;
  tax_band: string | null;
  energy_rating: string | null;
  energy_epc_date: string | null;
  lat: number | null;
  lon: number | null;
}

export interface ListingSeen {
  listing_key: string;
  market: "let" | "sale";
  agent: string | null;
  price: number | null;
  status: string;
  listed_on: string | null;
  first_seen: string;
  last_seen: string;
  let_agreed_at: string | null;
  gone_at: string | null;
}

export interface Dossier {
  facts: Facts;
  property_key: string;
  listings: ListingSeen[];
  sales: Array<{ sold_on: string; price: number; new_build: boolean; tenure: string | null }>;
  company: { name: string; number: string | null; address: string; title_number: string } | null;
  prospect: Prospect | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/i;
const numbersIn = (s: string) => new Set((s.toUpperCase().match(/\b\d+[A-Z]?\b/g) ?? []));

/**
 * Turn what somebody typed into doors on the register.
 *
 * A full postcode lists every door in it, narrowed to the ones carrying the
 * typed house number. Anything else goes to the register's free-text
 * search. Up to twelve candidates come back; the screen lets the person pick.
 */
export async function findCandidates(query: string): Promise<{ candidates: Candidate[]; reason?: string }> {
  const qy = query.trim();
  if (qy.length < 3) return { candidates: [], reason: "Type a bit more of the address." };
  if (!hsToken()) return { candidates: [], reason: "Homesearch is not connected on this environment." };

  const pc = qy.match(POSTCODE);
  if (pc) {
    const postcode = `${pc[1]} ${pc[2]}`.toUpperCase();
    const found = unwrap<{ hs_id?: string | number; address_label?: string }>(await hs(`find_addresses/${encodeURIComponent(postcode)}`))
      .filter((a) => a.hs_id != null && a.address_label)
      .map((a) => ({ hs_id: String(a.hs_id), label: String(a.address_label) }));
    if (found.length === 0) return { candidates: [], reason: `The register has no addresses for ${postcode}.` };
    const wantNums = numbersIn(qy.replace(POSTCODE, ""));
    const narrowed = wantNums.size ? found.filter((a) => [...numbersIn(a.label)].some((n) => wantNums.has(n))) : found;
    return { candidates: (narrowed.length ? narrowed : found).slice(0, 12) };
  }

  const raw = await hs<unknown>(`find_addresses?query=${encodeURIComponent(qy)}`);
  const found = unwrap<{ hs_id?: string | number; address_label?: string }>(raw)
    .filter((a) => a.hs_id != null && a.address_label)
    .map((a) => ({ hs_id: String(a.hs_id), label: String(a.address_label) }));
  return { candidates: found.slice(0, 12), reason: found.length ? undefined : "Nothing on the register matches that. Try the postcode." };
}

async function facts(hsId: string): Promise<Facts | null> {
  const [detail, mat] = await Promise.all([
    hs<{ uprn?: string | number; hs_label?: string; address_label?: string; postcode?: string; data?: Record<string, unknown> }>(
      `return_address_details/${hsId}`
    ),
    hs<Record<string, unknown>>(`matinfo/basic/${hsId}`),
  ]);
  const d = (detail && "data" in (detail as object) && (detail as { data?: Record<string, unknown> }).data && !Array.isArray((detail as { data?: unknown }).data)
    ? (detail as { data: Record<string, unknown> }).data
    : detail) as Record<string, unknown> | null;
  const m = (mat && "data" in (mat as object) && (mat as { data?: unknown }).data && !Array.isArray((mat as { data?: unknown }).data)
    ? (mat as { data: Record<string, unknown> }).data
    : mat) as Record<string, unknown> | null;
  const label = String(d?.hs_label ?? d?.address_label ?? m?.address ?? "").trim();
  if (!label) return null;
  const pc = label.match(POSTCODE);
  const postcode = String(d?.postcode ?? (pc ? `${pc[1]} ${pc[2]}` : "")).toUpperCase().trim();
  const num = (v: unknown) => (typeof v === "number" ? v : v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    hs_id: hsId,
    uprn: d?.uprn == null ? null : String(d.uprn),
    address: label,
    postcode,
    beds: num(m?.bedrooms),
    category: (m?.category as string) ?? null,
    tenure: (m?.land_tenure as string) ?? null,
    tax_band: (m?.tax_band as string) ?? null,
    energy_rating: (m?.energy_rating as string) ?? null,
    energy_epc_date: (m?.energy_epc_date as string) ?? null,
    lat: num(m?.lat),
    lon: num(m?.lon),
  };
}

/** The same identity the sweep uses, so a looked-up door and a swept one meet. */
function keyFor(f: Facts): string {
  return f.uprn ? `uprn:${f.uprn}` : `addr:${norm(f.address)}`;
}

export async function dossier(hsId: string): Promise<Dossier | null> {
  const f = await facts(hsId);
  if (!f) return null;
  const key = keyFor(f);
  if (!hasDb()) return { facts: f, property_key: key, listings: [], sales: [], company: null, prospect: null };

  const nums = [...numbersIn(f.address)];
  const listings = await q<ListingSeen & Record<string, unknown>>(
    `SELECT listing_key, market, agent, rent AS price, status, listed_on::text AS listed_on,
            first_seen::text AS first_seen, last_seen::text AS last_seen,
            let_agreed_at::text AS let_agreed_at, gone_at::text AS gone_at
       FROM os_listing_capture
      WHERE property_key = $1
         OR ($2 <> '' AND uprn = $2)
         OR (upper(postcode) = $3 AND $4::text[] <> '{}'
             AND upper((regexp_match(address, '\\d+[A-Za-z]?'))[1]) = ANY($4::text[])
             AND property_key LIKE 'addr:%')
      ORDER BY coalesce(listed_on, first_seen::date) DESC, first_seen DESC
      LIMIT 40`,
    [key, f.uprn ?? "", f.postcode.toUpperCase(), nums]
  );
  const sales = await q<{ sold_on: string; price: number; new_build: boolean; tenure: string | null }>(
    `SELECT sold_on::text AS sold_on, price, new_build, tenure FROM os_sales
      WHERE upper(postcode) = $1 AND house_number = ANY($2::text[])
      ORDER BY sold_on DESC LIMIT 10`,
    [f.postcode.toUpperCase(), nums]
  );
  const [title] = await q<{ proprietor_name: string; company_number: string | null; proprietor_address: string; title_number: string }>(
    `SELECT proprietor_name, company_number, proprietor_address, title_number FROM os_company_titles
      WHERE upper(postcode) = $1 AND house_number = ANY($2::text[])
      ORDER BY updated_at DESC LIMIT 1`,
    [f.postcode.toUpperCase(), nums]
  );
  const prospect = await getProspect(key);
  return {
    facts: f,
    property_key: key,
    listings: listings.map((l) => ({
      listing_key: l.listing_key,
      market: l.market === "sale" ? "sale" : "let",
      agent: l.agent,
      price: l.price,
      status: l.status,
      listed_on: l.listed_on,
      first_seen: l.first_seen,
      last_seen: l.last_seen,
      let_agreed_at: l.let_agreed_at,
      gone_at: l.gone_at,
    })),
    sales,
    company: title ? { name: title.proprietor_name, number: title.company_number, address: title.proprietor_address, title_number: title.title_number } : null,
    prospect,
  };
}

/** Put a door on the board by hand, with the reason on the record. */
export async function addByHand(hsId: string, actor: string, reason: string): Promise<{ ok: boolean; reason?: string; prospect?: Prospect }> {
  if (!hasDb()) return { ok: false, reason: "no database" };
  const why = reason.trim();
  if (!why) return { ok: false, reason: "Say why it is going on the list. One line is enough." };
  const f = await facts(hsId);
  if (!f) return { ok: false, reason: "The register has no record of that door." };
  const key = keyFor(f);
  const line = `Added by ${actor}: ${why.slice(0, 200)}`;
  await q(
    `INSERT INTO os_radar_prospects
       (property_key, uprn, address, postcode, sector, district, beds, property_type, lat, lon,
        signals, score, hand_reason, hand_added_by, hand_added_at, last_signal_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
             jsonb_build_array(jsonb_build_object('key','added_by_hand','detail',$11::text)), $12, $11, $13, NOW(), NOW(), NOW())
     ON CONFLICT (property_key) DO UPDATE SET
       hand_reason = EXCLUDED.hand_reason,
       hand_added_by = EXCLUDED.hand_added_by,
       hand_added_at = NOW(),
       signals = CASE WHEN os_radar_prospects.signals @> '[{"key":"added_by_hand"}]'::jsonb
                      THEN os_radar_prospects.signals
                      ELSE os_radar_prospects.signals || jsonb_build_array(jsonb_build_object('key','added_by_hand','detail',$11::text)) END,
       score = CASE WHEN os_radar_prospects.signals @> '[{"key":"added_by_hand"}]'::jsonb
                    THEN os_radar_prospects.score ELSE os_radar_prospects.score + $12 END,
       beds = COALESCE(os_radar_prospects.beds, EXCLUDED.beds),
       lat = COALESCE(os_radar_prospects.lat, EXCLUDED.lat),
       lon = COALESCE(os_radar_prospects.lon, EXCLUDED.lon),
       last_signal_at = NOW(),
       updated_at = NOW()`,
    [
      key,
      f.uprn,
      f.address,
      f.postcode,
      sectorOf(f.postcode),
      districtOf(f.postcode),
      f.beds,
      f.category,
      f.lat,
      f.lon,
      line,
      SIGNALS.added_by_hand.weight,
      actor,
    ]
  );
  await logActivity({ actor, kind: "stage", property_key: key, address: f.address, detail: `Added to the list: ${why.slice(0, 160)}` });
  return { ok: true, prospect: (await getProspect(key)) ?? undefined };
}

/** Take a hand-added door off again. The feed's own signals, if any, stay. */
export async function removeByHand(key: string, actor: string): Promise<{ ok: boolean; prospect?: Prospect }> {
  if (!hasDb()) return { ok: false };
  const p = await getProspect(key);
  if (!p) return { ok: false };
  await q(
    `UPDATE os_radar_prospects
        SET hand_reason = NULL, hand_added_by = NULL, hand_added_at = NULL,
            signals = (SELECT coalesce(jsonb_agg(s), '[]'::jsonb) FROM jsonb_array_elements(signals) s WHERE s->>'key' <> 'added_by_hand'),
            score = GREATEST(0, score - $2),
            updated_at = NOW()
      WHERE property_key = $1 AND hand_reason IS NOT NULL`,
    [key, SIGNALS.added_by_hand.weight]
  );
  await logActivity({ actor, kind: "stage", property_key: key, address: p.address, detail: "Taken off the hand-added list" });
  return { ok: true, prospect: (await getProspect(key)) ?? undefined };
}
