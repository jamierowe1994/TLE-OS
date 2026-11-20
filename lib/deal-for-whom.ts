/**
 * WHOSE DEAL IS IT - pure, client-safe (Sean McMahon, ticket d97601d4, 20 Nov 2026).
 *
 * "The offer accepted ... has mapped incorrectly across to Propoly with
 * someone else's details on it for the applicant." An earlier offer on the
 * same home had its own Propoly deal, still open, with that offer's tenant
 * on it. The let found that deal by its listing and its address, so the new
 * applicant's let showed the other person's deal (stage, people, "on the
 * Propoly deal but not on this let"), and Push to Propoly reused it as "a
 * live deal already on this home" rather than starting the let's own.
 *
 * A deal found by home or listing is this let's only if it names one of the
 * let's tenants, or names nobody yet (keyed by hand, tenants still to add).
 * The same rule letForDeal (lib/let-deal) already uses from the deal's side.
 * A person is the same by email, else by name.
 */

type Named = { name: string | null; email: string | null };
const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const same = (a: Named, b: Named) => Boolean((low(a.email) && low(a.email) === low(b.email)) || (low(a.name) && low(a.name) === low(b.name)));

/** True when the deal names tenants and none of them is one of the let's. With nobody on either side, it is not. */
export function dealIsSomeoneElses(dealTenants: readonly Named[] | null | undefined, letTenants: readonly Named[] | null | undefined): boolean {
  const onDeal = (dealTenants ?? []).filter((t) => low(t.name) || low(t.email));
  const onLet = (letTenants ?? []).filter((t) => low(t.name) || low(t.email));
  if (!onDeal.length || !onLet.length) return false;
  return !onDeal.some((d) => onLet.some((p) => same(d, p)));
}
