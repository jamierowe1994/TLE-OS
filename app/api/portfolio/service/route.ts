import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { serviceFor } from "@/lib/rent-status";

/**
 * GET /api/portfolio/service?listing= -> the home's PayProp service tag (with
 * RLP, no RLP, legal cover only) and its management fee (Susan, 12 Oct 2026).
 * Read only, from the 10am/4pm PayProp copy (lib/rent-status), never PayProp
 * itself. Scoped like /api/portfolio/rent: the home must be in the caller's book.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const service = await serviceFor({ name: home.name, address: home.address, postcode: home.postcode }).catch(() => ({
    state: "unreachable" as const,
    detail: "PayProp couldn't be read just now.",
  }));
  return NextResponse.json({ ok: true, service });
}
