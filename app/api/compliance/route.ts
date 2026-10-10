import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { getComplianceBook } from "@/lib/compliance-cache";
import { rexConfigured } from "@/lib/rex";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";

/**
 * The compliance book, live from REX.
 *
 * The caching lives in `lib/compliance-cache` so Michael's tracker can share
 * it rather than starting a second thirty-second sweep of the slowest service
 * we talk to.
 *
 * ── Whose homes (4 Oct 2026) ──────────────────────────────────────────────
 *
 * The page goes live for agents on Tuesday 6 Oct, and until now it answered
 * every signed-in person with every home in the business. The rule James set
 * for the Overview on 2 Oct holds here too: the whole book is the office's
 * (anyone who can see everything - Michael, Josel, Kirstie, the owners), and
 * everyone else sees the homes on their own book - the same managed book
 * Portfolio and Inspections scope by, so the three agree about whose a home is.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({
      ok: true,
      live: false,
      /* The ONLY answer that lets the page show the sample book. */
      demo: true,
      reason: "REX isn't connected here - the sample book is standing in.",
    });
  }
  try {
    const who = await whoIs(req);
    if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const office = !who.viewingAs && can(who.actor.role, "see:everything");
    const scope = office ? null : await scopeForWho(req, who);
    if (scope?.unlinked) {
      return NextResponse.json({
        ok: true,
        live: false,
        reason: "Your login is not matched to your homes yet, so there is nothing to show. Ask James to link your account.",
      });
    }
    const { book, ageMs, stale } = await getComplianceBook();
    if (!scope || scope.everything) {
      return NextResponse.json({ ok: true, live: true, ...book, ageMs, ...(stale ? { stale: true } : {}), scope: { whole: true, label: "the whole business" } });
    }
    const { book: mine } = await managedBookFor(scope.rexUserId);
    const ids = new Set(mine.properties.map((p) => String(p.propertyId ?? "")).filter(Boolean));
    const properties = book.properties.filter((p) => ids.has(String(p.id)));
    return NextResponse.json({
      ok: true,
      live: true,
      ...book,
      properties,
      ageMs,
      ...(stale ? { stale: true } : {}),
      scope: { whole: false, label: scope.label },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: publicError(e, "The certificates didn't load. Try again in a minute.") },
      { status: 502 }
    );
  }
}
