import { NextRequest, NextResponse } from "next/server";
import { createCase, listCases, PlcRefused, reviewQueue } from "@/lib/plc-store";
import { PLC_CHECKS } from "@/lib/plc";
import { scanConfigured } from "@/lib/plc-scan";
import { currentUser } from "@/lib/plc-actor";

/**
 * GET  /api/plc          → every handover, newest first
 * GET  /api/plc?queue=1  → what is with compliance, longest wait first
 * POST /api/plc          → start a handover from an accepted application
 *
 * The check list ships with the response rather than being imported by the
 * screens separately, so a check added in lib/plc.ts appears everywhere at
 * once instead of in whichever component was remembered.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const queue = req.nextUrl.searchParams.get("queue") === "1";
  try {
    const cases = queue ? await reviewQueue() : await listCases();
    return NextResponse.json({
      ok: true,
      cases,
      checks: PLC_CHECKS,
      scanConfigured: scanConfigured(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't read the handovers." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: {
    applicationRef?: string;
    address?: string;
    agentName?: string;
    agentEmail?: string;
    moveInDate?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  /* The agent on the case is whoever is signed in, not whoever the body says.
     A handover names the person accountable for the pack, and that is not a
     field a caller should be able to set. */
  const me = await currentUser(req);

  try {
    const created = await createCase({
      applicationRef: body.applicationRef ?? "",
      address: body.address ?? "",
      agentName: me?.name ?? body.agentName ?? "",
      agentEmail: me?.email ?? body.agentEmail ?? "",
      moveInDate: body.moveInDate ?? null,
    });
    return NextResponse.json({ ok: true, case: created });
  } catch (e) {
    if (e instanceof PlcRefused) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Couldn't start the handover." },
      { status: 500 }
    );
  }
}
