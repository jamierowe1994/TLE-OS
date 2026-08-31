import { NextResponse } from "next/server";
import { listAppraisals, createAppraisal, recordValuation } from "@/lib/appraisal-store";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { SERVICE_LEVELS, type ServiceLevel } from "@/lib/market-appraisal";
import type { NextRequest } from "next/server";

/**
 * The appraisals the OS has booked.
 *
 * GET   → all of them, for the list screen and the file page
 * POST  → book one, or move the appointment on the one this lead already has
 * PATCH → record what the visit produced: the figure and the terms agreed
 *
 * ── Why a booking must not fail loudly ────────────────────────────────────
 *
 * POST is called at the moment an agent finishes agreeing a time with a
 * landlord on the phone. If it throws, the drawer has already closed and the
 * appointment is gone with it. So a failure here is reported rather than
 * raised, and the caller still completes the handover — the agent lands on
 * Market Appraisals and can see the appraisal is not there, which is a visible
 * problem rather than a silent one.
 *
 * Same reasoning as lib/appraisal-store's JSON fallback: a missing database
 * should cost you persistence, not the appointment.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ appraisals: await listAppraisals() });
  } catch (e) {
    /* An empty list with a reason, not a 500. The screen renders the error
       rather than a stale or invented row, which is the honest state. */
    return NextResponse.json({
      appraisals: [],
      error: e instanceof Error ? e.message : "read failed",
    });
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    leadId?: string | null;
    landlord?: string;
    address?: string;
    postcode?: string;
    agent?: string | null;
    appointmentAt?: string | null;
  };

  if (!b.landlord?.trim() || !b.address?.trim()) {
    return NextResponse.json(
      { error: "An appraisal needs a landlord and an address." },
      { status: 400 }
    );
  }

  try {
    const appraisal = await createAppraisal({
      leadId: b.leadId?.trim() || null,
      landlord: b.landlord,
      address: b.address,
      postcode: b.postcode,
      agent: b.agent ?? null,
      appointmentAt: b.appointmentAt ?? null,
    });
    return NextResponse.json({ appraisal });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save the appraisal." },
      { status: 200 }
    );
  }
}

/**
 * Record what the visit produced.
 *
 * ── Why this needs a signed-in person and POST does not ───────────────────
 *
 * Booking is a diary action taken on the phone; losing it to an auth wobble
 * costs a real appointment, which is why POST is deliberately forgiving. A
 * valuation is different: it is the number that goes on a landlord's
 * post-appraisal deck, and "who said it was worth £1,300" has to be
 * answerable. So this one refuses rather than guesses.
 *
 * ── Partial by design ─────────────────────────────────────────────────────
 *
 * Only the fields actually present in the body are written. An agent who saves
 * a rent from the car and the fee from the office must not have the second
 * save wipe the first.
 */
export async function PATCH(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json(
      { error: "Sign in first — a valuation is recorded against whoever made it." },
      { status: 401 }
    );
  }

  const b = (await req.json().catch(() => ({}))) as {
    id?: string;
    valuation?: unknown;
    serviceLevel?: unknown;
    feePct?: unknown;
    setupFee?: unknown;
    valuationNote?: unknown;
  };

  const id = (b.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Which appraisal?" }, { status: 400 });

  /* "" and null both mean CLEAR IT; undefined means leave it alone. Number("")
     is 0, so an empty box would otherwise store a real £0 rent and satisfy
     every "has a valuation" check in the OS. */
  const money = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Number(String(v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const pct = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Number(String(v).replace(/[^\d.]/g, ""));
    /* A management fee is a percentage, not a multiplier. Somebody typing 1200
       has given us the rent by mistake, and storing it would put "1200% of
       rent" in front of a landlord. */
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
  };

  const level = ((): ServiceLevel | null | undefined => {
    if (b.serviceLevel === undefined) return undefined;
    if (!b.serviceLevel) return null;
    const found = SERVICE_LEVELS.find((s) => s.id === b.serviceLevel);
    return found ? found.id : null;
  })();

  try {
    const appraisal = await recordValuation(
      id,
      {
        ...(b.valuation !== undefined ? { valuation: money(b.valuation) ?? null } : {}),
        ...(level !== undefined ? { serviceLevel: level } : {}),
        ...(b.feePct !== undefined ? { feePct: pct(b.feePct) ?? null } : {}),
        ...(b.setupFee !== undefined ? { setupFee: money(b.setupFee) ?? null } : {}),
        ...(b.valuationNote !== undefined
          ? { valuationNote: String(b.valuationNote ?? "").trim().slice(0, 2000) || null }
          : {}),
      },
      me.name || me.email
    );
    if (!appraisal) {
      return NextResponse.json({ error: "No such appraisal." }, { status: 404 });
    }
    return NextResponse.json({ appraisal });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save the valuation." },
      { status: 500 }
    );
  }
}
