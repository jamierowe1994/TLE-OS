import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import {
  createPassport,
  deleteDemoPassport,
  listDemoPassports,
  DEMO_CONTACT_ID,
} from "@/lib/passport";

/**
 * Throwaway tenant passports, for showing people what one looks like.
 *
 * ── Why this is not on /api/tenant/passport ───────────────────────────────
 *
 * That route's own header promises it "offers no way to list them, look one
 * up by email, or reach anything else", and that promise is load-bearing: it
 * is a PUBLIC route, exempt from the session gate, holding the only
 * credential a tenant has. Adding a list to it - even a guarded one - would
 * put listing code one missing capability check away from the open internet.
 *
 * So the listing lives here instead, behind admin, and everything it can see
 * is scoped to `contact_id = 'demo'` in SQL rather than in a filter that
 * could be forgotten.
 *
 * ── Why demos get their own records at all ────────────────────────────────
 *
 * A passport link is a live read-AND-WRITE credential to a real person's
 * income, adverse credit, guarantor and right-to-rent share code, and the
 * form autosaves 800ms after a keystroke. So demonstrating with a real
 * tenant's link would both expose their file to the room and overwrite it
 * the moment James typed in a field to show how it works. A throwaway costs
 * one row and removes the entire problem.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `see:reports`, not `admin:open`, and it matters which.
 *
 * The page in front of this is in the admin rail under `see:reports`, so the
 * two must ask the same question or they drift into a screen somebody can
 * open and not use. They are not the same set: `pretenancy` - Kirstie - holds
 * `admin:open` but not `see:reports`, so the looser check would have let her
 * mint and delete demo passports through an endpoint she has no page for.
 * Nothing terrible, but access nobody chose to give her.
 */

/** Obviously invented. A plausible fake is how a demo record gets mistaken
 *  for somebody's real file - see the profile scar in app/(os)/profile. */
const DEMO_NAME = "Sample Tenant";
const DEMO_EMAIL = "sample.tenant@example.com";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:reports"))) {
    return new NextResponse(null, { status: 404 });
  }
  if (!hasDb()) return NextResponse.json({ ok: true, db: false, passports: [] });

  const rows = await listDemoPassports().catch(() => []);
  return NextResponse.json({
    ok: true,
    db: true,
    passports: rows.map((p) => ({
      token: p.token,
      name: p.name,
      createdAt: p.createdAt,
      submittedAt: p.submittedAt,
      /* Enough to show "started" vs "blank" without shipping the contents of
         the form to a list screen. */
      filled: Object.values(p.data).filter((v) => typeof v === "string" && v.trim()).length,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireCapability(req, "see:reports"))) {
    return new NextResponse(null, { status: 404 });
  }
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, error: "There is no database on this environment, so a passport cannot be made." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const rec = await createPassport({
    name: body.name?.trim() || DEMO_NAME,
    email: DEMO_EMAIL,
    contactId: DEMO_CONTACT_ID,
  });
  return NextResponse.json({ ok: true, token: rec.token, path: `/tenant/passport/${rec.token}` });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireCapability(req, "see:reports"))) {
    return new NextResponse(null, { status: 404 });
  }
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const gone = await deleteDemoPassport(token).catch(() => false);
  /* An honest no. `deleteDemoPassport` cannot touch a real tenant's row, so
     a false here means either "already gone" or "that was not a demo". */
  return NextResponse.json({ ok: gone });
}
