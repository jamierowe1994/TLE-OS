import "server-only";
import { hasDb, q } from "@/lib/db";
import { currentLets } from "@/lib/current-lets";
import { recountBook } from "@/lib/agent-moves";
import { peopleOnHomes } from "@/lib/home-aliases";
import { stillNewest } from "@/lib/let-edit-fields";
import type { LetEditsNow } from "@/lib/let-edits";
import type { PropertyPerson } from "@/lib/property-people";
import type { ManagedBook, ManagedProperty, Party } from "@/lib/portfolio-types";

/**
 * THE HOME AS ITS LET HAS IT, ON PORTFOLIO (4 Nov 2026).
 *
 * "Details not pulling through" were 38% of the agents' tickets since launch,
 * and the managed book was the furthest out: REX's first owner and nobody
 * else, and the tenants REX, REX PM or PayProp name, never what an agent put
 * right on the let. A joint landlord added on the listing, or a tenant's
 * mobile fixed on the let, reached the let and the Propoly push but not the
 * home, nor anything that reads the home from here: the portals, Steve, a
 * contractor's email.
 *
 * Laid over the book on every read (lib/managed-book-cache), after the
 * home's own Edit (lib/home-overrides):
 *
 *   landlords  the joint landlords kept on the home under any key it is
 *              filed under (lib/home-aliases peopleOnHomes), after REX's own
 *              owners, each person once by email, else by name: the people
 *              and the order the Propoly push sends (lib/deal-handoff). With
 *              nobody else named, the first of them is the landlord, as on
 *              the let. Each home's current let, as the record and changed
 *              landlords are.
 *   tenants    the let's own corrections (lib/let-people tenantsAsOnLet): a
 *              name, email or mobile put right on the let, and anybody added
 *              to it, on the lets whose tenants live there now - every room
 *              of a shared house (lib/tenant-logins sittingLets). Not on a
 *              home whose tenants were set with Edit on its own page: that
 *              names the household.
 *   moveIn     the day the tenancy began, as the let page has it, on the same
 *              lets (moveInsFor below). REX's let date was the day the
 *              listing was marked let, often a week or more off.
 *
 * Read only: nothing here is written to REX, REX PM, PayProp or Propoly.
 */
export async function withLetsOnBook(book: ManagedBook): Promise<ManagedBook> {
  if (!hasDb()) return book;
  const live = book.properties.filter((p) => !p.test);
  const current = currentLets(live);
  if (!current.length) return book;
  const { sittingLets } = await import("@/lib/tenant-logins");
  const sitting = sittingLets(live);
  const [onHomes, corrected, moveIns] = await Promise.all([
    peopleOnHomes(current.map((p) => ({ id: String(p.listingId), keys: [p.propertyId, `listing:${p.listingId}`] }))).catch(() => new Map<string, PropertyPerson[]>()),
    correctedLets(sitting.flatMap((p) => p.letRefs ?? [])),
    moveInsFor(sitting).catch(() => new Map<ManagedProperty, string>()),
  ]);
  if (!onHomes.size && !corrected.size && !moveIns.size) return book;

  const next = new Map<ManagedProperty, ManagedProperty>();
  let recount = false;
  for (const [p, moveIn] of moveIns) if (moveIn !== p.moveIn) next.set(p, { ...p, moveIn });
  for (const p of current) {
    const was = next.get(p) ?? p;
    const row = withJointLandlords(was, (onHomes.get(String(p.listingId)) ?? []).filter((x) => x.kind === "joint_landlord"));
    if (row === was) continue;
    if (!p.landlord) recount = true;
    next.set(p, row);
  }
  if (corrected.size) {
    const { tenantsAsOnLet } = await import("@/lib/let-people");
    for (const p of sitting) {
      if (p.overridden?.tenants) continue;
      /* Oldest let first, so the newest's correction is the one left standing. */
      const refs = (p.letRefs ?? []).filter((r) => corrected.has(r)).reverse();
      if (!refs.length) continue;
      const row = next.get(p) ?? p;
      let tenants: Party[] = row.tenants;
      for (const ref of refs) {
        const read = await tenantsAsOnLet(ref, tenants, { added: (t) => ({ contactId: `let-tenant:${t.id}`, name: t.name, email: t.email, phone: t.phone }) }).catch(() => tenants);
        tenants = read.map((t) => ({ contactId: t.contactId, name: t.name, email: t.email, phone: t.phone }));
      }
      if (JSON.stringify(tenants) === JSON.stringify(row.tenants)) continue;
      if (!row.tenants.length) recount = true;
      next.set(p, { ...row, tenants });
    }
  }
  if (!next.size) return book;
  const properties = book.properties.map((p) => next.get(p) ?? p);
  return recount ? recountBook(book, properties) : { ...book, properties };
}

/**
 * THE MOVE-IN, AS THE LET PAGE HAS IT (4 Nov 2026). Inspections, tenancy
 * reviews and notices counted from REX's let date - the day the listing was
 * marked let, a week or more off the move-in on a third of the lets we could
 * check - so a first visit or a review fell due on the wrong day, and a
 * Section 13 was drawn up on the wrong tenancy start. The let's own reading
 * (lib/let-deal dealForLet, the let page): the Propoly deal the let was
 * pushed into, with any move-in put right on the let laid over it; else the
 * application's start, with the same. Then the newest change made in the OS
 * wins: a move-in put right on the let, or Tenancy start with Edit on the
 * home's page (lib/home-overrides, already on the row as letSince).
 */
async function moveInsFor(rows: ManagedProperty[]): Promise<Map<ManagedProperty, string>> {
  const out = new Map<ManagedProperty, string>();
  const lets = rows.filter((p) => p.letRefs?.length || p.letStart || p.overridden?.tenancyStart);
  if (!lets.length) return out;
  const refs = lets.map((p) => p.letRefs?.[0]).filter((r): r is string => Boolean(r));
  const { letEditsFor, withOwnLetEdits } = await import("@/lib/let-edits");
  const { pushedDeals } = await import("@/lib/let-deal");
  const [own, pushed] = await Promise.all([
    letEditsFor(refs).catch(() => new Map<string, LetEditsNow>()),
    pushedDeals(refs).catch(() => new Map<string, string>()),
  ]);
  const deals = pushed.size ? await (await import("@/lib/business/propoly-deals")).getAllPropolyDeals().catch(() => null) : null;
  const day = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  for (const p of lets) {
    const ref = p.letRefs?.[0];
    const mine = ref ? own.get(ref) : undefined;
    const dealId = ref ? pushed.get(ref) : undefined;
    const deal = dealId ? deals?.find((d) => d.app.id === dealId && d.statusKey !== "cancelled") : undefined;
    let value: string | null = null;
    /* When the OS's own change behind the figure was made, if it is one. */
    let changedAt: string | null = null;
    const d = deal ? withOwnLetEdits(deal, mine) : null;
    if (d && day(d.app.startDate)) {
      value = day(d.app.startDate);
      changedAt = d.letEdits?.moveIn?.at ?? null;
    } else {
      const e = mine?.moveIn;
      /* The application's start, read with the book, already carries a
         change made before that read; one made since is laid on here. */
      if (e?.value && (e.value === p.letStart || stillNewest("moveIn", e, "app", p.letStart ?? null))) {
        value = day(e.value);
        changedAt = e.at;
      } else value = p.letStart ?? null;
    }
    const home = p.overridden?.tenancyStart;
    if (home && day(p.letSince) && (!changedAt || home.at >= changedAt)) value = day(p.letSince);
    if (value) out.set(p, value);
  }
  return out;
}

/** Of these lets, the ones with a tenant put right or added on them. */
async function correctedLets(refs: string[]): Promise<Set<string>> {
  const ids = [...new Set(refs.filter(Boolean))];
  if (!ids.length) return new Set();
  /* Each table is made by its own module on first use (lib/let-landlords,
     lib/let-tenants): one not made yet has nothing in it to read. */
  const [edited, added] = await Promise.all([
    q<{ let_ref: string }>(`SELECT DISTINCT let_ref FROM os_let_person_edits WHERE let_ref = ANY($1)`, [ids]).catch(() => []),
    q<{ let_ref: string }>(`SELECT DISTINCT let_ref FROM os_let_tenants WHERE let_ref = ANY($1) AND removed_at IS NULL`, [ids]).catch(() => []),
  ]);
  return new Set([...edited, ...added].map((r) => r.let_ref));
}

/** The joint landlords after the landlords the row already names, each person once. */
function withJointLandlords(p: ManagedProperty, joint: PropertyPerson[]): ManagedProperty {
  if (!joint.length) return p;
  const key = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const held = [p.landlord, ...(p.otherLandlords ?? [])].filter((l): l is Party => Boolean(l));
  const emails = new Set(held.map((l) => key(l.email)).filter(Boolean));
  const names = new Set(held.map((l) => key(l.name)).filter(Boolean));
  const extra: Party[] = [];
  for (const j of joint) {
    const e = key(j.email);
    const n = key(j.name);
    if ((e && emails.has(e)) || (n && names.has(n))) continue;
    if (e) emails.add(e);
    if (n) names.add(n);
    extra.push({ contactId: `person:${j.id}`, name: j.name, email: j.email, phone: j.phone });
  }
  if (!extra.length) return p;
  if (p.landlord) return { ...p, otherLandlords: [...(p.otherLandlords ?? []), ...extra] };
  const [first, ...rest] = extra;
  const others = [...(p.otherLandlords ?? []), ...rest];
  return { ...p, landlord: first, otherLandlords: others.length ? others : undefined };
}
