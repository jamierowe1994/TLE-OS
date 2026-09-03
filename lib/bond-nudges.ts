import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { listAppraisals } from "@/lib/appraisal-store";
import { watchedDistricts } from "@/lib/radar";
import { SIGNALS, isOurs, isPrivateLister, type SignalKey } from "@/lib/radar-signals";
import { logActivity } from "@/lib/bond";

/**
 * Nudges: the daily call list, from our own book.
 *
 * Spectre's strongest demo is "you valued it a year ago, the lead went
 * cold, and now it is listed with a competitor". Every piece of that is in
 * REX already: the appraisals, the listings we withdrew, the tenancies we
 * let, and the landlord on each one with a phone number. What was missing
 * was the other half - what the market did next - and Bond has that: every
 * advert in the patch, every day, with the agent on it.
 *
 * So a nudge is a REX door crossed with the sweep. These are people who
 * have dealt with us, so a phone call is lawful and the number is ours to
 * use; the rest of Bond writes letters to strangers, this rings friends.
 *
 * ── Read only, again ──────────────────────────────────────────────────────
 *
 * REX is read through the allowlist and never written. The contact on a
 * nudge is a snapshot of our own CRM record so the list opens instantly;
 * the panel says where it came from and REX stays the record.
 *
 * ── Two passes ────────────────────────────────────────────────────────────
 *
 *   syncRexDoors   reads REX (slow: a page is seconds, a property read is
 *                  seconds) and keeps one row per door in os_bond_rex_doors.
 *                  Runs on its own cron after the morning sweep; the
 *                  contacts behind appraisals are read a batch at a time so
 *                  a run never overstays the edge's patience.
 *   buildNudges    is database only and fast: match every REX door to a
 *                  Bond property key, look at what the sweep saw after our
 *                  last event on it, and write the nudges. Runs at the end
 *                  of every rescore, so a competitor's listing this morning
 *                  is a nudge by seven.
 *
 * A nudge keeps its status across rebuilds. When the reason behind it goes
 * away (the advert comes down) it is marked gone rather than deleted, so
 * "why did that one disappear" has an answer.
 */

export type NudgeKind = "win_back" | "former_landlord" | "appraisal_elsewhere" | "appraisal_anniversary" | "lost_instruction";
export type NudgeStatus = "open" | "snoozed" | "done" | "dismissed" | "gone";

export const NUDGE_LABEL: Record<NudgeKind, { label: string; why: string }> = {
  win_back: { label: "Win back", why: "We had it on our books and it is back on the market with someone else." },
  former_landlord: { label: "Former landlord", why: "We let it for them before; it is now advertised by another agent." },
  appraisal_elsewhere: { label: "Valued, listed elsewhere", why: "We valued it and they went with another agent. It is on the market now." },
  appraisal_anniversary: { label: "A year since we valued it", why: "The valuation is a year old, and rents have moved. A natural reason to ring." },
  lost_instruction: { label: "Lost this year", why: "Withdrawn from us in the last twelve months. Worth a check-in on how it went." },
};

export interface Nudge extends Record<string, unknown> {
  id: number;
  nudge_key: string;
  kind: NudgeKind;
  source: string;
  rex_ref: string;
  rex_property_id: string | null;
  property_key: string | null;
  address: string;
  postcode: string;
  district: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  rex_contact_id: string | null;
  our_agent: string | null;
  headline: string;
  reason: string;
  opener: string;
  detail: Record<string, unknown>;
  score: number;
  status: NudgeStatus;
  snoozed_until: string | null;
  notes: string;
  done_by: string | null;
  first_seen: string;
  last_seen: string;
}

/* ── Reading REX ─────────────────────────────────────────────────────────── */

const LETTINGS = { name: "listing_category_id", type: "in", value: ["residential_rental", "rental"] };
const PAGE = 100;
/** Property reads per run, for the contacts behind appraisals. Seconds each. */
const CONTACT_READS_PER_RUN = 80;

const str = (v: unknown): string | null => {
  const t = String(v ?? "").trim();
  return t ? t : null;
};
const outward = (pc: string | null): string | null => {
  const m = (pc ?? "").toUpperCase().trim().match(/^([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}$/);
  return m ? m[1] : null;
};

interface Contact {
  id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
}

interface RexDoorRow {
  source: "withdrawn" | "leased" | "appraisal";
  rex_ref: string;
  rex_property_id: string | null;
  address: string;
  postcode: string;
  district: string | null;
  event_on: string | null;
  reason: string | null;
  lost_agency: string | null;
  agent: string | null;
  rent: number | null;
  state: string | null;
  contact: Contact | null;
  contacts_read: boolean;
}

function propertyOf(p: Record<string, unknown> | null | undefined): { id: string | null; address: string; postcode: string } {
  if (!p) return { id: null, address: "", postcode: "" };
  const postcode = String(p.adr_postcode ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const unit = str(p.adr_unit_number);
  const number = str(p.adr_street_number);
  const built = [
    unit && !(number ?? "").includes(unit) ? `Flat ${unit}` : null,
    [number, str(p.adr_street_name)].filter(Boolean).join(" "),
    str(p.adr_suburb_or_town),
  ]
    .filter(Boolean)
    .join(", ");
  const key = str(p.system_search_key);
  return { id: str(p.id), address: (key ?? built).replace(/\s+/g, " ").trim(), postcode };
}

/** The landlord on a listing or property: the owner relationship, first one with a name. */
function ownerOf(relns: unknown): Contact | null {
  if (!Array.isArray(relns)) return null;
  for (const r of relns as Array<Record<string, unknown>>) {
    const type = ((r.reln_type as Record<string, unknown> | undefined)?.id ?? r.reln_type) as string | undefined;
    if (type && type !== "owner") continue;
    const c = (r.contact ?? {}) as Record<string, unknown>;
    const name = str(c.name) ?? [str(c.first_name), str(c.last_name)].filter(Boolean).join(" ");
    if (!name) continue;
    const phones = Array.isArray(c.phone_numbers) ? (c.phone_numbers as Array<Record<string, unknown>>) : [];
    const emails = Array.isArray(c.email_addresses) ? (c.email_addresses as Array<Record<string, unknown>>) : [];
    return {
      id: str(c.id),
      name,
      phone: str(c.phone_number) ?? str(phones[0]?.phone_number) ?? str(phones[0]?.value),
      email: str(c.email_address) ?? str(emails[0]?.email_address) ?? str(emails[0]?.value),
    };
  }
  return null;
}

async function pages(service: string, body: Record<string, unknown>, max = 1000): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (let offset = 0; out.length < max; offset += PAGE) {
    const res = await rexCall(service, "search", { ...body, limit: PAGE, offset });
    if (!res.ok) throw new Error(`${service}/search: ${res.error ?? res.status}`);
    const rows = rexRows(res.result);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function listingDoor(r: Record<string, unknown>, source: "withdrawn" | "leased"): RexDoorRow {
  const p = propertyOf(r.property as Record<string, unknown>);
  const related = (r.related ?? {}) as Record<string, unknown>;
  const agent = (r.listing_agent_1 as Record<string, unknown> | null)?.name;
  const rent = r.price_rent != null ? Number(r.price_rent) : null;
  return {
    source,
    rex_ref: String(r.id),
    rex_property_id: p.id,
    address: p.address,
    postcode: p.postcode,
    district: outward(p.postcode),
    event_on: str(r.state_date) ?? (r.system_modtime ? new Date(Number(r.system_modtime) * 1000).toISOString().slice(0, 10) : null),
    reason: str(r.state_reason_id),
    /* REX gives the agency it went to as an id, not a name, so it is kept
       for later and never shown. */
    lost_agency: str(r.state_lost_agency_id),
    agent: str(agent),
    rent: rent != null && Number.isFinite(rent) ? rent : null,
    state: str(r.system_listing_state),
    contact: ownerOf(related.contact_reln_listing),
    contacts_read: true,
  };
}

function appraisalDoor(r: Record<string, unknown>): RexDoorRow {
  const p = propertyOf(r.property as Record<string, unknown>);
  const agent = (r.agent_1 as Record<string, unknown> | null)?.name;
  const date = str(r.appraisal_date);
  return {
    source: "appraisal",
    rex_ref: String(r.id),
    rex_property_id: p.id,
    address: p.address,
    postcode: p.postcode,
    district: outward(p.postcode),
    /* REX holds a few appraisals dated in the next century. They are not
       evidence of anything and are left undated. */
    event_on: date && date <= new Date().toISOString().slice(0, 10) ? date : null,
    reason: str((r.archive_reason as Record<string, unknown> | null)?.id ?? r.archive_reason),
    lost_agency: str((r.archive_lost_agency as Record<string, unknown> | null)?.name ?? null),
    agent: str(agent),
    rent: r.price_rent != null ? Number(r.price_rent) : null,
    state: str(r.appraisal_state),
    contact: null,
    contacts_read: false,
  };
}

async function upsertDoor(d: RexDoorRow): Promise<void> {
  await q(
    `INSERT INTO os_bond_rex_doors (source, rex_ref, rex_property_id, address, postcode, district, event_on, reason, lost_agency, agent, rent, state,
                                    contact_name, contact_phone, contact_email, rex_contact_id, contacts_read, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
     ON CONFLICT (source, rex_ref) DO UPDATE SET
       rex_property_id = EXCLUDED.rex_property_id, address = EXCLUDED.address, postcode = EXCLUDED.postcode, district = EXCLUDED.district,
       event_on = EXCLUDED.event_on, reason = EXCLUDED.reason, lost_agency = EXCLUDED.lost_agency, agent = EXCLUDED.agent, rent = EXCLUDED.rent,
       state = EXCLUDED.state,
       contact_name = CASE WHEN EXCLUDED.contacts_read THEN EXCLUDED.contact_name ELSE os_bond_rex_doors.contact_name END,
       contact_phone = CASE WHEN EXCLUDED.contacts_read THEN EXCLUDED.contact_phone ELSE os_bond_rex_doors.contact_phone END,
       contact_email = CASE WHEN EXCLUDED.contacts_read THEN EXCLUDED.contact_email ELSE os_bond_rex_doors.contact_email END,
       rex_contact_id = CASE WHEN EXCLUDED.contacts_read THEN EXCLUDED.rex_contact_id ELSE os_bond_rex_doors.rex_contact_id END,
       contacts_read = os_bond_rex_doors.contacts_read OR EXCLUDED.contacts_read,
       synced_at = NOW()`,
    [
      d.source, d.rex_ref, d.rex_property_id, d.address, d.postcode, d.district, d.event_on, d.reason, d.lost_agency, d.agent, d.rent, d.state,
      d.contact?.name ?? null, d.contact?.phone ?? null, d.contact?.email ?? null, d.contact?.id ?? null, d.contacts_read,
    ]
  );
}

export interface RexSyncResult {
  ok: boolean;
  reason?: string;
  withdrawn: number;
  leased: number;
  appraisals: number;
  contactsRead: number;
  contactsLeft: number;
}

/**
 * Read the three REX sources into os_bond_rex_doors. Minutes, not seconds:
 * call it from the cron route's background work, never from a page.
 */
export async function syncRexDoors(): Promise<RexSyncResult> {
  const empty = { withdrawn: 0, leased: 0, appraisals: 0, contactsRead: 0, contactsLeft: 0 };
  if (!hasDb()) return { ok: false, reason: "no database", ...empty };
  if (!rexConfigured()) return { ok: false, reason: "REX is not connected on this environment.", ...empty };

  const since = new Date();
  since.setMonth(since.getMonth() - 24);
  const sinceYmd = since.toISOString().slice(0, 10);

  const withdrawn = await pages("Listings", {
    criteria: [{ name: "system_listing_state", type: "=", value: "withdrawn" }, LETTINGS],
    extra_options: { extra_fields: ["related.contact_reln_listing"] },
  });
  for (const r of withdrawn) await upsertDoor(listingDoor(r, "withdrawn"));

  const leased = await pages("Listings", {
    criteria: [{ name: "system_listing_state", type: "=", value: "leased" }, LETTINGS],
    extra_options: { extra_fields: ["related.contact_reln_listing"] },
  });
  for (const r of leased) await upsertDoor(listingDoor(r, "leased"));

  const appraisals = await pages("Appraisals", {
    criteria: [
      { name: "appraisal_date", type: ">=", value: sinceYmd },
      { name: "appraisal_type_id", type: "=", value: "rent" },
    ],
    order_by: { appraisal_date: "desc" },
  });
  for (const r of appraisals) await upsertDoor(appraisalDoor(r));

  /* The landlord behind an appraisal lives on the PROPERTY, one read each.
     A batch a run, watched districts first, so the list is useful from day
     one and complete within the week. */
  const districts = (await watchedDistricts()).map((d) => d.district);
  const todo = await q<{ id: number; rex_property_id: string }>(
    `SELECT id, rex_property_id FROM os_bond_rex_doors
      WHERE source = 'appraisal' AND contacts_read = FALSE AND rex_property_id IS NOT NULL
      ORDER BY (district = ANY($1::text[])) DESC, event_on DESC NULLS LAST
      LIMIT $2`,
    [districts, CONTACT_READS_PER_RUN]
  );
  let contactsRead = 0;
  for (const t of todo) {
    const res = await rexCall("Properties", "read", { id: t.rex_property_id }).catch(() => null);
    if (!res || !res.ok) continue;
    const related = ((res.result as Record<string, unknown>)?.related ?? {}) as Record<string, unknown>;
    const c = ownerOf(related.contact_reln_property);
    await q(
      `UPDATE os_bond_rex_doors SET contact_name = $2, contact_phone = $3, contact_email = $4, rex_contact_id = $5, contacts_read = TRUE WHERE id = $1`,
      [t.id, c?.name ?? null, c?.phone ?? null, c?.email ?? null, c?.id ?? null]
    );
    contactsRead++;
  }
  const [left] = await q<{ n: string }>(
    `SELECT count(*) AS n FROM os_bond_rex_doors WHERE source = 'appraisal' AND contacts_read = FALSE AND rex_property_id IS NOT NULL`
  );
  return { ok: true, withdrawn: withdrawn.length, leased: leased.length, appraisals: appraisals.length, contactsRead, contactsLeft: Number(left?.n ?? 0) };
}

/* ── Matching a REX door to a Bond door ──────────────────────────────────── */

const numbersIn = (s: string): Set<string> => new Set((s.toUpperCase().match(/\b\d+[A-Z]?\b/g) ?? []).map((t) => t.replace(/^0+(?=\d)/, "")));
const STREET_WORDS = /^(the|road|street|lane|close|avenue|drive|way|court|flat|apartment|northampton|kettering|wellingborough|bedford|milton|keynes)$/;
const words = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length > 2 && !STREET_WORDS.test(w) && !/^\d/.test(w));

/** Strip the postcode so its digits are not mistaken for a house number. */
const withoutPostcode = (s: string) => s.replace(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/gi, " ");

export function sameDoor(rexAddress: string, candidate: string): boolean {
  const a = numbersIn(withoutPostcode(rexAddress));
  const b = numbersIn(withoutPostcode(candidate));
  if (a.size === 0 && b.size === 0) {
    /* Named houses: the name has to appear. */
    const wa = words(withoutPostcode(rexAddress));
    const cb = candidate.toLowerCase();
    return wa.length > 0 && wa.slice(0, 2).every((w) => cb.includes(w));
  }
  if (a.size === 0 || b.size === 0) return false;
  for (const n of a) if (!b.has(n)) return false;
  for (const n of b) if (!a.has(n)) return false;
  /* Same numbers in the same postcode is nearly always the same door; ask
     for one street word in common as well so two streets sharing a
     postcode do not collide. */
  const wa = words(withoutPostcode(rexAddress));
  const wb = new Set(words(withoutPostcode(candidate)));
  return wa.length === 0 || wb.size === 0 || wa.some((w) => wb.has(w));
}

async function matchDoors(): Promise<number> {
  const doors = await q<{ id: number; address: string; postcode: string }>(
    `SELECT id, address, postcode FROM os_bond_rex_doors
      WHERE property_key IS NULL AND postcode <> '' AND (matched_at IS NULL OR matched_at < NOW() - INTERVAL '1 day')`
  );
  let matched = 0;
  for (const d of doors) {
    const cands = await q<{ property_key: string; address: string }>(
      `SELECT DISTINCT ON (property_key) property_key, coalesce(nullif(address, ''), street, '') AS address
         FROM os_listing_capture WHERE upper(postcode) = upper($1) AND property_key IS NOT NULL
        ORDER BY property_key, first_seen DESC`,
      [d.postcode]
    );
    const hit = cands.find((c) => sameDoor(d.address, c.address));
    await q(`UPDATE os_bond_rex_doors SET property_key = $2, matched_at = NOW() WHERE id = $1`, [d.id, hit?.property_key ?? null]);
    if (hit) matched++;
  }
  return matched;
}

/* ── Building the list ───────────────────────────────────────────────────── */

interface Latest extends Record<string, unknown> {
  property_key: string;
  agent: string | null;
  status: string;
  listed_on: string | null;
  first_seen: string;
  gone_at: string | null;
  reduced_at: string | null;
  rent: number | null;
}

const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
const monthYear = (ymd: string) => new Date(ymd).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const firstName = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || "there";
/** How you would say it on the phone: the house and street, not the postcode. */
const spoken = (address: string) => withoutPostcode(address).split(",")[0].trim() || address;
const listedOn = (l: Latest) => l.listed_on ?? l.first_seen.slice(0, 10);

function describeListing(l: Latest, today: string): { agentBit: string; daysBit: string; onMarket: boolean; days: number } {
  const days = daysBetween(listedOn(l), today);
  const onMarket = !l.gone_at && l.status !== "withdrawn";
  const agentBit = isPrivateLister(l.agent) ? "being let privately" : l.agent ? `with ${l.agent}` : "with another agent";
  const daysBit = onMarket ? `${days} day${days === 1 ? "" : "s"} on the market` : l.status === "let agreed" ? "let agreed" : "since come down";
  return { agentBit, daysBit, onMarket, days };
}

interface Draft {
  key: string;
  kind: NudgeKind;
  source: string;
  rex_ref: string;
  rex_property_id: string | null;
  property_key: string | null;
  address: string;
  postcode: string;
  district: string | null;
  contact: Contact | null;
  our_agent: string | null;
  headline: string;
  reason: string;
  opener: string;
  detail: Record<string, unknown>;
  score: number;
}

export async function buildNudges(): Promise<{ nudges: number; matched: number }> {
  if (!hasDb()) return { nudges: 0, matched: 0 };
  const matched = await matchDoors();
  const today = new Date().toISOString().slice(0, 10);
  const districts = (await watchedDistricts()).map((d) => d.district);
  const startedAt = new Date().toISOString();

  const doors = await q<Record<string, unknown>>(
    `SELECT *, event_on::text AS event_on FROM os_bond_rex_doors WHERE district = ANY($1::text[]) AND (event_on IS NULL OR event_on > CURRENT_DATE - INTERVAL '30 months')`,
    [districts]
  );
  const keys = [...new Set(doors.map((d) => d.property_key as string | null).filter((k): k is string => Boolean(k)))];
  const latestRows = keys.length
    ? await q<Latest>(
        `SELECT DISTINCT ON (property_key) property_key, agent, status, listed_on::text AS listed_on, first_seen::text AS first_seen,
                gone_at::text AS gone_at, reduced_at::text AS reduced_at, rent
           FROM os_listing_capture WHERE market = 'let' AND property_key = ANY($1::text[])
          ORDER BY property_key, coalesce(listed_on, first_seen::date) DESC, first_seen DESC`,
        [keys]
      )
    : [];
  const latest = new Map(latestRows.map((l) => [l.property_key, l]));
  const signalRows = keys.length
    ? await q<{ property_key: string; score: number; signals: Array<{ key: SignalKey; detail: string }> }>(
        `SELECT property_key, score, signals FROM os_radar_prospects WHERE property_key = ANY($1::text[])`,
        [keys]
      )
    : [];
  const signals = new Map(signalRows.map((s) => [s.property_key, s]));

  const rows: Draft[] = [];
  const signalBits = (key: string | null) => {
    const s = key ? signals.get(key) : null;
    if (!s) return { bits: [] as string[], score: 0 };
    const bits = (Array.isArray(s.signals) ? s.signals : [])
      .filter((x) => ["reduced", "stale_90", "stale_60", "relisted", "fallen_through", "switched_agent"].includes(x.key))
      .map((x) => `${SIGNALS[x.key]?.label ?? x.key}: ${x.detail}`);
    return { bits, score: Number(s.score) || 0 };
  };

  for (const d of doors) {
    const source = String(d.source);
    const key = (d.property_key as string) ?? null;
    const l = key ? latest.get(key) : undefined;
    const eventOn = d.event_on ? String(d.event_on).slice(0, 10) : null;
    const contact: Contact | null = d.contact_name
      ? { id: (d.rex_contact_id as string) ?? null, name: String(d.contact_name), phone: (d.contact_phone as string) ?? null, email: (d.contact_email as string) ?? null }
      : null;
    const base = {
      source,
      rex_ref: String(d.rex_ref),
      rex_property_id: (d.rex_property_id as string) ?? null,
      property_key: key,
      address: String(d.address),
      postcode: String(d.postcode),
      district: (d.district as string) ?? null,
      contact,
      our_agent: (d.agent as string) ?? null,
    };
    const listedAfter = Boolean(l && eventOn && listedOn(l) > eventOn && !isOurs(l.agent));
    const first = firstName(contact?.name ?? null);
    const sig = signalBits(key);
    const lift = Math.min(10, Math.round(sig.score / 10));

    if (source === "withdrawn" && d.reason !== "accidental_creation") {
      if (listedAfter && l) {
        const w = describeListing(l, today);
        const when = eventOn ? monthYear(eventOn) : "recently";
        rows.push({
          ...base,
          key: `win_back|${source}:${d.rex_ref}|${listedOn(l)}`,
          kind: "win_back",
          headline: `Back on the market ${w.agentBit}`,
          reason: [`We had it until ${when} (${String(d.reason ?? "withdrawn").replace(/_/g, " ")}).`, `Now ${w.agentBit}, ${w.daysBit}.`, ...sig.bits].join(" "),
          opener: `Hi ${first}, it is The Lettings Experts. We looked after ${spoken(base.address)} until ${when} and I can see it is back on the market, ${w.daysBit}. How is it going? If it would help, we would happily take another look and tell you where the rent should sit.`,
          detail: { listing: l, signals: sig.bits, withdrawn_reason: d.reason, lost_agency: d.lost_agency },
          score: (w.onMarket ? 90 : 70) + lift,
        });
      } else if (eventOn && daysBetween(eventOn, today) <= 365 && ["lost_to_another_agency", "sold_or_let_privately", "expired_authority", "other"].includes(String(d.reason))) {
        rows.push({
          ...base,
          key: `lost_instruction|${source}:${d.rex_ref}|${eventOn}`,
          kind: "lost_instruction",
          headline: `Withdrawn ${monthYear(eventOn)}: ${String(d.reason).replace(/_/g, " ")}`,
          reason: `Came off our books in ${monthYear(eventOn)}${d.lost_agency && !/^\d+$/.test(String(d.lost_agency)) ? ` to ${d.lost_agency}` : ""}. Nothing seen on the market since.`,
          opener: `Hi ${first}, it is The Lettings Experts. We had ${spoken(base.address)} until ${monthYear(eventOn)} and I wanted to check how it is being let now, and whether there is anything we can help with.`,
          detail: { withdrawn_reason: d.reason, lost_agency: d.lost_agency },
          score: 45,
        });
      }
    }

    if (source === "leased" && listedAfter && l) {
      const w = describeListing(l, today);
      rows.push({
        ...base,
        key: `former_landlord|${source}:${d.rex_ref}|${listedOn(l)}`,
        kind: "former_landlord",
        headline: `We let it before; now ${w.agentBit}`,
        reason: [`We let it${eventOn ? ` in ${monthYear(eventOn)}` : ""}.`, `Now ${w.agentBit}, ${w.daysBit}.`, ...sig.bits].join(" "),
        opener: `Hi ${first}, it is The Lettings Experts. We let ${spoken(base.address)} for you${eventOn ? ` in ${monthYear(eventOn)}` : ""} and I noticed it is on the market again, ${w.daysBit}. Would a second opinion on the rent be useful? No charge, and no obligation.`,
        detail: { listing: l, signals: sig.bits },
        score: (w.onMarket ? 85 : 65) + lift,
      });
    }

    if (source === "appraisal" && d.state !== "archived") {
      const rentBit = d.rent ? ` at £${Number(d.rent).toLocaleString("en-GB")}` : "";
      if (listedAfter && l) {
        const w = describeListing(l, today);
        rows.push({
          ...base,
          key: `appraisal_elsewhere|${source}:${d.rex_ref}|${listedOn(l)}`,
          kind: "appraisal_elsewhere",
          headline: `Valued by us, now ${w.agentBit}`,
          reason: [`We valued it${eventOn ? ` in ${monthYear(eventOn)}` : ""}${rentBit}.`, `Now ${w.agentBit}, ${w.daysBit}.`, ...sig.bits].join(" "),
          opener: `Hi ${first}, it is The Lettings Experts. We came out to value ${spoken(base.address)}${eventOn ? ` in ${monthYear(eventOn)}` : ""}. I can see it is on the market now, ${w.daysBit}. How is it going? If the rent is not quite landing, we would be glad to take another look.`,
          detail: { listing: l, signals: sig.bits, appraised_rent: d.rent },
          score: (w.onMarket ? 85 : 60) + lift,
        });
      } else if (eventOn && daysBetween(eventOn, today) >= 300 && daysBetween(eventOn, today) <= 420) {
        rows.push({
          ...base,
          key: `appraisal_anniversary|${source}:${d.rex_ref}`,
          kind: "appraisal_anniversary",
          headline: "A year since we valued it",
          reason: `Valued ${monthYear(eventOn)}${rentBit}. Not on the market that we have seen. Rents have moved since.`,
          opener: `Hi ${first}, it is The Lettings Experts. It is about a year since we valued ${spoken(base.address)}. Rents around you have moved since then; would an updated figure be useful? It takes ten minutes and there is no charge.`,
          detail: { appraised_rent: d.rent },
          score: 55,
        });
      }
    }
  }

  /* The OS's own appraisals join the REX ones: the store of record for
     anything valued since launch, with the landlord's details on the lead. */
  const osAppraisals = (await listAppraisals().catch(() => [])).filter((a) => a.stage !== "won" && a.postcode);
  const capByPostcode = new Map<string, Array<{ property_key: string; address: string }>>();
  for (const a of osAppraisals) {
    const pc = a.postcode.toUpperCase().replace(/\s+/g, " ").trim();
    if (!districts.includes(outward(pc) ?? "")) continue;
    let cands = capByPostcode.get(pc);
    if (!cands) {
      cands = await q<{ property_key: string; address: string }>(
        `SELECT DISTINCT ON (property_key) property_key, coalesce(nullif(address, ''), street, '') AS address
           FROM os_listing_capture WHERE upper(postcode) = $1 AND property_key IS NOT NULL ORDER BY property_key, first_seen DESC`,
        [pc]
      );
      capByPostcode.set(pc, cands);
    }
    const hit = cands.find((c) => sameDoor(a.address, c.address));
    if (!hit) continue;
    const [l] = await q<Latest>(
      `SELECT property_key, agent, status, listed_on::text AS listed_on, first_seen::text AS first_seen, gone_at::text AS gone_at, reduced_at::text AS reduced_at, rent
         FROM os_listing_capture WHERE market = 'let' AND property_key = $1 ORDER BY coalesce(listed_on, first_seen::date) DESC, first_seen DESC LIMIT 1`,
      [hit.property_key]
    );
    const eventOn = a.createdAt.slice(0, 10);
    if (!l || isOurs(l.agent) || listedOn(l) <= eventOn) continue;
    const w = describeListing(l, today);
    const first = firstName(a.landlord);
    const sig = signalBits(hit.property_key);
    rows.push({
      key: `appraisal_elsewhere|os:${a.id}|${listedOn(l)}`,
      kind: "appraisal_elsewhere",
      source: "os_appraisal",
      rex_ref: a.id,
      rex_property_id: a.rexPropertyId,
      property_key: hit.property_key,
      address: a.address,
      postcode: pc,
      district: outward(pc),
      contact: { id: null, name: a.landlord, phone: a.landlordMobile ?? null, email: a.landlordEmail ?? null },
      our_agent: a.agent,
      headline: `Valued by us, now ${w.agentBit}`,
      reason: [`We valued it in ${monthYear(eventOn)}${a.valuation ? ` at £${a.valuation.toLocaleString("en-GB")}` : ""} (${a.stage.replace(/_/g, " ")}).`, `Now ${w.agentBit}, ${w.daysBit}.`, ...sig.bits].join(" "),
      opener: `Hi ${first}, it is The Lettings Experts. We came out to value ${spoken(a.address)} in ${monthYear(eventOn)}. I can see it is on the market now, ${w.daysBit}. How is it going? If the rent is not quite landing, we would be glad to take another look.`,
      detail: { listing: l, signals: sig.bits, appraised_rent: a.valuation, stage: a.stage },
      score: (w.onMarket ? 85 : 60) + Math.min(10, Math.round(sig.score / 10)),
    });
  }

  for (const r of rows) {
    await q(
      `INSERT INTO os_bond_nudges (nudge_key, kind, source, rex_ref, rex_property_id, property_key, address, postcode, district,
                                   contact_name, contact_phone, contact_email, rex_contact_id, our_agent, headline, reason, opener, detail, score, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,NOW())
       ON CONFLICT (nudge_key) DO UPDATE SET
         property_key = EXCLUDED.property_key, address = EXCLUDED.address,
         contact_name = coalesce(EXCLUDED.contact_name, os_bond_nudges.contact_name),
         contact_phone = coalesce(EXCLUDED.contact_phone, os_bond_nudges.contact_phone),
         contact_email = coalesce(EXCLUDED.contact_email, os_bond_nudges.contact_email),
         rex_contact_id = coalesce(EXCLUDED.rex_contact_id, os_bond_nudges.rex_contact_id), our_agent = EXCLUDED.our_agent,
         headline = EXCLUDED.headline, reason = EXCLUDED.reason, opener = EXCLUDED.opener, detail = EXCLUDED.detail, score = EXCLUDED.score,
         status = CASE WHEN os_bond_nudges.status = 'gone' THEN 'open' ELSE os_bond_nudges.status END,
         last_seen = NOW(), updated_at = NOW()`,
      [
        r.key, r.kind, r.source, r.rex_ref, r.rex_property_id, r.property_key, r.address, r.postcode, r.district,
        r.contact?.name ?? null, r.contact?.phone ?? null, r.contact?.email ?? null, r.contact?.id ?? null, r.our_agent,
        r.headline, r.reason, r.opener, JSON.stringify(r.detail), Math.min(100, r.score),
      ]
    );
  }
  /* Anything open that this build did not see again has lost its reason. */
  await q(`UPDATE os_bond_nudges SET status = 'gone', updated_at = NOW() WHERE status IN ('open', 'snoozed') AND last_seen < $1`, [startedAt]);
  return { nudges: rows.length, matched };
}

/* ── Reading and working the list ────────────────────────────────────────── */

function toNudge(r: Record<string, unknown>): Nudge {
  return {
    ...r,
    id: Number(r.id),
    nudge_key: String(r.nudge_key),
    kind: r.kind as NudgeKind,
    source: String(r.source),
    rex_ref: String(r.rex_ref),
    rex_property_id: (r.rex_property_id as string) ?? null,
    property_key: (r.property_key as string) ?? null,
    address: String(r.address ?? ""),
    postcode: String(r.postcode ?? ""),
    district: (r.district as string) ?? null,
    contact_name: (r.contact_name as string) ?? null,
    contact_phone: (r.contact_phone as string) ?? null,
    contact_email: (r.contact_email as string) ?? null,
    rex_contact_id: (r.rex_contact_id as string) ?? null,
    our_agent: (r.our_agent as string) ?? null,
    headline: String(r.headline ?? ""),
    reason: String(r.reason ?? ""),
    opener: String(r.opener ?? ""),
    detail: (r.detail as Record<string, unknown>) ?? {},
    score: Number(r.score ?? 0),
    status: (r.status as NudgeStatus) ?? "open",
    snoozed_until: r.snoozed_until ? String(r.snoozed_until).slice(0, 10) : null,
    notes: String(r.notes ?? ""),
    done_by: (r.done_by as string) ?? null,
    first_seen: new Date(r.first_seen as string).toISOString(),
    last_seen: new Date(r.last_seen as string).toISOString(),
  };
}

export interface NudgeList {
  nudges: Nudge[];
  counts: { open: number; snoozed: number; done: number; dismissed: number; gone: number };
  byKind: Partial<Record<NudgeKind, number>>;
  rex: { synced_at: string | null; doors: number; contactsLeft: number };
}

export async function listNudges(opts: { districts?: string[]; status?: NudgeStatus | "all" } = {}): Promise<NudgeList> {
  const empty: NudgeList = { nudges: [], counts: { open: 0, snoozed: 0, done: 0, dismissed: 0, gone: 0 }, byKind: {}, rex: { synced_at: null, doors: 0, contactsLeft: 0 } };
  if (!hasDb()) return empty;
  const districts = opts.districts ?? [];
  const status = opts.status ?? "open";
  /* A snooze that has run out is open again. */
  await q(`UPDATE os_bond_nudges SET status = 'open', snoozed_until = NULL, updated_at = NOW() WHERE status = 'snoozed' AND snoozed_until <= CURRENT_DATE`);
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM os_bond_nudges
      WHERE ($1::text[] = '{}' OR district = ANY($1::text[]))
        AND ($2 = 'all' OR status = $2)
      ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'snoozed' THEN 1 WHEN 'done' THEN 2 WHEN 'dismissed' THEN 3 ELSE 4 END, score DESC, last_seen DESC
      LIMIT 500`,
    [districts, status]
  );
  const counts = await q<{ status: string; n: string }>(
    `SELECT status, count(*) AS n FROM os_bond_nudges WHERE ($1::text[] = '{}' OR district = ANY($1::text[])) GROUP BY status`,
    [districts]
  );
  const kinds = await q<{ kind: string; n: string }>(
    `SELECT kind, count(*) AS n FROM os_bond_nudges WHERE status = 'open' AND ($1::text[] = '{}' OR district = ANY($1::text[])) GROUP BY kind`,
    [districts]
  );
  const [rex] = await q<{ synced_at: string | null; doors: string; left: string }>(
    `SELECT max(synced_at)::text AS synced_at, count(*) AS doors,
            count(*) FILTER (WHERE source = 'appraisal' AND contacts_read = FALSE AND rex_property_id IS NOT NULL) AS left
       FROM os_bond_rex_doors`
  );
  const c = { ...empty.counts };
  for (const r of counts) if (r.status in c) c[r.status as keyof typeof c] = Number(r.n);
  const byKind: Partial<Record<NudgeKind, number>> = {};
  for (const k of kinds) byKind[k.kind as NudgeKind] = Number(k.n);
  return {
    nudges: rows.map(toNudge),
    counts: c,
    byKind,
    rex: { synced_at: rex?.synced_at ? new Date(rex.synced_at).toISOString() : null, doors: Number(rex?.doors ?? 0), contactsLeft: Number(rex?.left ?? 0) },
  };
}

export async function updateNudge(
  id: number,
  actor: string,
  patch: { status?: unknown; notes?: unknown; snooze_days?: unknown }
): Promise<Nudge | null> {
  if (!hasDb()) return null;
  const [cur] = await q<Record<string, unknown>>(`SELECT * FROM os_bond_nudges WHERE id = $1`, [id]);
  if (!cur) return null;
  const sets: string[] = [];
  const vals: unknown[] = [id];
  let said: string | null = null;
  if (patch.status !== undefined) {
    const s = String(patch.status);
    if (!["open", "snoozed", "done", "dismissed"].includes(s)) throw new Error("That is not a status.");
    vals.push(s);
    sets.push(`status = $${vals.length}`);
    if (s === "snoozed") {
      const days = Math.min(120, Math.max(1, Number(patch.snooze_days) || 30));
      vals.push(days);
      sets.push(`snoozed_until = CURRENT_DATE + ($${vals.length}::int)`);
      said = `Snoozed for ${days} days`;
    } else {
      sets.push(`snoozed_until = NULL`);
      said = s === "done" ? "Called" : s === "dismissed" ? "Not now" : "Reopened";
    }
    if (s === "done") {
      vals.push(actor);
      sets.push(`done_by = $${vals.length}`, `done_at = NOW()`);
    }
  }
  if (patch.notes !== undefined) {
    vals.push(String(patch.notes ?? "").slice(0, 2000));
    sets.push(`notes = $${vals.length}`);
    if (!said) said = "Note written";
  }
  if (sets.length === 0) throw new Error("Nothing to change.");
  const rows = await q<Record<string, unknown>>(`UPDATE os_bond_nudges SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1 RETURNING *`, vals);
  const n = rows[0] ? toNudge(rows[0]) : null;
  if (n && said) {
    await logActivity({
      actor,
      kind: "nudge",
      property_key: n.property_key,
      address: n.address,
      detail: `${said} · ${NUDGE_LABEL[n.kind]?.label ?? n.kind}${n.contact_name ? ` · ${n.contact_name}` : ""}`,
    });
  }
  return n;
}
