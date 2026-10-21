import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { record } from "@/lib/audit";
import { rexStatusView, writeRexSetting, type RexMode } from "@/lib/rex-outage";
import { queueRows, replayQueue, retryRow, skipRow } from "@/lib/rex-queue";
import { snapshotProgress, startSnapshotRun } from "@/lib/rex-snapshot";
import { catchupProgress, checkAll, handList, markHandDone, outageStart, skipItem, startCatchup } from "@/lib/rex-catchup";

/**
 * Admin > REX status (21 Oct 2026, lib/rex-outage).
 *
 * GET  → the switch, the copy, what is waiting to go.
 * POST → { action: "mode", mode, plannedFrom?, plannedUntil? }
 *        { action: "snapshot" }            take the copy now
 *        { action: "replay" }              send what is waiting now
 *        { action: "retry" | "skip", id }  a row that stopped the run
 *        { action: "catchup", phase?, since? }  the morning catch-up (lib/rex-catchup)
 *        { action: "catchup-skip", phase, id }  leave one record out
 *        { action: "hand-done", id }       a by-hand row redone
 * GET ?catchup=1&since= → what each phase would send, and the by-hand list
 *
 * Owner only (manage:switches), and every change is in the audit trail.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:switches"))) return new NextResponse(null, { status: 404 });
  /* The catch-up's look at every phase (?catchup=1): asked for by the page
     on its own button, not every ten seconds, as it reads several tables. */
  if (req.nextUrl.searchParams.get("catchup")) {
    const given = req.nextUrl.searchParams.get("since");
    const since = given && Number.isFinite(Date.parse(given)) ? new Date(given) : await outageStart();
    const [phases, hand] = await Promise.all([checkAll(since), handList(since)]);
    return NextResponse.json({ since: since.toISOString(), phases, hand, progress: catchupProgress() });
  }
  const [status, queue] = await Promise.all([rexStatusView({ detail: true }), queueRows(200)]);
  return NextResponse.json({ status, queue, run: snapshotProgress(), catchup: catchupProgress() });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return new NextResponse(null, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    mode?: RexMode;
    plannedFrom?: string | null;
    plannedUntil?: string | null;
    id?: string;
    phase?: string;
    since?: string;
  };
  const by = me.email;

  if (body.action === "mode") {
    if (body.mode && !["auto", "down", "up"].includes(body.mode)) {
      return NextResponse.json({ ok: false, error: "Auto, down or up." }, { status: 400 });
    }
    const next: Parameters<typeof writeRexSetting>[0] = {};
    if (body.mode) next.mode = body.mode;
    if (body.plannedFrom !== undefined) next.plannedFrom = body.plannedFrom || null;
    if (body.plannedUntil !== undefined) next.plannedUntil = body.plannedUntil || null;
    const value = await writeRexSetting(next, by);
    await record({
      kind: "rex_status_changed",
      actorId: me.id,
      actorEmail: by,
      detail: `REX status: ${value.mode}${value.plannedFrom ? `, planned ${value.plannedFrom} to ${value.plannedUntil}` : ""}`,
    });
    return NextResponse.json({ ok: true, setting: value });
  }
  if (body.action === "snapshot") {
    const started = startSnapshotRun(by, { origin: req.nextUrl.origin, asUser: me.id });
    return NextResponse.json({ ok: started.ok, error: started.error, run: snapshotProgress() });
  }
  if (body.action === "replay") {
    return NextResponse.json({ ok: true, report: await replayQueue(by) });
  }
  if (body.action === "catchup") {
    const since = body.since && Number.isFinite(Date.parse(body.since)) ? new Date(body.since) : await outageStart();
    const started = startCatchup(by, since, body.phase || undefined);
    return NextResponse.json({ ok: started.ok, error: started.error, progress: catchupProgress() });
  }
  if (body.action === "catchup-skip" && body.phase && body.id) {
    await skipItem(body.phase, body.id, by);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "hand-done" && body.id) {
    await markHandDone(body.id, by);
    return NextResponse.json({ ok: true });
  }
  if ((body.action === "retry" || body.action === "skip") && body.id) {
    if (body.action === "retry") await retryRow(body.id);
    else await skipRow(body.id, by);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Which action?" }, { status: 400 });
}
