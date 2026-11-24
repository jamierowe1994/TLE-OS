import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { PlcRefused, setNote } from "@/lib/plc-store";
import { actorName, currentUser } from "@/lib/plc-actor";
import { can } from "@/lib/roles";

/**
 * POST /api/plc/<id>/notes  { key, text }
 *
 * A note on one check (or one of Susan's lines) on the review screen (Susan
 * Liles, 24 Nov 2026, ticket 668c196d): what the first checker saw, written
 * where she saw it, so the final approver reads it instead of checking the
 * whole pack again. Empty text clears it.
 *
 * Internal: it is never put into an email to an agent or a landlord.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Long enough for anything said about one document, short enough to stay a note. */
const MAX = 2000;

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const me = await currentUser(req);
  const dryRun = process.env.NODE_ENV !== "production";
  if (!dryRun && !(me && can(me.role, "work:plc"))) {
    return NextResponse.json({ ok: false, error: "Notes are for whoever works the PLC queue." }, { status: 403 });
  }
  let body: { key?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX) : "";
  if (!key) return NextResponse.json({ ok: false, error: "Which check?" }, { status: 400 });
  try {
    const updated = await setNote(
      id,
      key,
      text ? { text, by: await actorName(req, "Compliance"), byEmail: me?.email ?? null, at: new Date().toISOString() } : null
    );
    return NextResponse.json({ ok: true, notes: updated.notes ?? {} });
  } catch (e) {
    const status = e instanceof PlcRefused ? 409 : 500;
    return NextResponse.json({ ok: false, error: publicError(e, "That note didn't save.") }, { status });
  }
}
