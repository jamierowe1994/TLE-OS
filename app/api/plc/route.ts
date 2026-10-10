import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { createCase, listCases, PlcRefused, reviewQueue } from "@/lib/plc-store";
import { PLC_CHECKS } from "@/lib/plc";
import { scanConfigured } from "@/lib/plc-scan";
import { currentUser } from "@/lib/plc-actor";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { moveInToRex } from "@/lib/plc-move-in-rex";

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
  /* Every handover pack in the business went to anybody signed in (Rig run 2,
     P-008). The review queue is the PLC checkers' (work:plc); the list is the
     business for owners and the office, and an agent's own packs otherwise. */
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (queue && !can(actor.role, "work:plc")) {
    return NextResponse.json({ ok: false, error: "The PLC queue is the checkers'." }, { status: 403 });
  }
  const everything = can(actor.role, "see:everything") || can(actor.role, "work:plc");
  try {
    const listed = queue ? await reviewQueue() : await listCases();
    const me = (actor.email ?? "").trim().toLowerCase();
    const cases = everything ? listed : listed.filter((c) => (c.agentEmail ?? "").trim().toLowerCase() === me);
    return NextResponse.json({
      ok: true,
      cases,
      checks: PLC_CHECKS,
      scanConfigured: scanConfigured(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: publicError(e, "Couldn't read the handovers.") },
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
    letType?: "home" | "hmo" | null;
    /** The date REX had when the wizard opened, so a change can go back to it. */
    rexStartDate?: string | null;
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
      letType: body.letType === "hmo" || body.letType === "home" ? body.letType : null,
    });
    /* The agent changed the move-in date on the first screen: put it on the
       REX application too (James, 6 Oct 2026). Only on a fresh pack - a pack
       re-opened keeps its own date, and a later change goes through PATCH. */
    let rexMoveIn: { ok: boolean; note: string } | null = null;
    if (
      created.moveInDate &&
      body.rexStartDate !== undefined &&
      created.moveInDate !== (body.rexStartDate ?? null) &&
      created.moveInDate === (body.moveInDate ?? "").slice(0, 10)
    ) {
      rexMoveIn = await moveInToRex(created.applicationRef, created.moveInDate, me?.id ?? null);
    }
    return NextResponse.json({ ok: true, case: created, ...(rexMoveIn ? { rexMoveIn } : {}) });
  } catch (e) {
    if (e instanceof PlcRefused) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: publicError(e, "Couldn't start the handover.") },
      { status: 500 }
    );
  }
}
