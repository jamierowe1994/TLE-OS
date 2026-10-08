import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { rentStatusFor } from "@/lib/rent-status";

/**
 * GET /api/portfolio/rent?listing= -> is this home up to date on rent, and
 * if not, by how much (James, 8 Oct 2026). The property page's bottom-right
 * box, where the map was. Read only, from PayProp (lib/rent-status).
 *
 * Scoped like /api/portfolio/tenancy: the home must be in the caller's own
 * book, so an agent never reads another agent's tenant's balance.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const listing = req.nextUrl.searchParams.get("listing")?.trim();
  if (!listing) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The book isn't connected on this environment." });

  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 });

  const { book } = await managedBookFor(scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === listing);
  if (!home) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 404 });

  const status = await rentStatusFor({ name: home.name, address: home.address, postcode: home.postcode }).catch(() => ({
    state: "unreachable" as const,
    detail: "PayProp couldn't be read just now.",
  }));
  return NextResponse.json({ ok: true, status });
}
