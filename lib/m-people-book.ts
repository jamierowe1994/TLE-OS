import "server-only";
import { managedBookFor } from "@/lib/managed-book-cache";
import { assembled } from "@/lib/applications-board";

/**
 * The app's People tab (3 Oct 2026, James's mockup): the agent's tenants and
 * landlords as a list before anybody types, each with where they are and what
 * stage they are at. READ ONLY, from two books already kept warm:
 *
 *   Tenants   open applicants (the applications board - its own stage words,
 *             and never one on a home since let or withdrawn), then the
 *             tenants living in the homes we manage (the managed book)
 *   Landlords the owners of the homes we manage, with how many
 *
 * Search, sort and the tabs happen on the phone. Anyone not in either book is
 * still found by typing: the screen falls back to the contact search.
 */

export interface BookPerson {
  key: string;
  side: "tenant" | "landlord";
  name: string;
  phone: string;
  email: string;
  /** "Referencing", "In tenancy", "2 homes"... */
  status: string;
  tone: "new" | "active" | "neutral";
  address: string;
  locality: string;
  /** For an applicant the move-in they asked for; for a tenant the day the let began. ISO day. */
  since: string | null;
  tenancyType: string | null;
  rent: string;
  /** When they arrived on this list, for "recently added". ISO. */
  at: string | null;
}

const money = (n: number | null, period: string | null) =>
  n == null ? "" : `£${Math.round(n).toLocaleString("en-GB")} ${period === "week" ? "pw" : "pcm"}`;

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export async function peopleBook(rexUserId: string | null): Promise<{ tenants: BookPerson[]; landlords: BookPerson[] } | null> {
  const [managed, board] = await Promise.all([
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
    assembled(rexUserId).then((a) => a.held.value).catch(() => null),
  ]);
  if (!managed && !board) return null;

  const tenants: BookPerson[] = [];
  const seen = new Set<string>();
  const idOf = (name: string, phone: string | null, email: string | null) =>
    email ? `e:${email.toLowerCase()}` : digits(phone).length >= 9 ? `p:${digits(phone).slice(-10)}` : `n:${name.toLowerCase().trim()}`;

  /* Applicants first: they are the ones an agent is chasing this week. */
  for (const a of board?.applications ?? []) {
    if (board?.closed.get(a.id)) continue;
    if (!["received", "communicated", "accepted"].includes(a.status)) continue;
    const stage = board?.stages.get(a.id) ?? a.statusLabel;
    for (const p of a.applicants) {
      const id = idOf(p.name, p.phone, p.email);
      if (!p.name.trim() || seen.has(id)) continue;
      seen.add(id);
      tenants.push({
        key: `a-${a.id}-${p.id ?? p.name}`,
        side: "tenant",
        name: p.name,
        phone: p.phone ?? "",
        email: p.email ?? "",
        status: stage,
        tone: "new",
        address: a.property,
        locality: a.locality,
        since: a.startDate,
        tenancyType: a.agreementMonths ? `${a.agreementMonths} months` : null,
        rent: money(a.offerAmount, a.offerPeriod),
        at: a.createdAt ? new Date(a.createdAt * (a.createdAt < 1e12 ? 1000 : 1)).toISOString() : a.dateReceived,
      });
    }
  }

  const landlords = new Map<string, BookPerson & { homes: number }>();
  for (const h of managed?.properties ?? []) {
    for (const t of h.tenants) {
      const id = idOf(t.name, t.phone, t.email);
      if (!t.name.trim() || seen.has(id)) continue;
      seen.add(id);
      tenants.push({
        key: `t-${h.listingId}-${t.contactId}`,
        side: "tenant",
        name: t.name,
        phone: t.phone ?? "",
        email: t.email ?? "",
        status: "In tenancy",
        tone: "active",
        address: h.name,
        locality: h.locality,
        since: h.letSince,
        tenancyType: h.letType,
        rent: money(h.rent, h.rentPeriod),
        at: h.letSince,
      });
    }
    const l = h.landlord;
    if (l?.name.trim()) {
      const had = landlords.get(l.contactId);
      if (had) {
        had.homes += 1;
        had.status = `${had.homes} homes`;
      } else {
        landlords.set(l.contactId, {
          key: `l-${l.contactId}`,
          side: "landlord",
          name: l.name,
          phone: l.phone ?? "",
          email: l.email ?? "",
          status: "1 home",
          tone: "neutral",
          address: h.name,
          locality: h.locality,
          since: h.onBooksSince,
          tenancyType: h.service,
          rent: money(h.rent, h.rentPeriod),
          at: h.onBooksSince,
          homes: 1,
        });
      }
    }
  }

  return { tenants, landlords: [...landlords.values()].map(({ homes: _homes, ...p }) => p) };
}
