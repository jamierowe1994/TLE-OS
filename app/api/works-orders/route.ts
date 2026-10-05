import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { worksSnapshotAround } from "@/lib/works-trend";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { createOrder, listOrders, listContractors, worksSummary, logEvent, KINDS, type Kind, type NewOrder } from "@/lib/works-orders";
import { emailsForMove, outcomeLine } from "@/lib/works-emails";
import { alreadyTakenOn, carriedJobs, markTakenOn, withCarried } from "@/lib/works-carried";

/**
 * Works orders: the list, the figures, and raising one.
 *
 * GET  ?kind=repair|planned  ?open=1  ?property=<rex id>  → the jobs, the
 *      summary counts, and the contractors book (one call, one screen).
 * POST → raise a job. Any signed-in member of staff; the job records who.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", orders: [], contractors: [], summary: null });
  const kindRaw = req.nextUrl.searchParams.get("kind");
  const kind = KINDS.includes(kindRaw as Kind) ? (kindRaw as Kind) : null;
  const open = req.nextUrl.searchParams.get("open") === "1";
  const propertyId = req.nextUrl.searchParams.get("property");
  const me = subject ?? actor;
  /* `lastMonth` is the snapshot nearest to thirty days ago, or null when we
     do not hold one yet - the board draws a delta only when there is a real
     one to draw. See lib/works-trend.ts. */
  const [orders, contractors, own, lastMonth, carried] = await Promise.all([
    listOrders({ kind, open, propertyId }),
    listContractors(me.id),
    worksSummary(),
    worksSnapshotAround(30).catch(() => null),
    /* REX PM's open jobs not yet taken on here (1 Oct 2026, lib/works-carried).
       A failed read is said out loud, never shown as an empty list. */
    carriedJobs().catch(() => null),
  ]);
  const summary = carried ? withCarried(own, carried.jobs) : own;
  return NextResponse.json({
    ok: true, live: true, orders, contractors, summary,
    carried: carried?.jobs ?? [],
    /* Planned jobs a certificate on file has since finished (5 Oct 2026). */
    carriedDone: carried?.done ?? [],
    carriedReadAt: carried?.readAt ?? null,
    ...(carried ? {} : { carriedError: "The jobs copied across from the old system couldn't be read just now, so the figures leave them out. Try again in a minute." }),
    lastMonth: lastMonth?.summary ?? null,
    lastMonthOn: lastMonth?.day ?? null,
    canCorporate: can(actor.role, "see:business"),
  });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as (Partial<NewOrder> & { rexpmTaskId?: string; rexpmReportedOn?: string | null; rexpmDueOn?: string | null }) | null;
  if (!b || !b.propertyName?.trim() || !b.title?.trim() || !b.category) {
    return NextResponse.json({ ok: false, error: "A job needs a property, a title and a category." }, { status: 400 });
  }
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    /* Taking on a job copied across from the old system: once only, and
       quietly - it was reported long ago and nobody needs telling again. */
    const taskId = typeof b.rexpmTaskId === "string" && b.rexpmTaskId ? b.rexpmTaskId : null;
    if (taskId && (await alreadyTakenOn(taskId))) {
      return NextResponse.json({ ok: false, error: "Someone has already taken this job on." }, { status: 409 });
    }
    const order = await createOrder({ ...b, kind: b.kind ?? "repair", propertyName: b.propertyName, title: b.title, category: b.category }, by);
    if (taskId) {
      await markTakenOn(order.id, { taskId, reportedOn: b.rexpmReportedOn ?? null, dueOn: b.rexpmDueOn ?? null });
      await logEvent(order.id, by, "note", "Taken on from the old system, where it was already in progress. Nobody was emailed.");
      return NextResponse.json({ ok: true, order, emails: [] });
    }
    /* The step emails, after the job is safe. Each outcome goes on the
       timeline so the sheet says who was told. */
    const emails = await emailsForMove(order, "raised", subject ?? actor).catch(() => []);
    for (const e of emails) await logEvent(order.id, "TLE OS", "email", outcomeLine(e));
    return NextResponse.json({ ok: true, order, emails });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not raise the job." }, { status: 400 });
  }
}
