import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { closeCarried, reopenCarried } from "@/lib/works-carried";

/**
 * Close an old-system maintenance job with a note, or reopen one (Sean
 * McMahon, 26 Oct 2026: "I just want an easy way, just put a note on it,
 * close it down").
 *
 * POST { taskId, note }              → closed: off the board and every count.
 * POST { taskId, action: "reopen" }  → back on the board.
 *
 * The same people as Take it on: any signed-in member of staff, and the
 * close says who. Ours alone - nothing is written to the old system.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { taskId?: unknown; note?: unknown; action?: unknown } | null;
  const taskId = typeof b?.taskId === "string" ? b.taskId.trim() : "";
  if (!taskId) return NextResponse.json({ ok: false, error: "Which job?" }, { status: 400 });
  const me = subject ?? actor;
  const by = me.name || me.email;
  try {
    if (b?.action === "reopen") {
      const done = await reopenCarried(taskId, by);
      return done ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "That job isn't closed." }, { status: 404 });
    }
    const out = await closeCarried(taskId, typeof b?.note === "string" ? b.note : "", { name: by, id: me.id });
    return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: out.error }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not close the job.") }, { status: 400 });
  }
}
