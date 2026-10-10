import "server-only";
import { getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { getApplications, type Application } from "@/lib/applications";
import { postcodeOf, sameHome } from "@/lib/address-parse";
import { hasDb, q } from "@/lib/db";

/**
 * LETS THAT ONLY PROPOLY KNOWS ABOUT (James, 9 Oct 2026).
 *
 * Kirstie: "I have let 54 Maple Avenue and 41 Gwencole but they're not in my
 * applications." Maple Avenue found its tenant without being marketed, so it
 * went straight into Propoly and REX never had a property, a listing or an
 * application for it. The Applications screen reads REX, so it could not see
 * it. On the day, 15 of 27 live Propoly deals had no REX application.
 *
 * So the board lists them too, under the agent Propoly names on the deal.
 * Read only: nothing is written to REX or to Propoly. Deals come from the
 * OS's own copy of Propoly's book (propoly_cache), so this costs no calls.
 */

export type PropolyOnlyLet = {
  id: string;
  address: string;
  locality: string;
  tenants: string;
  status: string;
  stage: string;
  offer: number | null;
  moveIn: string | null;
  received: string | null;
  agentName: string | null;
  /** The pre-tenancy file for people who have that screen, Propoly itself for everyone else. */
  href: string;
  external: boolean;
};

/** How far apart a REX application and a Propoly deal can start and still be the same let. */
const SAME_LET_DAYS = 150;

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** The numbers on the door, as written: "Room 5, 166 Gloucester Road" -> ["5", "166"]. */
const doorNumbers = (s: string) => (s.toLowerCase().match(/\b\d+[a-z]?\b/g) ?? []);

/**
 * The same home, allowing for a room or a flat written on one side and not
 * the other ("5b Newton Road" in Propoly, "Apartment Room 1, 5b Newton Road"
 * in REX): same postcode, and every number on the Propoly address is on REX's.
 */
function sameLetHome(rex: Application, deal: BusinessDeal): boolean {
  const rexAddress = `${rex.property}, ${rex.locality ?? ""}`;
  const dealAddress = `${deal.app.propertyName}, ${deal.app.locality ?? ""}`;
  if (sameHome(rexAddress, dealAddress)) return true;
  const pr = postcodeOf(rexAddress);
  const pd = postcodeOf(dealAddress);
  if (!pr || !pd || pr.replace(/\s/g, "") !== pd.replace(/\s/g, "")) return false;
  const wanted = doorNumbers(deal.app.propertyName);
  const have = new Set(doorNumbers(rex.property));
  return wanted.length > 0 && wanted.every((n) => have.has(n));
}

/** A REX application that is this deal: same home, not marked unsuccessful, started around the same time. */
function onRex(deal: BusinessDeal, book: Application[]): boolean {
  const received = deal.app.dateReceived ? Date.parse(`${deal.app.dateReceived}T12:00:00Z`) : NaN;
  return book.some((a) => {
    if (a.status === "unsuccessful") return false;
    if (!sameLetHome(a, deal)) return false;
    if (!Number.isFinite(received) || !a.createdAt) return true;
    return Math.abs(a.createdAt * 1000 - received) <= SAME_LET_DAYS * 86_400_000;
  });
}

/** Still a let in progress: not cancelled, not unsuccessful. */
const live = (d: BusinessDeal) => d.statusKey !== "cancelled" && d.app.stage !== "unsuccessful" && !d.app.dateUnsuccessful;

/** The names and emails one REX user goes by in the OS (Kirstie is Wallington in REX, Mulholland here). */
export async function whoIsRexUser(rexUserId: string): Promise<{ names: Set<string>; emails: Set<string> }> {
  const names = new Set<string>();
  const emails = new Set<string>();
  if (!hasDb()) return { names, emails };
  const rows = await q<{ name: string | null; email: string | null }>(
    `SELECT name, email FROM os_users WHERE rex_user_id = $1`,
    [rexUserId]
  ).catch(() => []);
  for (const r of rows) {
    if (r.name) names.add(norm(r.name));
    if (r.email) emails.add(norm(r.email));
  }
  return { names, emails };
}

/** Is this Propoly deal one of this REX user's own (its property manager is them)? */
export function isOwnDeal(d: { managerEmail: string | null; managerName: string | null }, me: { names: Set<string>; emails: Set<string> }): boolean {
  return me.emails.has(norm(d.managerEmail)) || me.names.has(norm(d.managerName));
}

export async function propolyOnlyLets(
  scope: { rexUserId: string | null; everything: boolean },
  opts: { canPretenancy: boolean }
): Promise<PropolyOnlyLet[]> {
  if (!scope.everything && !scope.rexUserId) return [];
  const deals = (await getAllPropolyDeals())?.filter(live) ?? [];
  if (!deals.length) return [];

  let mine = deals;
  if (!scope.everything && scope.rexUserId) {
    const me = await whoIsRexUser(scope.rexUserId);
    mine = deals.filter((d) => isOwnDeal(d, me));
    if (!mine.length) return [];
  }

  /* The whole business's book, not just this agent's: a let whose REX
     application sits under somebody else is still on REX. */
  const book = await getApplications(300);
  return mine
    .filter((d) => !onRex(d, book))
    .map((d) => ({
      id: d.app.id,
      address: d.app.propertyName,
      locality: d.app.locality ?? "",
      tenants: (d.app.tenants ?? []).map((t) => t.name).filter(Boolean).join(" & ") || "Tenant not named yet",
      status: d.app.status ?? "",
      stage: d.app.stage ?? "",
      offer: typeof d.app.offer === "number" ? d.app.offer : null,
      moveIn: d.app.startDate ?? null,
      received: d.app.dateReceived ?? null,
      agentName: d.managerName?.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? null,
      /* Opened on Applications' own board, in place - never Kirstie's board
         (James, 10 Oct 2026), and no longer out to Propoly either. */
      href: `/applications?deal=${encodeURIComponent(d.app.id)}`,
      external: false,
    }))
    .sort((a, b) => (b.received ?? "").localeCompare(a.received ?? ""));
}
