import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import {
  createPassport,
  getPassport,
  savePassport,
  submitPassport,
  EMPTY_PASSPORT,
  type PassportData,
} from "@/lib/passport";

/**
 * The tenant's own passport, reached by the link in their email.
 *
 * GET    ?token=  → read it
 * PUT    ?token=  → save what they have typed
 * POST   ?token=&submit=1 → they have finished
 * POST   (no token, staff only) → mint a new passport and return its link
 *
 * ── The token IS the credential, and that is a deliberate trade ────────────
 *
 * There is no tenant sign-in yet, and inventing one here would mean a tenant
 * has to create a password before they can start - which is precisely where
 * people give up. So the link stands in for the login, exactly as the
 * pre-appraisal deck at /present/<token> already does.
 *
 * The cost is honest: whoever holds the link can read and write that passport.
 * That is acceptable for somebody filling in a form about themselves, and it
 * would NOT be acceptable for anything they can spend, cancel or agree to. So
 * this route only ever touches one row and offers no way to list them, look one
 * up by email, or reach anything else. When accounts arrive, the token becomes
 * one way in rather than the only one.
 *
 * A missing or unknown token gets 404 and no detail. "That token is wrong" and
 * "no such passport" are the same sentence here on purpose: anything that
 * distinguishes them turns this into an oracle for guessing tokens.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const rec = await getPassport(token).catch(() => null);
  if (!rec) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ passport: rec });
}

export async function PUT(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const existing = await getPassport(token).catch(() => null);
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { data?: Partial<PassportData> } | null;
  if (!body?.data) return NextResponse.json({ error: "Expected a passport." }, { status: 400 });

  /* Only known fields are kept. Anything else in the payload is dropped rather
     than stored - the row is JSONB, so without this it would happily accept
     whatever a caller invented and hand it back to the next reader. */
  const clean = { ...EMPTY_PASSPORT };
  for (const key of Object.keys(EMPTY_PASSPORT) as (keyof PassportData)[]) {
    const v = body.data[key];
    if (typeof v === "string" || typeof v === "boolean" || v === null) {
      (clean as Record<string, unknown>)[key] = v;
    }
  }

  try {
    return NextResponse.json({ passport: await savePassport(token, clean) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That didn't save." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";

  /* Finishing. Separate from saving so "done" is a deliberate press rather
     than a side effect of typing the last field. */
  if (token) {
    if (!req.nextUrl.searchParams.get("submit")) {
      return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
    }
    const rec = await submitPassport(token).catch(() => null);
    if (!rec) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ passport: rec });
  }

  /* Minting a link. STAFF ONLY - this is the one operation that creates a
     credential, so it is the one that needs a person behind it. */
  if (!(await requireCapability(req, "admin:open"))) {
    return new NextResponse(null, { status: 404 });
  }
  if (!hasDb()) {
    return NextResponse.json({ error: "No database on this environment." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    contactId?: string;
  };
  const rec = await createPassport({
    name: body.name?.trim(),
    email: body.email?.trim(),
    contactId: body.contactId ?? null,
  });
  return NextResponse.json({ passport: rec, path: `/tenant/passport/${rec.token}` });
}
