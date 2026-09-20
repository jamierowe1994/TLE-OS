import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { overview } from "@/lib/agent-compliance";
import { isCheckKind, recordCheck, subjectExists, verifyQueue, worksToCheck } from "@/lib/compliance-desk";

/**
 * Michael's desk: what is waiting on him, and his tick.
 *
 * GET  → the documents to verify, the finished jobs to check, and how many
 *        agents are short. One call, because the dashboard draws all three and
 *        each list page needs its own plus the counts on the rail.
 *        The PROPERTY figures are not here: they come from the compliance book
 *        (/api/compliance/tracker), which walks REX and must never hold up a
 *        list that is one query.
 * POST → { kind, id, state: "verified" | "queried", note? }.
 *
 * Nothing here sends anything. He goes through the agent, never to a landlord.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, reason: "No database on this environment.", verify: [], works: [], agents: null });
  try {
    const [verify, works, o] = await Promise.all([verifyQueue(), worksToCheck(), overview()]);
    /* Agents only: the office's own logins are on the grid but are not who
       "all of the agents are compliant" is about. */
    const agents = o.agents.filter((a) => a.role === "agent");
    return NextResponse.json({
      ok: true,
      stored: true,
      firstName: (me.name || "").split(" ")[0] ?? "",
      verify,
      works,
      agents: {
        total: agents.length,
        short: agents.filter((a) => a.short > 0).length,
        names: agents.filter((a) => a.short > 0).map((a) => ({ userId: a.userId, name: a.name || a.email, short: a.short })),
        requirements: o.requirements.filter((r) => r.required).length,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the desk." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; id?: string; state?: string; note?: string };
  if (!b.kind || !isCheckKind(b.kind) || !b.id) return NextResponse.json({ ok: false, error: "Which one?" }, { status: 400 });
  if (b.state !== "verified" && b.state !== "queried") return NextResponse.json({ ok: false, error: "Verified, or queried?" }, { status: 400 });
  if (b.state === "queried" && !b.note?.trim()) return NextResponse.json({ ok: false, error: "Say what is wrong with it, so the agent knows what to put right." }, { status: 400 });
  if (!(await subjectExists(b.kind, b.id))) return NextResponse.json({ ok: false, error: "That record is not there any more." }, { status: 404 });
  await recordCheck({ kind: b.kind, id: b.id, state: b.state, note: b.note, by: me.name || me.email });
  const [verify, works] = await Promise.all([verifyQueue(), worksToCheck()]);
  return NextResponse.json({ ok: true, verify, works });
}
