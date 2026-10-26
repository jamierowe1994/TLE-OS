import { NextRequest, NextResponse } from "next/server";
import { bookScope } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { doorNumbers, live, sameLetAddress } from "@/lib/propoly-only-lets";

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
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const deals = await getAllPropolyDeals().catch(() => null);
  if (!deals) return NextResponse.json({ ok: false, error: "Propoly's lets could not be read just now." });

  const lets: IncomingLet[] = deals
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

  return NextResponse.json({ ok: true, lets });
}
