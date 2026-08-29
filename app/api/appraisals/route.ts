import { NextResponse } from "next/server";
import { listAppraisals, createAppraisal } from "@/lib/appraisal-store";

/**
 * The appraisals the OS has booked.
 *
 * GET  → all of them, for the list screen and the file page
 * POST → book one, or move the appointment on the one this lead already has
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
    /* An empty list with a reason, not a 500. The screen shows the samples and
       says the live book could not be read, which is the honest state. */
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
