import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability } from "@/lib/admin";
import { record } from "@/lib/audit";
import { isLookLevel, isLookScreen } from "@/lib/new-look";
import { lookRows, setLookLevel } from "@/lib/new-look-store";

/**
 * The new-look switches, from Admin, Switches.
 *
 *   GET                       → every screen's position
 *   PATCH { screen, level }   → move one screen
 *
 * manage:switches, the same as the area switches. No typed confirmation: it
 * changes what a colleague sees, never what reaches a customer. Audited.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:switches"))) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ ok: true, screens: await lookRows() });
}

export async function PATCH(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return new NextResponse(null, { status: 404 });
  const { screen, level } = (await req.json().catch(() => ({}))) as { screen?: string; level?: string };
  if (!isLookScreen(screen) || !isLookLevel(level)) return NextResponse.json({ ok: false, error: "Which screen, and which position?" }, { status: 400 });
  try {
    await setLookLevel(screen, level, me.email);
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That did not save.") }, { status: 400 });
  }
  await record({ kind: "look_changed", actorId: me.id, actorEmail: me.email, detail: `${screen} -> ${level}` });
  return NextResponse.json({ ok: true, screens: await lookRows() });
}
