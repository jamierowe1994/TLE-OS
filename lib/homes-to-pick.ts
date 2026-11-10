import "server-only";
import { bookFor } from "@/lib/listings-cache";
import { managedBookFor } from "@/lib/managed-book-cache";
import { getComplianceBook } from "@/lib/compliance-cache";
import { currentLets } from "@/lib/current-lets";

/**
 * EVERY HOME THIS PERSON MAY ACT ON, for any screen that asks "which home?".
 *
 * Lianna Denholm, 6 and 10 Nov 2026 (ticket cbb2e646, then by email: "TLE
 * wont allow me to add an invoice for a listed property"). A home of hers had
 * a tenant moving in and an inventory to invoice, and no invoice screen
 * could find it. Each picker read its own list:
 *
 *   Contractors > Log an invoice, Raise a repair   the compliance book (the
 *                                                  office only) and Portfolio
 *   Maintenance > Invoices > From a property       the compliance book only,
 *                                                  so an agent got nothing
 *   Tools > Invoicing > Generate an Invoice        Portfolio only
 *
 * Portfolio is REX's LEASED lettings. A home still on the market, or let
 * agreed and waiting on its move-in, is a CURRENT listing, so for an agent -
 * who is refused the compliance book - it was on no list at all. The 7 Nov
 * fix added Portfolio to the search and guessed the home "has just been
 * let"; REX still had it as current on 9 Nov, the day the tenant moved in.
 *
 * So one list, read here once, scoped the way Listings and Portfolio are:
 *
 *   1. the person's listings        on the market, let agreed, drafts
 *   2. the person's managed homes   lets, REX PM homes, homes taken on
 *   3. the compliance book          only for those allowed it, and it is
 *                                   the only one that carries certificates
 *
 * A home is one row however many lists hold it, keyed by its REX property
 * where it has one. The global search (lib/search-all) already reads the
 * same three; this is the same answer for a picker.
 *
 * A list that could not be read is NAMED in `missing`, never silently left
 * out: a search that says "nothing matches" over a book that failed to load
 * is how a home "doesn't exist".
 */

export interface PickHome {
  /** What the job or invoice is filed under: the REX property, else the listing. */
  id: string;
  /** The listing or managed-home id its page opens with, where it has one. */
  listingId: string | null;
  name: string;
  locality: string;
  landlord: string;
  tenant: string | null;
  /** Where it stands, said beside the address so two rows are never confused. */
  stage: "On the market" | "Let agreed" | "Draft listing" | "Let" | "Managed" | "On the books";
  certs?: Record<string, { expires: number | null; attached?: boolean }>;
}

export async function homesToPick(rexUserId: string | null, withCompliance: boolean): Promise<{ homes: PickHome[]; missing: string[] }> {
  const missing: string[] = [];
  const [listings, managed, compliance] = await Promise.all([
    bookFor(rexUserId).catch(() => { missing.push("listings"); return null; }),
    managedBookFor(rexUserId).then((m) => m.book).catch(() => { missing.push("managed homes"); return null; }),
    withCompliance ? getComplianceBook().then((c) => c.book).catch(() => { missing.push("the compliance list"); return null; }) : Promise.resolve(null),
  ]);

  /* A home on two lists is the same front door, and is one row: matched by
     its REX property, else by its address. Two rows from the SAME list under
     one property are not the same home, though - REX lets each room of a
     shared house as its own letting on the one property - so those stay
     apart, each under its own name. */
  type Source = "let" | "listing" | "compliance";
  const rows: { home: PickHome; from: Source; addr: string }[] = [];
  const byId = new Map<string, number[]>();
  const byAddress = new Map<string, number>();
  const addr = (name: string, locality: string) => `${name} ${locality}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const put = (h: PickHome, from: Source) => {
    const a = addr(h.name, h.locality);
    const same = byId.get(h.id) ?? [];
    let at: number | undefined = same.find((i) => rows[i].addr === a);
    if (at === undefined && same.length && !same.some((i) => rows[i].from === from)) at = same[0];
    if (at === undefined && !same.length && a) at = byAddress.get(a);
    if (at === undefined) {
      rows.push({ home: h, from, addr: a });
      byId.set(h.id, [...same, rows.length - 1]);
      if (a && !byAddress.has(a)) byAddress.set(a, rows.length - 1);
      return;
    }
    /* Later lists fill what the earlier one left blank; the id, the name and
       the stage stay the first one's, which is the more exact. */
    const was = rows[at].home;
    rows[at].home = { ...was, listingId: was.listingId ?? h.listingId, landlord: was.landlord || h.landlord, tenant: was.tenant ?? h.tenant, certs: was.certs ?? h.certs };
  };

  /* Lets first: where a home is both let and listed again, its people are the let's. */
  for (const p of currentLets(managed?.properties ?? [])) {
    const id = String(p.propertyId ?? p.listingId ?? "");
    if (!id || !p.name) continue;
    put({ id, listingId: p.listingId ? String(p.listingId) : null, name: p.name, locality: p.locality ?? "", landlord: p.landlord?.name ?? "", tenant: p.tenants?.[0]?.name ?? null, stage: "Let" }, "let");
  }
  for (const l of listings?.listings ?? []) {
    const id = String(l.propertyId ?? l.id ?? "");
    if (!id || !l.name) continue;
    put({
      id,
      listingId: String(l.id),
      name: l.name,
      locality: l.locality ?? "",
      landlord: "",
      tenant: l.tenant ?? null,
      stage: l.letAgreed ? "Let agreed" : l.publicationStatus === "published" ? "On the market" : "Draft listing",
    }, "listing");
  }
  for (const c of compliance?.properties ?? []) {
    const id = String(c.id ?? "");
    if (!id || !c.name) continue;
    put({
      id,
      listingId: null,
      name: c.name,
      locality: c.locality ?? "",
      landlord: c.landlord ?? "",
      tenant: c.tenant ?? null,
      stage: c.managedByPm ? "Managed" : "On the books",
      certs: Object.fromEntries(Object.entries(c.certs ?? {}).map(([k, v]) => [k, { expires: v?.expires ?? null, attached: v?.attached }])),
    }, "compliance");
  }
  return { homes: rows.map((r) => r.home).sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true })), missing };
}
