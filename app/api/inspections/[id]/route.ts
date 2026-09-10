import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import {
  deleteFinding, getInspection, logEvent, moveInspection, saveFinding, type Finding, type Move,
} from "@/lib/inspections";
import { emailsForMove, outcomeLine } from "@/lib/inspection-emails";

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
