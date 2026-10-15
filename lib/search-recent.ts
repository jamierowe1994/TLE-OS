import "server-only";
import { hasDb, q } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { currentLets } from "@/lib/current-lets";
import { getComplianceBook } from "@/lib/compliance-cache";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { isOwnDeal, whoIsRexUser } from "@/lib/propoly-only-lets";
import { getApplications } from "@/lib/applications";
import { testApplicationsFor, testListingsFor } from "@/lib/test-overlay";
import {
  appRow,
  appraisalRow,
  cachedLeads,
  certRow,
  contactRow,
  dealRow,
  homeRow,
  inspectionRow,
  invoiceRow,
  leadRow,
  listingRow,
  worksRow,
  type FoundItem,
} from "@/lib/search-all";

/**
 * Recent (James, 15 Oct 2026): open Search before typing and the files you
 * were on last are there, newest first - "the files I've been on most
 * recently".
 *
 * A VISIT is a file opening on screen (lib/recent-visits, client side): a
 * lead's drawer, a Portfolio home, a listing, a let, a market appraisal, an
 * invoice, a works order, an inspection, a home's certificates or a let in
 * progress on the pre-tenancy board. The ref is the same id search gives the
 * row ("home:<listing id>"), so one file is one ref.
 *
 * KEPT in os_recent_files, one row per person per file: opening it again moves
 * visited_at, never adds a second row. Forty kept per person, twelve shown.
 * Server side, so it follows the person from the laptop to the phone.
 *
 * SHOWN only if the person can open it NOW. Nothing is shown from what was
 * written down at the visit: every ref is looked up again in what this
 * person's search would look through today (lib/search-all's scope - their
 * book, their leads, the office's invoices only for the office), and a file
 * that has left their book, been deleted or was never theirs drops off.
 * A tester's own test listings and lets count too, as on their boards; never
 * anybody else's.
 */

export const RECENT_KEEP = 40;
export const RECENT_SHOW = 12;

const KINDS = ["lead", "home", "listing", "app", "deal", "ma", "cert", "insp", "inv", "wo"] as const;
type Kind = (typeof KINDS)[number];

export function parseRef(ref: string): { kind: Kind; id: string } | null {
  const at = ref.indexOf(":");
  if (at < 1) return null;
  const kind = ref.slice(0, at) as Kind;
  const id = ref.slice(at + 1).trim();
  if (!KINDS.includes(kind) || !id || id.length > 200 || /\s/.test(id)) return null;
  return { kind, id };
}

/** A file opened: to the top of this person's list, and the list kept short. */
export async function noteRecent(userId: string, ref: string): Promise<void> {
  if (!hasDb() || !parseRef(ref)) return;
  await q(
    `INSERT INTO os_recent_files (user_id, ref, visited_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, ref) DO UPDATE SET visited_at = NOW()`,
    [userId, ref]
  );
  await q(
    `DELETE FROM os_recent_files WHERE user_id = $1 AND ref NOT IN (
       SELECT ref FROM os_recent_files WHERE user_id = $1 ORDER BY visited_at DESC LIMIT $2)`,
    [userId, RECENT_KEEP]
  );
}

export async function recentFor(
  userId: string,
  scope: { rexUserId: string | null; me: { name: string; email: string }; tester: string | null }
): Promise<FoundItem[]> {
  if (!hasDb()) return [];
  const { rexUserId, me } = scope;
  const whole = rexUserId === null;
  const rows = await q<{ ref: string }>(`SELECT ref FROM os_recent_files WHERE user_id = $1 ORDER BY visited_at DESC LIMIT $2`, [userId, RECENT_KEEP]);
  const refs = rows.map((r) => parseRef(r.ref)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!refs.length) return [];

  const ids = (k: Kind) => refs.filter((r) => r.kind === k).map((r) => r.id);
  const has = (...k: Kind[]) => refs.some((r) => k.includes(r.kind));
  const sql = <R extends Record<string, unknown>>(text: string, params: unknown[]) => q<R>(text, params).catch(() => [] as R[]);
  /* The book is needed to say what an agent may see, and for the photos. */
  const needBook = has("home", "listing", "cert", "insp", "wo") || !whole;

  const [book, managed, leads, compliance, deals, applications, testListings, testApps, contacts, appraisals, inspections, invoices, works, meRex] = await Promise.all([
    needBook ? bookFor(rexUserId).catch(() => null) : null,
    needBook ? managedBookFor(rexUserId).then((m) => m.book).catch(() => null) : null,
    has("lead") ? cachedLeads(rexUserId) : [],
    has("cert") ? getComplianceBook().catch(() => null) : null,
    has("deal", "app") ? getAllPropolyDeals().catch(() => null) : null,
    has("app") ? getApplications(200, rexUserId).catch(() => []) : [],
    has("listing") ? testListingsFor(scope.tester).catch(() => []) : [],
    has("app") ? testApplicationsFor(scope.tester).catch(() => []) : [],
    ids("lead").some((id) => id.startsWith("os-"))
      ? sql<{ id: string; kind: string; name: string; email: string; mobile: string; address: string }>(
          `SELECT id, kind, name, email, mobile, address FROM os_contacts
            WHERE 'os-' || id = ANY($1::text[])
              AND ($2::boolean OR lower(created_by) = lower($3))
              AND (NOT is_test OR lower(created_by) = lower($3))`,
          [ids("lead"), whole, me.email]
        )
      : [],
    has("ma")
      ? sql<{ id: string; landlord: string; address: string; stage: string }>(
          `SELECT id, landlord, address, stage FROM os_market_appraisals
            WHERE id = ANY($1::text[]) AND ($2::boolean OR lower(coalesce(agent, '')) IN (lower($3), lower($4)))`,
          [ids("ma"), whole, me.name, me.email]
        )
      : [],
    has("insp")
      ? sql<{ id: string; kind: string; status: string; listing_id: string | null; property_id: string | null; property_name: string; due_at: string | Date | null }>(
          `SELECT id, kind, status, listing_id, property_id, property_name, due_at FROM os_inspections WHERE id = ANY($1::text[])`,
          [ids("insp")]
        )
      : [],
    /* Invoices are the office's: an agent never sees one. */
    has("inv") && whole
      ? sql<{ id: string; number: string | null; status: string; property: string; to_name: string }>(
          `SELECT id, number, status, property, to_name FROM os_invoices WHERE id = ANY($1::text[])`,
          [ids("inv")]
        )
      : [],
    has("wo")
      ? sql<{ id: string; ref: number; status: string; property_id: string | null; property_name: string; title: string; contractor_name: string; category: string }>(
          `SELECT id, ref, status, property_id, property_name, title, contractor_name, category FROM os_works_orders WHERE id = ANY($1::text[])`,
          [ids("wo")]
        )
      : [],
    rexUserId && has("deal", "app") ? whoIsRexUser(rexUserId).catch(() => null) : null,
  ]);

  const listings = book?.listings ?? [];
  const properties = managed?.properties ?? [];
  const homes = currentLets(properties);
  const myListingIds = new Set<string>([...listings.map((l) => String(l.id)), ...properties.map((h) => String(h.listingId))]);
  const myPropertyIds = new Set<string>(
    [...listings.map((l) => (l as { propertyId?: string | null }).propertyId), ...properties.map((h) => h.propertyId)].filter((x): x is string => Boolean(x))
  );
  const imageByListing = new Map<string, string | null>();
  for (const l of listings) imageByListing.set(String(l.id), (l as { image?: string | null }).image ?? null);
  for (const h of properties) if (!imageByListing.get(String(h.listingId))) imageByListing.set(String(h.listingId), h.image ?? null);
  const imageByProperty = new Map<string, string | null>();
  for (const h of homes) if (h.propertyId && h.image) imageByProperty.set(h.propertyId, h.image);

  const ownDeal = (d: NonNullable<typeof deals>[number]) => whole || Boolean(meRex && isOwnDeal(d, meRex));
  const inBook = (listingId: string | null, propertyId: string | null) =>
    whole || Boolean((listingId && myListingIds.has(listingId)) || (propertyId && (myPropertyIds.has(propertyId) || myListingIds.has(propertyId))));

  const one = ({ kind, id }: { kind: Kind; id: string }): Omit<FoundItem, "score"> | null => {
    switch (kind) {
      case "lead": {
        const l = leads.find((x) => x.id === id);
        if (l) return leadRow(l);
        const c = contacts.find((x) => `os-${x.id}` === id);
        return c ? contactRow(c) : null;
      }
      case "home": {
        const h = homes.find((x) => String(x.listingId) === id) ?? properties.find((x) => String(x.listingId) === id);
        return h ? homeRow(h) : null;
      }
      case "listing": {
        const l = listings.find((x) => String(x.id) === id) ?? testListings.find((x) => String(x.id) === id) ?? properties.find((x) => String(x.listingId) === id);
        if (!l) return null;
        const row = "listingId" in l ? { id: l.listingId, name: l.name, locality: l.locality } : l;
        return listingRow(row, imageByListing.get(id) ?? null);
      }
      case "app": {
        /* A let's page takes an application's id, or a Propoly deal's for a
           let only Propoly knows about; opened again on the same page. */
        const a = applications.find((x) => String(x.id) === id) ?? testApps.find((x) => String(x.id) === id);
        if (a) return appRow(a);
        const d = (deals ?? []).find((x) => x.app.id === id);
        return d && ownDeal(d) ? { ...dealRow(d, rexUserId), id: `app:${id}`, href: `/applications/${encodeURIComponent(id)}` } : null;
      }
      case "deal": {
        const d = (deals ?? []).find((x) => x.app.id === id);
        return d && ownDeal(d) ? dealRow(d, rexUserId) : null;
      }
      case "ma": {
        const r = appraisals.find((x) => x.id === id);
        return r ? appraisalRow(r) : null;
      }
      case "cert": {
        const p = compliance?.book.properties.find((x) => String(x.id) === id);
        return p && (whole || myPropertyIds.has(id)) ? certRow(p, imageByProperty.get(id) ?? null) : null;
      }
      case "insp": {
        const r = inspections.find((x) => x.id === id);
        return r && inBook(r.listing_id, r.property_id) ? inspectionRow(r, (r.listing_id && imageByListing.get(r.listing_id)) || null) : null;
      }
      case "inv": {
        const r = invoices.find((x) => x.id === id);
        return r ? invoiceRow(r) : null;
      }
      case "wo": {
        const r = works.find((x) => x.id === id);
        return r && inBook(null, r.property_id)
          ? worksRow(r, (r.property_id && (imageByProperty.get(r.property_id) || imageByListing.get(r.property_id))) || null)
          : null;
      }
    }
  };

  const out: FoundItem[] = [];
  for (const r of refs) {
    const it = one(r);
    if (it) out.push({ ...it, score: 0 });
    if (out.length >= RECENT_SHOW) break;
  }
  return out;
}
