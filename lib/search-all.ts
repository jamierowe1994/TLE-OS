import "server-only";
import { hasDb, q } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { landlordsOf } from "@/lib/managed-book";
import { currentLets } from "@/lib/current-lets";
import { getComplianceBook } from "@/lib/compliance-cache";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { isOwnDeal, whoIsRexUser } from "@/lib/propoly-only-lets";
import { getApplications } from "@/lib/applications";
import { peopleLike } from "@/lib/rex-people-store";
import { leadSide, type Lead } from "@/lib/leads-sample";
import { searchLikes, searchMatches, searchRank, searchTokens } from "@/lib/search-match";
import { sameHome } from "@/lib/address-parse";

/**
 * Search for anything (10 Oct 2026) - the pop-up behind Search in the sidebar.
 *
 * James: "a whole host search where, if they need to search anything in that
 * nav bar, they can pretty much find anything", grouped as Tenant, Landlord,
 * Back office, Portfolio and Works orders (works orders last), with the
 * photo of the home where there is one.
 *
 *   Tenant        tenant enquiries, hand-typed tenants, applicants, the
 *                 tenants living in our managed homes, people read from REX,
 *                 and notes on a tenant's file
 *   Landlord      landlord enquiries, hand-typed landlords, landlords of our
 *                 managed homes, market appraisals, notes on a landlord's file
 *   Back office   lets in progress, certificates, Section 13/8 notices,
 *                 inspections, invoices
 *   Portfolio     listings, managed homes, notes on a listing
 *   Works orders  every job: ref, title, what was reported, the home, who
 *
 * SCOPE. rexUserId null is the whole business; otherwise an agent searches
 * their own book, as the old bar did. The OS's own tables are narrowed to the
 * homes in that book (and their own appraisals and contacts); invoices are
 * the office's, so an agent never sees them.
 *
 * Read from the caches the screens already fill and from our own tables, so a
 * keystroke never walks REX. The old one-list search (lib/search) stays for
 * Steve and the page bars.
 */

export type Group = "tenant" | "landlord" | "backoffice" | "portfolio" | "works";
export const GROUP_ORDER: Group[] = ["tenant", "landlord", "backoffice", "portfolio", "works"];

export interface FoundItem {
  id: string;
  group: Group;
  /** What it is, small: "Tenant enquiry", "Current tenant", "Note". */
  label: string;
  title: string;
  sub: string;
  href: string;
  image?: string | null;
  /** The words around the match, when it was found in a note or a description. */
  snippet?: string | null;
  /** Sort key inside a group: higher first. */
  score: number;
  /** The address it was found by, so one home's rows can be told apart. */
  place?: string | null;
  /** The same home's other records, as small links on its row (12 Oct 2026). */
  also?: Array<{ label: string; href: string }>;
}

const PER_GROUP = 8;

/** The sentence around the first word that matched, for a note or a job description. */
function snippetOf(text: string, needle: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const words = searchTokens(needle);
  const low = t.toLowerCase();
  let at = -1;
  for (const w of words) {
    at = low.indexOf(w);
    if (at >= 0) break;
  }
  if (at < 0 || t.length <= 110) return t.slice(0, 110) + (t.length > 110 ? "…" : "");
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${t.slice(start, start + 110).trim()}${start + 110 < t.length ? "…" : ""}`;
}

async function cachedLeads(rexUserId: string | null): Promise<Lead[]> {
  if (!hasDb()) return [];
  const key = rexUserId ? `leads:v2:agent:${rexUserId}` : "leads:v2:all";
  const rows = await q<{ payload: { book?: { leads?: Lead[] } } }>(`SELECT payload FROM os_cache WHERE key = $1`, [key]).catch(() => []);
  return rows[0]?.payload?.book?.leads ?? [];
}

export async function searchAll(
  needle: string,
  scope: { rexUserId: string | null; me: { name: string; email: string } }
): Promise<{ groups: { group: Group; items: FoundItem[]; more: number }[] }> {
  const { rexUserId, me } = scope;
  const whole = rexUserId === null;
  const likes = searchLikes(needle);
  if (!likes.length) return { groups: [] };
  const db = hasDb();
  const sql = <R extends Record<string, unknown>>(text: string, params: unknown[]) => (db ? q<R>(text, params).catch(() => [] as R[]) : Promise.resolve([] as R[]));

  const [book, managed, leads, compliance, deals, applications, known] = await Promise.all([
    bookFor(rexUserId).catch(() => null),
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
    cachedLeads(rexUserId),
    getComplianceBook().catch(() => null),
    getAllPropolyDeals().catch(() => null),
    getApplications(200, rexUserId).catch(() => []),
    peopleLike(needle).catch(() => []),
  ]);

  const listings = book?.listings ?? [];
  const homes = currentLets(managed?.properties ?? []);
  /* What this person may see of the OS's own tables: the homes in their book. */
  const myListingIds = new Set<string>([...listings.map((l) => String(l.id)), ...homes.map((h) => String(h.listingId))]);
  const myPropertyIds = new Set<string>(
    [...listings.map((l) => (l as { propertyId?: string | null }).propertyId), ...homes.map((h) => h.propertyId)].filter((x): x is string => Boolean(x))
  );
  const imageByListing = new Map<string, string | null>();
  for (const l of listings) imageByListing.set(String(l.id), (l as { image?: string | null }).image ?? null);
  for (const h of homes) if (!imageByListing.get(String(h.listingId))) imageByListing.set(String(h.listingId), h.image ?? null);
  const imageByProperty = new Map<string, string | null>();
  for (const h of homes) if (h.propertyId && h.image) imageByProperty.set(h.propertyId, h.image);
  const leadById = new Map(leads.map((l) => [l.id, l]));

  const out: FoundItem[] = [];
  const add = (it: Omit<FoundItem, "score"> & { score?: number }, address?: string | null) =>
    out.push({ ...it, place: address ?? null, score: (it.score ?? 0) + (address ? searchRank(needle, address) : 0) });

  /* ── Tenant and landlord enquiries ───────────────────────────────────── */
  for (const l of leads) {
    if (!searchMatches(needle, l.name, l.email, l.phone, l.address, l.preferred)) continue;
    const side = leadSide(l);
    add({
      id: `lead:${l.id}`,
      group: side,
      label: side === "tenant" ? "Tenant enquiry" : "Landlord enquiry",
      title: l.name,
      sub: [l.preferred || l.area, l.source].filter((x) => x && x !== "—").join(" · "),
      href: `/leads?open=${encodeURIComponent(l.id)}`,
      score: 3,
    });
  }

  const jobs: Promise<void>[] = [];

  /* Hand-typed contacts (os_contacts): an agent's own, or everybody's. */
  jobs.push(
    sql<{ id: string; kind: string; name: string; email: string; mobile: string; address: string; notes: string }>(
      `SELECT id, kind, name, email, mobile, address, notes FROM os_contacts
        WHERE concat_ws(' ', name, email, mobile, address, postcode, notes) ILIKE ALL($1::text[])
          AND ($2::boolean OR lower(created_by) = lower($3))
          /* Somebody else's test file is never found (13 Oct 2026). */
          AND (NOT is_test OR lower(created_by) = lower($3))
        ORDER BY created_at DESC LIMIT 20`,
      [likes, whole, me.email]
    ).then((rows) => {
      for (const r of rows) {
        const id = `os-${r.id}`;
        if (leadById.has(id)) continue;
        const side = r.kind === "landlord" ? "landlord" : "tenant";
        const inNotes = !searchMatches(needle, r.name, r.email, r.mobile, r.address) && r.notes;
        add({ id: `lead:${id}`, group: side, label: side === "tenant" ? "Tenant" : "Landlord", title: r.name || r.email, sub: r.address || r.email || r.mobile, href: `/leads?open=${encodeURIComponent(id)}`, snippet: inNotes ? snippetOf(r.notes, needle) : null, score: 2 });
      }
    })
  );

  /* Notes on a tenant's or landlord's file (the lead log). */
  jobs.push(
    sql<{ id: string; lead_id: string; body: string; by_name: string; c_name: string | null; c_kind: string | null; c_by: string | null }>(
      `SELECT t.id, t.lead_id, t.body, t.by_name, c.name AS c_name, c.kind AS c_kind, c.created_by AS c_by
         FROM os_lead_touches t LEFT JOIN os_contacts c ON 'os-' || c.id = t.lead_id
        WHERE t.kind = 'note' AND t.body ILIKE ALL($1::text[]) ORDER BY t.at DESC LIMIT 40`,
      [likes]
    ).then((rows) => {
      for (const r of rows) {
        const lead = leadById.get(r.lead_id);
        /* Only notes on a lead this person can open: one on their board, or a
           hand-typed contact that is theirs (or anybody's, for the office). */
        const ownContact = r.c_name != null && (whole || (r.c_by ?? "").toLowerCase() === me.email.toLowerCase());
        if (!lead && !ownContact) continue;
        const side = lead ? leadSide(lead) : r.c_kind === "landlord" ? "landlord" : "tenant";
        add({ id: `note:${r.id}`, group: side, label: "Note", title: lead?.name ?? r.c_name ?? "A note on a file", sub: `Note by ${r.by_name || "somebody"}`, href: `/leads?open=${encodeURIComponent(r.lead_id)}`, snippet: snippetOf(r.body, needle), score: 1 });
      }
    })
  );

  /* ── Managed homes: the home, its tenants, its landlord ──────────────── */
  for (const h of homes) {
    const img = h.image ?? null;
    if (searchMatches(needle, h.name, h.locality, h.address) || (/^\d{5,}$/.test(needle.trim()) && (String(h.listingId).includes(needle.trim()) || String(h.propertyId ?? "").includes(needle.trim())))) {
      add({ id: `home:${h.listingId}`, group: "portfolio", label: "Managed home", title: h.name, sub: [h.locality, h.service].filter(Boolean).join(" · "), href: `/portfolio/${encodeURIComponent(h.listingId)}`, image: img, score: 2 }, `${h.name}, ${h.locality}`);
    }
    for (const t of h.tenants) {
      if (searchMatches(needle, t.name, t.email, t.phone)) {
        add({ id: `tenant:${h.listingId}:${t.contactId}`, group: "tenant", label: "Current tenant", title: t.name, sub: `${h.name}, ${h.locality}`, href: `/portfolio/${encodeURIComponent(h.listingId)}`, image: img, score: 3 });
      }
    }
  }
  for (const l of landlordsOf(managed?.properties ?? [])) {
    if (!searchMatches(needle, l.name, l.email, l.phone)) continue;
    const first = l.listingIds[0];
    add({
      id: `landlord:${l.contactId}`,
      group: "landlord",
      label: "Landlord",
      title: l.name,
      sub: `${l.listingIds.length} ${l.listingIds.length === 1 ? "home" : "homes"} with us`,
      href: first ? `/portfolio/${encodeURIComponent(first)}` : "/portfolio",
      image: first ? imageByListing.get(String(first)) ?? null : null,
      score: 3,
    });
  }

  /* ── Listings ────────────────────────────────────────────────────────── */
  const homeIds = new Set(homes.map((h) => String(h.listingId)));
  for (const l of listings) {
    if (homeIds.has(String(l.id))) continue;
    const pid = (l as { propertyId?: string | null }).propertyId ?? null;
    if (searchMatches(needle, l.name, l.locality) || (/^\d{5,}$/.test(needle.trim()) && (String(l.id).includes(needle.trim()) || String(pid ?? "").includes(needle.trim())))) {
      add({ id: `listing:${l.id}`, group: "portfolio", label: "Listing", title: l.name, sub: `${l.locality} · listing ${l.id}`, href: `/listings?open=${encodeURIComponent(l.id)}`, image: imageByListing.get(String(l.id)) ?? null, score: 2 }, `${l.name}, ${l.locality}`);
    }
  }

  /* Notes on a listing (os_notes). */
  jobs.push(
    sql<{ id: string; record_id: string; body: string; author_name: string }>(
      `SELECT id, record_id, body, author_name FROM os_notes WHERE record_type = 'listing' AND body ILIKE ALL($1::text[]) ORDER BY created_at DESC LIMIT 30`,
      [likes]
    ).then((rows) => {
      for (const r of rows) {
        if (!whole && !myListingIds.has(r.record_id)) continue;
        const l = listings.find((x) => String(x.id) === r.record_id);
        add({ id: `lnote:${r.id}`, group: "portfolio", label: "Note", title: l?.name ?? `Listing ${r.record_id}`, sub: `Note by ${r.author_name || "somebody"}`, href: `/listings?open=${encodeURIComponent(r.record_id)}`, image: imageByListing.get(r.record_id) ?? null, snippet: snippetOf(r.body, needle), score: 1 });
      }
    })
  );

  /* ── Applications (tenant side) ─────────────────────────────────────── */
  for (const a of applications) {
    const names = a.applicants.map((x) => x.name).join(", ");
    if (!searchMatches(needle, a.property, names, ...a.applicants.map((x) => x.email ?? ""), ...a.applicants.map((x) => x.phone ?? ""))) continue;
    add({ id: `app:${a.id}`, group: "tenant", label: "Application", title: names || "Application", sub: a.property, href: `/applications?open=${encodeURIComponent(a.id)}`, score: 2 }, `${a.property}, ${a.locality}`);
  }

  /* People read from REX: last among tenants - remembered, not ours. */
  for (const p of known.slice(0, 10)) {
    add({ id: `person:${p.id}`, group: "tenant", label: "Contact", title: p.name, sub: [p.email, p.phone].filter(Boolean).join(" · ") || "no email or phone on the record", href: `/leads?person=${encodeURIComponent(p.id)}`, score: 0 });
  }

  /* Market appraisals (landlord side): the office's, or the agent's own. */
  jobs.push(
    sql<{ id: string; landlord: string; address: string; postcode: string; stage: string }>(
      `SELECT id, landlord, address, postcode, stage FROM os_market_appraisals
        WHERE concat_ws(' ', landlord, address, postcode) ILIKE ALL($1::text[])
          AND ($2::boolean OR lower(coalesce(agent, '')) IN (lower($3), lower($4)))
        ORDER BY updated_at DESC LIMIT 20`,
      [likes, whole, me.name, me.email]
    ).then((rows) => {
      for (const r of rows) {
        add({ id: `ma:${r.id}`, group: "landlord", label: "Market appraisal", title: r.landlord, sub: [r.address, r.stage.replace(/_/g, " ")].filter(Boolean).join(" · "), href: `/market-appraisals/${encodeURIComponent(r.id)}`, score: 2 }, r.address);
      }
    })
  );

  /* ── Back office ────────────────────────────────────────────────────── */
  const meRex = rexUserId ? await whoIsRexUser(rexUserId).catch(() => null) : null;
  for (const d of deals ?? []) {
    if (rexUserId && (!meRex || !isOwnDeal(d, meRex))) continue;
    const tenants = d.app.tenants.map((t) => t.name).join(", ");
    if (!searchMatches(needle, d.app.propertyName, tenants, ...d.app.tenants.map((t) => t.email ?? ""))) continue;
    add({
      id: `deal:${d.app.id}`,
      group: "backoffice",
      label: "Let in progress",
      title: d.app.propertyName,
      sub: [d.statusKey.replace(/_/g, " "), tenants].filter(Boolean).join(" · "),
      href: rexUserId ? `/applications?deal=${encodeURIComponent(d.app.id)}` : `/pre-tenancy?deal=${encodeURIComponent(d.app.id)}`,
      score: 2,
    }, [d.app.propertyName, d.app.locality].filter(Boolean).join(", "));
  }
  for (const p of compliance?.book.properties ?? []) {
    if (!whole && !myPropertyIds.has(String(p.id))) continue;
    if (!searchMatches(needle, p.name, p.locality)) continue;
    add({ id: `cert:${p.id}`, group: "backoffice", label: "Certificates", title: p.name, sub: p.locality, href: `/compliance?open=${encodeURIComponent(p.id)}`, image: imageByProperty.get(String(p.id)) ?? null, score: 1 }, `${p.name}, ${p.locality}`);
  }
  jobs.push(
    sql<{ id: string; kind: string; status: string; listing_id: string; property_label: string; agent_email: string; answers: unknown }>(
      `SELECT id, kind, status, listing_id, property_label, agent_email, answers FROM os_section_notices
        WHERE is_test = FALSE AND concat_ws(' ', property_label, answers::text) ILIKE ALL($1::text[])
        ORDER BY updated_at DESC LIMIT 20`,
      [likes]
    ).then((rows) => {
      for (const r of rows) {
        if (!whole && !myListingIds.has(r.listing_id) && r.agent_email.toLowerCase() !== me.email.toLowerCase()) continue;
        add({ id: `notice:${r.id}`, group: "backoffice", label: r.kind.toLowerCase().includes("8") ? "Section 8 notice" : "Section 13 notice", title: r.property_label, sub: r.status.replace(/_/g, " "), href: `/portfolio?open=${encodeURIComponent(r.listing_id)}&notice=${encodeURIComponent(r.id)}`, image: imageByListing.get(r.listing_id) ?? null, score: 1 });
      }
    })
  );
  jobs.push(
    sql<{ id: string; kind: string; status: string; listing_id: string | null; property_id: string | null; property_name: string; locality: string; tenant: string; due_at: string | Date | null }>(
      `SELECT id, kind, status, listing_id, property_id, property_name, locality, tenant, due_at FROM os_inspections
        WHERE concat_ws(' ', property_name, locality, landlord, landlord_email, tenant, tenant_email, tenant_phone) ILIKE ALL($1::text[])
        ORDER BY due_at DESC NULLS LAST LIMIT 20`,
      [likes]
    ).then((rows) => {
      for (const r of rows) {
        if (!whole && !(r.listing_id && myListingIds.has(r.listing_id)) && !(r.property_id && myPropertyIds.has(r.property_id))) continue;
        const due = r.due_at ? new Date(r.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
        add({ id: `insp:${r.id}`, group: "backoffice", label: "Inspection", title: r.property_name, sub: [r.kind, r.status, due && `due ${due}`].filter(Boolean).join(" · "), href: `/inspections?open=${encodeURIComponent(r.id)}`, image: (r.listing_id && imageByListing.get(r.listing_id)) || null, score: 1 });
      }
    })
  );
  if (whole) {
    jobs.push(
      sql<{ id: string; number: string | null; status: string; property: string; to_name: string; reference: string; notes: string }>(
        `SELECT id, number, status, property, to_name, reference, notes FROM os_invoices
          WHERE concat_ws(' ', number, property, to_name, to_email, reference, notes) ILIKE ALL($1::text[])
          ORDER BY created_at DESC LIMIT 20`,
        [likes]
      ).then((rows) => {
        for (const r of rows) {
          /* Found in the reference or the notes: say where. */
          const why = searchMatches(needle, r.number, r.to_name, r.property) ? null : snippetOf([r.reference, r.notes].filter(Boolean).join(" - "), needle);
          add({ id: `inv:${r.id}`, group: "backoffice", label: "Invoice", title: r.number ? `Invoice ${r.number}` : "Draft invoice", sub: [r.to_name, r.property, r.status].filter(Boolean).join(" · "), href: `/maintenance/invoices/${encodeURIComponent(r.id)}`, snippet: why, score: 1 });
        }
      })
    );
  }

  /* ── Works orders ───────────────────────────────────────────────────── */
  jobs.push(
    sql<{ id: string; ref: number; kind: string; status: string; property_id: string | null; property_name: string; locality: string; tenant: string; landlord: string; title: string; description: string; contractor_name: string; category: string }>(
      `SELECT id, ref, kind, status, property_id, property_name, locality, tenant, landlord, title, description, contractor_name, category
         FROM os_works_orders
        WHERE concat_ws(' ', ref::text, title, description, category, property_name, locality, tenant, landlord, contractor_name, reported_by) ILIKE ALL($1::text[])
        ORDER BY reported_at DESC LIMIT 30`,
      [likes]
    ).then((rows) => {
      for (const r of rows) {
        if (!whole && !(r.property_id && (myPropertyIds.has(r.property_id) || myListingIds.has(r.property_id)))) continue;
        const inText = !searchMatches(needle, String(r.ref), r.title, r.property_name, r.locality, r.tenant, r.landlord, r.contractor_name);
        add({
          id: `wo:${r.id}`,
          group: "works",
          label: `Works order ${r.ref}`,
          title: r.title || r.category || "A job",
          sub: [r.property_name, r.status.replace(/_/g, " "), r.contractor_name].filter(Boolean).join(" · "),
          href: `/maintenance?open=${encodeURIComponent(r.id)}`,
          image: (r.property_id && (imageByProperty.get(r.property_id) || imageByListing.get(r.property_id))) || null,
          snippet: inText && r.description ? snippetOf(r.description, needle) : null,
          score: 1,
        }, `${r.property_name}, ${r.locality}`);
      }
    })
  );

  await Promise.all(jobs);

  /* ONE HOME, ONE ROW (James, 12 Oct 2026: "44 south" showed three - the
     Propoly deal as "3f1, 44 South Bridge", the certificates and the home as
     "South Bridge 44 (3f1)"). The home's page is the row; its certificates
     and a let in progress become small links on it. */
  for (const home of out.filter((x) => x.id.startsWith("home:") && x.place)) {
    const same = out.filter((x) => (x.id.startsWith("cert:") || x.id.startsWith("deal:")) && x.place && sameHome(home.place!, x.place));
    if (!same.length) continue;
    home.also = [...(home.also ?? []), ...same.map((x) => ({ label: x.id.startsWith("cert:") ? "Certificates" : `Let in progress · ${x.sub.split(" · ")[0]}`, href: x.href }))];
    for (const x of same) out.splice(out.indexOf(x), 1);
  }

  /* One row per thing: a hand-typed lead the cache also holds shows once. */
  const seen = new Set<string>();
  const groups = GROUP_ORDER.map((group) => {
    const all = out
      .filter((x) => x.group === group)
      .map((x, i) => ({ x, i }))
      .sort((a, b) => b.x.score - a.x.score || a.i - b.i)
      .map((y) => y.x)
      .filter((x) => {
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      });
    return { group, items: all.slice(0, PER_GROUP), more: Math.max(0, all.length - PER_GROUP) };
  }).filter((g) => g.items.length);
  return { groups };
}
