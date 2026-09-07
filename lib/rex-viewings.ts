import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import { hasDb, q } from "@/lib/db";
import { recordLeads } from "@/lib/lead-ledger";
import type { Lead } from "@/lib/leads-sample";

/**
 * A listing's viewings, out of REX's diary, kept.
 *
 * James, 7 Sep 2026: the team moving over from REX will want to see what
 * has happened on a property - the viewings it has had, who came, when -
 * and every person who viewed is a lead worth keeping. REX's calendar
 * events carry the listing and the contact as linked records (`records`),
 * and `records.listing_id` / `records.property_id` are searchable, so a
 * listing's diary is one call. Everything read is written to `os_viewings`
 * and never deleted, and each viewer who is not already a lead becomes one
 * in the ledger, sourced "REX diary".
 */

export interface ViewingContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** The lead on the board for this person, when there is one. */
  leadId?: string | null;
}

export interface Viewing {
  id: string;
  rexEventId: string;
  listingId: string | null;
  listingLabel: string | null;
  propertyId: string | null;
  startsAt: string;
  endsAt: string | null;
  mins: number;
  /** "viewing" | "appraisal" | "inspection" | "other" */
  kind: string;
  title: string;
  /** REX's appointment type name: "TLE Accompanied Viewing". */
  type: string | null;
  status: string | null;
  cancelled: boolean;
  agent: string | null;
  contacts: ViewingContact[];
  feedbackId: string | null;
  description: string | null;
}

interface RexRecord {
  id?: string | number;
  service?: string;
  label?: string | null;
  stub?: Record<string, unknown> | null;
}
interface RexEvent {
  id?: string | number;
  title?: string | null;
  description?: string | null;
  starts_at?: { time?: string } | null;
  ends_at?: { time?: string } | null;
  is_cancelled?: boolean | null;
  status?: { id?: string; text?: string } | null;
  appointment_type?: { name?: string } | null;
  organiser_user?: { name?: string } | null;
  calendar?: { owner_user?: { name?: string } | null } | null;
  records?: RexRecord[] | null;
}

function kindOf(title: string, type: string | null): string {
  const t = `${type ?? ""} ${title}`.toLowerCase();
  if (t.includes("viewing")) return "viewing";
  if (t.includes("appraisal") || t.includes("valuation")) return "appraisal";
  if (t.includes("inventory") || t.includes("inspection") || t.includes("check in") || t.includes("check-in") || t.includes("check out")) return "inspection";
  return "other";
}

function toViewing(e: RexEvent): Viewing | null {
  const startsAt = e.starts_at?.time;
  if (!startsAt || e.id == null) return null;
  const endsAt = e.ends_at?.time ?? null;
  const mins = endsAt ? Math.max(5, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000)) : 30;
  const records = e.records ?? [];
  const listing = records.find((r) => r.service === "Listings");
  const property = records.find((r) => r.service === "Properties");
  const feedback = records.find((r) => r.service === "Feedback");
  const contacts: ViewingContact[] = records
    .filter((r) => r.service === "Contacts" && r.id != null)
    .map((r) => {
      const s = (r.stub ?? {}) as { name?: string; email_address?: string | null; phone_number?: string | null };
      return { id: String(r.id), name: (s.name ?? r.label ?? "").trim() || "(no name)", email: s.email_address ?? null, phone: s.phone_number ?? null };
    });
  const type = e.appointment_type?.name ?? null;
  const title = (e.title ?? "").trim();
  return {
    id: `rex-${e.id}`,
    rexEventId: String(e.id),
    listingId: listing?.id != null ? String(listing.id) : null,
    listingLabel: listing?.label ?? null,
    propertyId: property?.id != null ? String(property.id) : ((listing?.stub as { property?: { id?: string | number } } | undefined)?.property?.id != null ? String((listing?.stub as { property: { id: string | number } }).property.id) : null),
    startsAt,
    endsAt,
    mins,
    kind: kindOf(title, type),
    title,
    type,
    status: e.status?.text ?? null,
    cancelled: Boolean(e.is_cancelled) || e.status?.id === "cancelled",
    agent: e.organiser_user?.name ?? e.calendar?.owner_user?.name ?? null,
    contacts,
    feedbackId: feedback?.id != null ? String(feedback.id) : null,
    description: e.description?.trim() || null,
  };
}

/** Every listing REX holds on the same property: a shared house is many. */
async function siblingListingIds(propertyId: string): Promise<string[]> {
  const res = await rexCall("Listings", "search", { limit: 100, criteria: [{ name: "property_id", type: "=", value: propertyId }] });
  if (!res.ok) return [];
  return rexRows(res.result).map((r) => String((r as { id?: string | number }).id ?? "")).filter(Boolean);
}

/** The diary for a listing and, through its property, its sister listings. */
export async function fetchViewingsFor(listingId: string, propertyId: string | null): Promise<Viewing[]> {
  if (!rexConfigured()) return [];
  const ids = new Set<string>([listingId]);
  if (propertyId) for (const id of await siblingListingIds(propertyId).catch(() => [])) ids.add(id);
  const seen = new Map<string, Viewing>();
  const searches: unknown[][] = [[{ name: "records.listing_id", type: "in", value: [...ids] }]];
  if (propertyId) searches.push([{ name: "records.property_id", type: "=", value: propertyId }]);
  for (const criteria of searches) {
    for (let offset = 0; offset < 400; offset += 100) {
      const res = await rexCall("CalendarEvents", "search", { limit: 100, offset, order_by: { starts_at: "desc" }, criteria });
      if (!res.ok) break;
      const rows = rexRows(res.result) as RexEvent[];
      for (const e of rows) {
        const v = toViewing(e);
        if (v && !seen.has(v.id)) seen.set(v.id, v);
      }
      if (rows.length < 100) break;
    }
  }
  return [...seen.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** Kept for good, then the viewers who are not yet leads become leads. */
export async function recordViewings(viewings: Viewing[]): Promise<void> {
  if (!hasDb() || !viewings.length) return;
  const cols = viewings.map((v) => [v.id, v.listingId, v.propertyId, v.startsAt, v.endsAt, v.mins, v.kind, v.title, v.status, v.cancelled, v.agent, JSON.stringify(v.contacts), v.feedbackId, JSON.stringify(v)]);
  const width = cols[0].length;
  const values = cols.map((_, i) => `(${Array.from({ length: width }, (__, j) => `$${i * width + j + 1}`).join(", ")})`).join(",\n");
  await q(
    `INSERT INTO os_viewings (id, listing_id, property_id, starts_at, ends_at, mins, kind, title, status, cancelled, agent, contacts, feedback_id, payload)
     VALUES ${values}
     ON CONFLICT (id) DO UPDATE SET
       listing_id = EXCLUDED.listing_id, property_id = EXCLUDED.property_id, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
       mins = EXCLUDED.mins, kind = EXCLUDED.kind, title = EXCLUDED.title, status = EXCLUDED.status, cancelled = EXCLUDED.cancelled,
       agent = EXCLUDED.agent, contacts = EXCLUDED.contacts, feedback_id = EXCLUDED.feedback_id, payload = EXCLUDED.payload, last_seen = NOW()`,
    cols.flat()
  );

  /* An appointment booked in the OS that has since reached REX comes back
     here as a REX event. Same place, same start (to the minute), and the OS
     row is marked with the REX id so nothing shows it twice. */
  for (const v of viewings) {
    if (!v.listingLabel && !v.title) continue;
    const street = (v.listingLabel ?? v.title).split(",")[0].trim().toLowerCase();
    if (street.length < 4) continue;
    await q(
      `UPDATE os_appointments SET rex_event_id = $1, synced_at = COALESCE(synced_at, NOW())
        WHERE rex_event_id IS NULL
          AND ABS(EXTRACT(EPOCH FROM (starts_at - $2::timestamptz))) <= 120
          AND (LOWER(where_at) LIKE $3 OR LOWER(title) LIKE $3)`,
      [v.id, v.startsAt, `%${street}%`]
    ).catch(() => null);
  }

  /* Viewers as leads. Only people the ledger does not already hold by
     contact id: a portal enquiry that led to the viewing stays the record. */
  const contacts = new Map<string, { c: ViewingContact; v: Viewing }>();
  for (const v of viewings) for (const c of v.contacts) if (!contacts.has(c.id) || v.startsAt > contacts.get(c.id)!.v.startsAt) contacts.set(c.id, { c, v });
  if (!contacts.size) return;
  const known = await q<{ contact_id: string }>(`SELECT contact_id FROM os_leads WHERE contact_id = ANY($1)`, [[...contacts.keys()]]).catch(() => []);
  const have = new Set(known.map((k) => k.contact_id));
  const fresh: Lead[] = [];
  for (const [id, { c, v }] of contacts) {
    if (have.has(id)) continue;
    const when = new Date(v.startsAt);
    fresh.push({
      id: `contact-${id}`,
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      enquiry: "Letting",
      area: v.listingLabel?.split(",").slice(-1)[0]?.trim() ?? "—",
      budget: "—",
      source: "REX diary",
      received: when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      stage: v.cancelled ? "New" : when.getTime() < Date.now() ? "Contacted" : "Viewing booked",
      moveDate: "—",
      preferred: v.listingLabel ?? "—",
      agent: v.agent ?? "Unassigned",
      notes: "",
      activity: [{ icon: "calendar", text: `${v.kind === "viewing" ? "Viewing" : v.title} at ${v.listingLabel ?? "the property"} in REX's diary`, when: when.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }],
      receivedAt: v.startsAt,
      address: v.listingLabel ?? undefined,
      listingId: v.listingId != null ? Number(v.listingId) : undefined,
      contactId: id,
    });
  }
  if (fresh.length) await recordLeads(fresh).catch(() => 0);
}

/** The lead ids on the board for these contacts. */
export async function leadIdsByContact(contactIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!hasDb() || !contactIds.length) return out;
  const rows = await q<{ id: string; contact_id: string }>(`SELECT id, contact_id FROM os_leads WHERE contact_id = ANY($1)`, [contactIds]).catch(() => []);
  for (const r of rows) if (!out.has(r.contact_id) || !r.id.startsWith("contact-")) out.set(r.contact_id, r.id);
  return out;
}

/** Whose calendars count as ours - the lettings mailboxes. */
const OUR_DOMAIN = "thelettingexperts.co.uk";

/**
 * The nightly sweep: every event on the lettings calendars, back to `since`,
 * that is tied to a listing or a property, kept. Keyed on REX's event id,
 * so a re-read updates the row it wrote last night rather than adding one.
 * James, 7 Sep 2026: for the team moving over, history has to be there
 * before anyone opens the listing; once bookings are made in the OS the
 * sweep matters less.
 */
export async function sweepDiary(sinceDays = 730, budgetPages = 50): Promise<{ scanned: number; kept: number; pages: number; from: string; cursor: string | null; caughtUp: boolean }> {
  if (!rexConfigured()) return { scanned: 0, kept: 0, pages: 0, from: "", cursor: null, caughtUp: false };
  const calIds: string[] = [];
  for (let page = 0; page < 3; page++) {
    const res = await rexCall("Calendars", "search", { limit: 100, offset: page * 100 });
    if (!res.ok) break;
    const rows = rexRows(res.result) as { id?: string; owner_user?: { email_address?: string } }[];
    for (const c of rows) if ((c.owner_user?.email_address ?? "").toLowerCase().endsWith(`@${OUR_DOMAIN}`) && c.id) calIds.push(String(c.id));
    if (rows.length < 100) break;
  }

  /* Where the last run got to. REX's calendar answers about four seconds a
     page and two years is near three hundred pages, so each run takes a
     budget of pages from the cursor and the next run carries on. Once it
     reaches today it starts the next run a month back, so the recent diary
     is re-read every time and a booking changed in REX is picked up. */
  const CURSOR_KEY = "viewings-sweep:v1";
  const held = hasDb()
    ? await q<{ payload: { cursor?: string | null } }>(`SELECT payload FROM os_cache WHERE key = $1`, [CURSOR_KEY]).then((r) => r[0]?.payload ?? null).catch(() => null)
    : null;
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const from = held?.cursor && new Date(held.cursor) > since ? new Date(held.cursor) : since;
  const iso = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

  let scanned = 0;
  let kept = 0;
  let pages = 0;
  let last: string | null = null;
  let caughtUp = false;
  let batch: Viewing[] = [];
  for (let offset = 0; pages < budgetPages; offset += 100) {
    const res = await rexCall("CalendarEvents", "search", {
      limit: 100,
      offset,
      order_by: { starts_at: "asc" },
      criteria: [
        { name: "starts_at", type: ">=", value: iso(from) },
        ...(calIds.length ? [{ name: "calendar_id", type: "in", value: calIds }] : []),
      ],
    });
    if (!res.ok) break;
    pages++;
    const rows = rexRows(res.result) as RexEvent[];
    scanned += rows.length;
    for (const e of rows) {
      const v = toViewing(e);
      if (v && (v.listingId || v.propertyId)) batch.push(v);
      if (e.starts_at?.time) last = e.starts_at.time;
    }
    if (batch.length >= 200) { await recordViewings(batch); kept += batch.length; batch = []; }
    if (rows.length < 100) { caughtUp = true; break; }
  }
  if (batch.length) { await recordViewings(batch); kept += batch.length; }

  /* Next time: carry on from the last event read, or, caught up, a month back. */
  let cursor: string | null = last;
  if (caughtUp || (last && new Date(last) > new Date())) {
    const back = new Date();
    back.setDate(back.getDate() - 30);
    cursor = back.toISOString();
    caughtUp = true;
  }
  if (hasDb() && cursor) {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [CURSOR_KEY, JSON.stringify({ cursor, caughtUp, at: new Date().toISOString() })]
    ).catch(() => null);
  }
  return { scanned, kept, pages, from: from.toISOString(), cursor, caughtUp };
}
