import { NextRequest, NextResponse } from "next/server";
import { bookScope } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { doorNumbers, live, sameLetAddress } from "@/lib/propoly-only-lets";
import { homeTenancies, payPropTenantRows, personKey, type NextTenancyPerson } from "@/lib/business/payprop-tenant-contacts";

/**
 * The let on its way into one home (Joe Patten, 26 Oct 2026).
 *
 * 340 Four Chimneys Crescent: REX had the home let from 30 Sep with nobody on
 * it, because the let went straight into Propoly on 26 Sep with no REX
 * application - and REX's tenancy only ever takes its tenants from one. So
 * the home read "None on record", Change the tenants was greyed out, and Joe
 * and Steve could not see why. Its tenants were on the Propoly deal all
 * along, referenced and waiting for their agreement.
 *
 * So the home's page asks here: an open Propoly deal on the same home, with
 * who is on it and when they move in. Read only, from the OS's own copy of
 * Propoly's book (propoly_cache), so it costs no calls. Scoped like
 * /api/portfolio/tenancy: the home must be in the caller's own book.
 *
 * ── And on a home somebody still lives in (Lianna, 2 Nov 2026) ───────────
 *
 * James: the tenant in the tenancy stands until they move out, and the page
 * says "New tenancy starting" and the date beside them, opening to who is
 * coming. `next` is that tenancy: an open Propoly deal for people who are not
 * the home's tenants, or failing one, a newer tenancy for other people that
 * PayProp already holds (lib/business/payprop-tenant-contacts homeTenancies).
 * A deal naming any of the sitting tenants is a swap or a renewal, not a new
 * tenancy, and is left out.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type NextTenancy = { startDate: string | null; people: NextTenancyPerson[]; href: string | null };

export type IncomingLet = {
  id: string;
  tenants: string[];
  status: string;
  moveIn: string | null;
  href: string;
};

export async function GET(req: NextRequest) {
  const listing = req.nextUrl.searchParams.get("listing")?.trim();
  if (!listing) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The book isn't connected on this environment." });

  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const scope = await bookScope(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 });

  const { book } = await managedBookFor(scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === listing);
  if (!home) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 404 });

  /* Propoly unread still lets PayProp say who is coming. */
  const deals = await getAllPropolyDeals().catch(() => null);

  const lets: IncomingLet[] = (deals ?? [])
    /* A room ("Room 1, 32 Elm Close") is only met by a deal that names it:
       a deal on the whole house could be for any of its rooms. */
    .filter((d) => live(d) && sameLetAddress(home, d) && doorNumbers(d.app.propertyName).length >= doorNumbers(home.name).length)
    .map((d) => ({
      id: d.app.id,
      tenants: (d.app.tenants ?? []).map((t) => t.name).filter(Boolean),
      status: d.app.status ?? "",
      moveIn: d.app.startDate ?? null,
      /* The let's own page opens a Propoly deal by its id (applications/[id]). */
      href: `/applications/${encodeURIComponent(d.app.id)}`,
    }))
    .sort((a, b) => (a.moveIn ?? "9").localeCompare(b.moveIn ?? "9"));

  const shown = home.tenants.map((t) => t.name);
  const sitting = new Set(shown.map(personKey).filter(Boolean));
  const fromPayProp = shown.length ? homeTenancies(await payPropTenantRows().catch(() => []), home, shown).next : null;
  const deal = shown.length ? lets.find((l) => l.tenants.length && !l.tenants.some((n) => sitting.has(personKey(n)))) : undefined;
  const contact = (name: string) => fromPayProp?.people.find((p) => personKey(p.name) === personKey(name));
  const next: NextTenancy | null = deal
    ? { startDate: deal.moveIn, href: deal.href, people: deal.tenants.map((name) => ({ name, email: contact(name)?.email ?? null, phone: contact(name)?.phone ?? null })) }
    : fromPayProp
      ? { startDate: fromPayProp.startDate, href: null, people: fromPayProp.people }
      : null;

  return NextResponse.json({ ok: true, lets, next });
}
