import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import {
  deleteFinding, getInspection, logEvent, moveInspection, saveFinding, type Finding, type Move,
} from "@/lib/inspections";
import { emailsForMove, outcomeLine } from "@/lib/inspection-emails";
import { createOrder } from "@/lib/works-orders";
import type { Urgency as NewOrderUrgency } from "@/lib/works-catalogue";

/**
 * One inspection: read it with its findings and timeline, or move it along.
 *
 * PATCH takes a Move (lib/inspections) - ask_access, book, confirm, visited,
 * no_access, report, report_sent, close, cancel, note, file - or a finding
 * to save or delete. Every move writes a line on the timeline under the
 * person's name, and any email it earns is logged there with its outcome.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const found = await getInspection(id);
  if (!found) return NextResponse.json({ ok: false, error: "No such inspection." }, { status: 404 });
  return NextResponse.json({ ok: true, ...found });
}

type Body =
  | ({ finding: Partial<Finding> & { room: string } } & { action?: never })
  | ({ deleteFinding: string } & { action?: never })
  /* Turn one finding into a works order. The agent names the trade and the
     urgency, because neither is on the finding and neither is ours to guess:
     "window catch does not hold shut" is a locksmith or a joiner depending on
     the window, and how fast it matters is a judgement made standing in front
     of it. */
  | ({ raiseWorksOrder: { findingId: string; category: string; urgency: string } } & { action?: never })
  | Move;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
  const me = subject ?? actor;
  const by = me.name || me.email;

  try {
    /* A finding is not a move - it is a line in the report - so it saves on
       its own and only then does the step get re-read. */
    if ("finding" in body && body.finding) {
      const saved = await saveFinding(id, body.finding, by);
      await logEvent(id, by, "finding", `${[saved.room, saved.item].filter(Boolean).join(" - ")} recorded as ${saved.condition}.`);
      const after = await getInspection(id);
      return NextResponse.json({ ok: true, ...after });
    }
    /* ── A finding becomes a job ────────────────────────────────────────
       The screen has been telling agents to "Raise it on Maintenance and it
       carries from there", which meant retyping the room, the item and what
       was seen into a second screen - and, every time somebody did not, a
       finding marked "raise a works order" that quietly never became one.
       `works_order_id` has been on the finding since the table was written;
       this is the thing that fills it in. */
    if ("raiseWorksOrder" in body && body.raiseWorksOrder) {
      const { findingId, category, urgency } = body.raiseWorksOrder;
      const found = await getInspection(id);
      if (!found) return NextResponse.json({ ok: false, error: "No such inspection." }, { status: 404 });
      const f = found.findings.find((x) => x.id === findingId);
      if (!f) return NextResponse.json({ ok: false, error: "No such finding." }, { status: 404 });
      if (f.worksOrderId) return NextResponse.json({ ok: false, error: "That one already has a works order." }, { status: 400 });

      const i = found.inspection;
      const order = await createOrder(
        {
          kind: "repair",
          propertyId: i.propertyId,
          propertyName: i.propertyName,
          locality: i.locality,
          landlord: i.landlord,
          landlordEmail: i.landlordEmail,
          tenant: i.tenant,
          tenantEmail: i.tenantEmail,
          tenantPhone: i.tenantPhone,
          /* The room is the title's context - "Bedroom 2 - window catch" is
             what a contractor needs to find it. */
          title: [f.room, f.item].filter(Boolean).join(" - ") || "From a property visit",
          description: f.note,
          category,
          urgency: (urgency as NewOrderUrgency) ?? "routine",
          /* Already one of the options on a works order, from before this
             existed - the system expected inspections to feed it. */
          reportedBy: "Inspection",
          rehearsal: i.rehearsal,
        },
        by
      );
      await saveFinding(id, { ...f, worksOrderId: order.id }, by);
      await logEvent(id, by, "works_order", `${[f.room, f.item].filter(Boolean).join(" - ")} raised as works order ${order.ref}.`);
      const after = await getInspection(id);
      return NextResponse.json({ ok: true, ...after, worksOrder: { id: order.id, ref: order.ref } });
    }

    if ("deleteFinding" in body && body.deleteFinding) {
      await deleteFinding(body.deleteFinding);
      const after = await getInspection(id);
      return NextResponse.json({ ok: true, ...after });
    }

    const move = body as Move;
    if (typeof move.action !== "string") return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
    const inspection = await moveInspection(id, move, by);
    const found = await getInspection(id);
    const emails = await emailsForMove(inspection, move.action, me, found?.findings ?? []).catch(() => []);
    for (const e of emails) await logEvent(id, "TLE OS", "email", outcomeLine(e));
    const after = await getInspection(id);
    return NextResponse.json({ ok: true, ...after, emails });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't work." }, { status: 400 });
  }
}
