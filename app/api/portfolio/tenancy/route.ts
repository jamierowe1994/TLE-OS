import { NextRequest, NextResponse } from "next/server";
import { bookScope } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { getTenancyRegister, tenancyRegisterError } from "@/lib/business/payprop-tenancy";
import { overridesFor } from "@/lib/home-overrides";
import { sayDay } from "@/lib/home-overrides-shared";

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
  const scope = await bookScope(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 });

  const { book } = await managedBookFor(scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === listing);
  if (!home) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 404 });

  /* The dates an agent put right with Edit on the home's page
     (lib/home-overrides, 2 Nov 2026: Lorna's 33 Eastfield Road started on the
     1st, not the 27th) beat PayProp's, and say what PayProp still holds. The
     start is already on the book as letSince. */
  const set = await overridesFor(home).catch(() => ({}) as Awaited<ReturnType<typeof overridesFor>>);
  const startSet = set.tenancyStart && typeof set.tenancyStart.value === "string" ? set.tenancyStart : null;
  const endSet = set.tenancyEnd && typeof set.tenancyEnd.value === "string" ? set.tenancyEnd : null;

  const register = await getTenancyRegister().catch(() => null);
  if (!register && !startSet && !endSet) {
    const failed = tenancyRegisterError();
    return NextResponse.json({ ok: true, ready: false, error: failed ? "The tenancy dates could not be read just now." : null });
  }

  const key = propertyKey(home.name);
  const t = key && register ? register.tenancyByKey[key] ?? null : null;
  const rlp = key && register ? register.rlpByKey[key] ?? null : null;
  /* Against REX's let date, not the start the agent typed: that is the check
     that PayProp's tenancy is this let's at all. */
  const letSince = home.overridden?.tenancyStart ? null : home.letSince;
  const off =
    t?.startDate && letSince
      ? Math.abs(new Date(t.startDate).getTime() - new Date(letSince).getTime()) / DAY > 120
      : false;
  const paid = t && !off ? t : null;
  const endValue = endSet ? (endSet.value === "rolling" ? null : String(endSet.value)) : paid?.endDate ?? null;

  return NextResponse.json({
    ok: true,
    ready: true,
    tenancy: paid || startSet || endSet
      ? {
          startDate: startSet ? String(startSet.value) : paid?.startDate ?? null,
          endDate: endValue,
          depositId: paid?.depositId ?? null,
          /* False when only the start is the OS's and PayProp gave nothing: no end
             date then means "not known", not "rolling". */
          endKnown: Boolean(endSet || paid),
        }
      : null,
    protection: rlp && !off ? rlp.status : null,
    /* Which dates are the OS's, by whom, and what PayProp says (null: nothing read). */
    set: {
      start: startSet ? { by: startSet.by, at: startSet.at, was: sayDay(paid?.startDate) } : null,
      end: endSet ? { by: endSet.by, at: endSet.at, was: paid ? (paid.endDate ? sayDay(paid.endDate) : "Rolling, no end date") : null } : null,
    },
  });
}
