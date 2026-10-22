import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
import { answerPreview } from "@/lib/automations/runner";
import { caller } from "@/lib/automations/http";

/**
 * The agent's answer to an automation's first send: { runId, send }. Send
 * does it now and makes the automation live; not sending drops just this one.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { runId?: string; send?: boolean };
  if (!b.runId) return NextResponse.json({ error: "Which one?" }, { status: 400 });
  try {
    const r = await answerPreview({ runId: b.runId, me: who.me, send: b.send === true, origin: publicOrigin(req) });
    return r.ok ? NextResponse.json({ ok: true, run: r.run }) : NextResponse.json({ error: r.error }, { status: 409 });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, "It couldn't be answered just now.") }, { status: 500 });
  }
}
