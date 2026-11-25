import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { record } from "@/lib/audit";

/**
 * Someone took Steve's offer on the report form instead of sending
 * (lib/report-deflect, 25 Nov 2026). Until now a report the offer stopped
 * left no trace, so there was no telling whether "put it right yourself"
 * worked. One audit line per press; Admin > Tickets counts the week.
 */

export const dynamic = "force-dynamic";

const KINDS = new Set(["edit", "ask", "find"]);

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  if (!actor) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; guide?: unknown; path?: unknown };
  const kind = typeof b.kind === "string" && KINDS.has(b.kind) ? b.kind : null;
  if (!kind) return NextResponse.json({ ok: false }, { status: 400 });
  const guide = typeof b.guide === "string" ? b.guide.slice(0, 80) : "";
  const path = typeof b.path === "string" ? b.path.slice(0, 200) : "";
  await record({ kind: "report_put_right", actorId: actor.id, actorEmail: actor.email, detail: [kind, guide, path].join("|") });
  return NextResponse.json({ ok: true });
}
