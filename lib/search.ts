import "server-only";
import { hasDb, q } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { getComplianceBook } from "@/lib/compliance-cache";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { isOwnDeal, whoIsRexUser } from "@/lib/propoly-only-lets";
import { getApplications } from "@/lib/applications";
import type { Lead } from "@/lib/leads-sample";
import { peopleLike } from "@/lib/rex-people-store";
import { searchMatches, searchRank } from "@/lib/search-match";
import { currentLets } from "@/lib/current-lets";
import { EMPTY_PASSPORT, answered, type PassportData } from "@/lib/passport-shape";

/**
 * The one search, shared by the search bar (/api/search) and Steve (2 Oct
 * 2026), so what he can find and what the bar can find never drift apart.
 * Read from the caches the screens already fill, scoped to rexUserId (null is
 * the whole business - the caller decides who may have that).
 */

export interface Hit {
  kind: "property" | "lead" | "application" | "deal" | "compliance" | "person";
  title: string;
  sub: string;
  href: string;
}

/* Every word of the search, whole numbers, any order (6 Oct 2026) - see
   lib/search-match for why "room 2" stopped finding Room 20. */
const matches = searchMatches;

/** An id only matches when somebody has typed most of it - "07" is a phone
 *  prefix, not a request for every property whose REX id contains 07. */
const idMatch = (needle: string, id: string | null | undefined) => /^\d{5,}$/.test(needle.trim()) && Boolean(id && String(id).includes(needle.trim()));

async function cachedLeads(rexUserId: string | null): Promise<Lead[]> {
  if (!hasDb()) return [];
  const key = rexUserId ? `leads:v2:agent:${rexUserId}` : "leads:v2:all";
  const rows = await q<{ payload: { book?: { leads?: Lead[] } } }>(`SELECT payload FROM os_cache WHERE key = $1`, [key]).catch(() => []);
  return rows[0]?.payload?.book?.leads ?? [];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Diary viewings and tenant passports for one email address, scoped to rexUserId (null: the business). */
async function byEmail(
  email: string,
  rexUserId: string | null,
  listings: { id: string | number }[],
  homes: { listingId: string | number }[],
  leads: Lead[]
): Promise<Hit[]> {
  const listed = new Set(listings.map((l) => String(l.id)));
  const managedIds = new Set(homes.map((h) => String(h.listingId)));
  const mine = rexUserId ? [...listed, ...managedIds] : null;
  const where = (listingId: string | null) =>
    listingId ? (managedIds.has(listingId) && !listed.has(listingId) ? `/portfolio/${encodeURIComponent(listingId)}` : `/listings?open=${encodeURIComponent(listingId)}`) : null;
  const when = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  const out: Hit[] = [];

  const [viewings, booked, passports] = await Promise.all([
    q<{ id: string; listing_id: string | null; starts_at: Date; title: string; label: string | null; contacts: { name?: string; email?: string; leadId?: string | null }[] | null }>(
      `SELECT id, listing_id, starts_at, title, payload->>'listingLabel' AS label, contacts
         FROM os_viewings
        WHERE kind = 'viewing' AND contacts @> $1::jsonb AND ($2::text[] IS NULL OR listing_id = ANY($2::text[]))
        ORDER BY starts_at DESC LIMIT 3`,
      [JSON.stringify([{ email }]), mine]
    ).catch(() => []),
    q<{ id: string; starts_at: Date; where_at: string | null; lead_id: string | null; listing_id: string | null; name: string | null }>(
      `SELECT id, starts_at, where_at, lead_id, booking->>'listingId' AS listing_id, booking->>'applicantName' AS name
         FROM os_appointments
        WHERE kind = 'viewing' AND booking IS NOT NULL AND LOWER(contact_email) = $1
          AND ($2::text[] IS NULL OR booking->>'listingId' = ANY($2::text[]))
        ORDER BY starts_at DESC LIMIT 3`,
      [email, mine]
    ).catch(() => []),
    q<{ name: string; data: Partial<PassportData> | null; invited_at: Date | null; submitted_at: Date | null; updated_at: Date }>(
      `SELECT p.name, CASE WHEN p.submitted_at IS NULL THEN p.data END AS data, p.invited_at, p.submitted_at, p.updated_at
         FROM os_tenant_passports p
        WHERE lower(trim(p.email)) = $1 AND COALESCE(p.contact_id, '') <> 'demo'
          AND ($2::text IS NULL
               OR p.agent_id IN (SELECT id FROM os_users WHERE rex_user_id = $2)
               OR lower(trim(p.email)) IN (SELECT lower(email) FROM os_leads WHERE assignee_id = $2 AND email <> ''))
        ORDER BY (p.submitted_at IS NOT NULL) DESC, p.updated_at DESC LIMIT 1`,
      [email, rexUserId]
    ).catch(() => []),
  ]);

  for (const v of viewings) {
    const c = (Array.isArray(v.contacts) ? v.contacts : []).find((x) => (x.email ?? "").trim().toLowerCase() === email);
    const href = c?.leadId ? `/leads?open=${encodeURIComponent(c.leadId)}` : where(v.listing_id);
    if (!href) continue;
    const at = (v.label || v.title || "").replace(/^viewing[:\s-]+/i, "").trim() || "a property";
    out.push({ kind: "person", title: c?.name?.trim() || email, sub: `viewing · ${at} · ${when(v.starts_at)}`, href });
  }
  for (const b of booked) {
    const href = b.lead_id ? `/leads?open=${encodeURIComponent(b.lead_id)}` : where(b.listing_id);
    if (!href) continue;
    out.push({ kind: "person", title: b.name?.trim() || email, sub: `viewing booked in the OS · ${b.where_at?.trim() || "a property"} · ${when(b.starts_at)}`, href });
  }
  for (const p of passports) {
    /* Started is answers beyond the name and email the invite seeds - the passportStates rule. */
    const d = { ...EMPTY_PASSPORT, ...(p.data ?? {}) } as PassportData;
    const started = !p.submitted_at && answered(d).done > answered({ ...EMPTY_PASSPORT, legalName: d.legalName, email: d.email }).done;
    const state = p.submitted_at ? `completed ${when(p.submitted_at)}` : started ? `started, last changed ${when(p.updated_at)}` : p.invited_at ? `sent ${when(p.invited_at)}` : "made, never sent";
    const lead = leads.find((l) => (l.email ?? "").trim().toLowerCase() === email);
    out.push({ kind: "person", title: p.name?.trim() || email, sub: `tenant passport · ${state}`, href: lead ? `/leads?open=${encodeURIComponent(lead.id)}&passport=1` : "/leads?passports=done" });
  }
  return out;
}

export async function searchEverything(needle: string, rexUserId: string | null): Promise<Hit[]> {
  const [book, managed, leads, compliance, deals, applications, known] = await Promise.all([
    bookFor(rexUserId).catch(() => null),
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
    cachedLeads(rexUserId),
    getComplianceBook().catch(() => null),
    getAllPropolyDeals().catch(() => null),
    getApplications(200, rexUserId).catch(() => []),
    /* People we have already pulled out of REX. They cost nothing to include -
       it is our own table - and they are the difference between a name found
       in milliseconds and one that needed a button and three seconds of
       waiting (lib/rex-people-store, 16 Sep 2026). */
    peopleLike(needle).catch(() => []),
  ]);

  const hits: Hit[] = [];
  /* How sure each hit is, by position in `hits`: the exact home first. */
  const rank: number[] = [];
  const cap = (n: number) => hits.length < n;
  const push = (h: Hit, address?: string | null) => {
    hits.push(h);
    rank.push(address ? searchRank(needle, address) : 0);
  };

  for (const l of book?.listings ?? []) {
    if (!cap(40)) break;
    if (matches(needle, l.name, l.locality) || idMatch(needle, l.propertyId) || idMatch(needle, l.id)) {
      /* HMO rooms share a name; the listing ref keeps them apart. */
      push({ kind: "property", title: l.name, sub: `${l.locality} · listing ${l.id}`, href: `/listings?open=${encodeURIComponent(l.id)}` }, `${l.name}, ${l.locality}`);
    }
  }
  /* Managed homes (6 Sep): most certificates live on homes with no live
     listing, so the search has to open the Portfolio drawer for them. */
  const seenListing = new Set((book?.listings ?? []).map((l) => String(l.id)));
  /* Each home once, on its latest let: a room let five times was five hits,
     four of them somebody who moved out years ago (6 Oct 2026). */
  for (const m of currentLets(managed?.properties ?? [])) {
    if (!cap(50)) break;
    if (seenListing.has(String(m.listingId))) continue;
    if (matches(needle, m.name, m.locality, m.address) || idMatch(needle, m.propertyId) || idMatch(needle, m.listingId)) {
      push({ kind: "property", title: m.name, sub: `${m.locality} · managed`, href: `/portfolio/${encodeURIComponent(m.listingId)}` }, `${m.name}, ${m.locality}`);
    }
  }
  for (const l of leads) {
    if (!cap(60)) break;
    if (matches(needle, l.name, l.email, l.phone, l.address, l.preferred)) {
      push({ kind: "lead", title: l.name, sub: `${l.enquiry} lead · ${l.source}${l.area && l.area !== "—" ? ` · ${l.area}` : ""}`, href: `/leads?open=${encodeURIComponent(l.id)}` });
    }
  }
  for (const a of applications) {
    if (!cap(80)) break;
    const names = a.applicants.map((x) => x.name).join(", ");
    const emails = a.applicants.map((x) => x.email ?? "").join(" ");
    const phones = a.applicants.map((x) => x.phone ?? "").join(" ");
    if (matches(needle, a.property, names, emails, phones)) {
      push({ kind: "application", title: names || "Application", sub: `application · ${a.property}`, href: `/applications?open=${encodeURIComponent(a.id)}` }, `${a.property}, ${a.locality}`);
    }
  }
  /* An agent finds only their own lets, and opens them on their own board on
     Applications - never Kirstie's (10 Oct 2026). The whole business (the
     office, the owner) keeps the pre-tenancy board. */
  const me = rexUserId ? await whoIsRexUser(rexUserId).catch(() => null) : null;
  for (const d of deals ?? []) {
    if (!cap(100)) break;
    if (rexUserId && (!me || !isOwnDeal(d, me))) continue;
    const tenants = d.app.tenants.map((t) => t.name).join(", ");
    if (matches(needle, d.app.propertyName, tenants, ...d.app.tenants.map((t) => t.email ?? ""))) {
      push({ kind: "deal", title: d.app.propertyName, sub: `deal · ${d.statusKey.replace(/_/g, " ")}${tenants ? ` · ${tenants}` : ""}`, href: rexUserId ? `/applications?deal=${encodeURIComponent(d.app.id)}` : `/pre-tenancy?deal=${encodeURIComponent(d.app.id)}` });
    }
  }
  for (const p of compliance?.book.properties ?? []) {
    if (!cap(120)) break;
    if (matches(needle, p.name, p.locality) || idMatch(needle, p.id)) {
      push({ kind: "compliance", title: p.name, sub: `${p.locality} · certificates`, href: `/compliance?open=${encodeURIComponent(p.id)}` }, `${p.name}, ${p.locality}`);
    }
  }

  /* Last, because a person we merely remember is weaker than a lead, an
     application or a deal that lives here - but far better than nothing while
     REX is asked. Anything past a fortnight never reaches this list; anything
     older than three days says how old it is, so nobody rings a stale number
     believing it is current. */
  for (const p of known) {
    if (!cap(130)) break;
    const reach = [p.email, p.phone].filter(Boolean).join(" · ") || "no email or phone on the record";
    push({
      kind: "person",
      title: p.name,
      sub: `person · ${reach}${p.age ? ` · read ${p.age}` : ""}`,
      href: `/leads?person=${encodeURIComponent(p.id)}`,
    });
  }

  /* A whole email address also finds the person in the diary and on a tenant
     passport (James, 25 Nov 2026, Steve's big update): somebody who booked a
     viewing or was sent a passport may have no lead or application to find.
     Exact address only, and scoped as the rest: an agent sees viewings on
     their own listings and homes, and the passports passportStates gives
     them (lib/passport-states). A passport hit says where it has got to,
     never what is in it. */
  if (EMAIL.test(needle.trim()) && hasDb() && cap(140)) {
    for (const h of await byEmail(needle.trim().toLowerCase(), rexUserId, book?.listings ?? [], managed?.properties ?? [], leads).catch(() => [])) {
      if (!cap(140)) break;
      push(h);
    }
  }

  /* The exact home first (the same room at the same house), then whole-word
     matches, then the rest - each group in the order it was found. */
  return hits
    .map((h, i) => ({ h, i, r: rank[i] }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.h)
    .slice(0, 40);
}
