import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { getTenancyRegister, tenancyRegisterError } from "@/lib/business/payprop-tenancy";

/**
 * The tenancy on one home, for the property's own page (James, 7 Oct 2026:
 * "the current tenants and when they expire").
 *
 * The book holds the tenants but not the dates. PayProp holds the dates: the
 * start of the current tenancy, its end where it has one (most are periodic
 * and have none), the deposit reference and whether rent and legal
 * protection is on it. Read-only, through the register the deal money
 * already uses, keyed by the same address key.
 *
 * Scoped like /api/portfolio: the listing must be in the caller's own book,
 * so an agent cannot read the dates on a home that is not theirs.
 *
 * An address key can land on an older tenancy at the same address. If the
 * start PayProp gives is more than four months from the day the home was
 * let, it is not this tenancy, and nothing is said rather than a wrong date.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY = 86_400_000;

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

  const register = await getTenancyRegister().catch(() => null);
  if (!register) {
    const failed = tenancyRegisterError();
    return NextResponse.json({ ok: true, ready: false, error: failed ? "The tenancy dates could not be read just now." : null });
  }

  const key = propertyKey(home.name);
  const t = key ? register.tenancyByKey[key] ?? null : null;
  const rlp = key ? register.rlpByKey[key] ?? null : null;
  const off =
    t?.startDate && home.letSince
      ? Math.abs(new Date(t.startDate).getTime() - new Date(home.letSince).getTime()) / DAY > 120
      : false;

  return NextResponse.json({
    ok: true,
    ready: true,
    tenancy: t && !off ? { startDate: t.startDate, endDate: t.endDate, depositId: t.depositId } : null,
    protection: rlp && !off ? rlp.status : null,
  });
}
