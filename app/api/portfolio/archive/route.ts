import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { listArchive } from "@/lib/tenancy-archive";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";

/**
 * Past tenancies (James, 9 Oct 2026): every let Portfolio has shown, kept
 * after the home leaves it - see lib/tenancy-archive.
 *
 * GET ?property=<REX property id>  one home's lets, newest first
 * GET ?q=<words>                   search the address, tenants and landlord
 * GET &left=1                       only lets that are off REX's book now
 *
 * Scoped like the book: an agent sees the lets that were theirs, an owner
 * sees the business. Each row says whether the let is still on the book.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) {
    return NextResponse.json({ ok: false, error: "We can't tell which REX user you are, so we can't show you past tenancies - and we won't show you everybody's." });
  }

  const sp = req.nextUrl.searchParams;
  try {
    /* What is on the book now, so a let can say it has gone. Without REX,
       nothing is claimed either way. */
    const onBook = rexConfigured()
      ? await managedBookFor(scope.rexUserId).then(({ book }) => ({
          live: new Set(book.properties.filter((p) => !p.held).map((p) => p.listingId)),
          held: new Set(book.properties.filter((p) => p.held).map((p) => p.listingId)),
        })).catch(() => null)
      : null;
    const left = sp.get("left") === "1";
    if (left && !onBook) return NextResponse.json({ ok: false, error: "The book can't be read just now, so we can't tell which lets have left it." }, { status: 503 });
    const rows = await listArchive({
      propertyId: sp.get("property"), search: sp.get("q") ?? "", agentId: scope.rexUserId, limit: Number(sp.get("limit")) || 200,
      notIn: left && onBook ? [...onBook.live] : null,
    });
    return NextResponse.json({
      ok: true,
      tenancies: rows.map((r) => ({
        ...r,
        /* Held through notice: off REX, still on Portfolio until they go. */
        held: onBook ? onBook.held.has(r.listingId) : false,
        gone: onBook ? !onBook.live.has(r.listingId) && !onBook.held.has(r.listingId) : false,
      })),
      known: onBook !== null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Past tenancies couldn't be read just now. Try again in a minute." }, { status: 503 });
  }
}
