import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { record } from "@/lib/audit";
import { addAreaTester, areaRows, areaTesters, isLevel, removeAreaTester, setAreaLevel } from "@/lib/area-access";

/**
 * The area switches, from Admin, Switches.
 *
 *   GET                         → every area's position, and the testers
 *   PATCH  { area, level }      → move one area
 *   POST   { email }            → make somebody a tester
 *   DELETE { email }            → stop them being one
 *
 * manage:switches, the same as the send switches. No typed confirmation: moving
 * an area changes what a colleague sees, not what reaches a customer, and the
 * switches that DO reach a customer keep theirs. Every change is audited.
 *
 * Takes effect within a few seconds, not instantly: the middleware holds each
 * person's answer briefly so a busy screen is not a database read per click.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:switches"))) return new NextResponse(null, { status: 404 });
  const [areas, testers] = await Promise.all([areaRows(), areaTesters()]);
  return NextResponse.json({ ok: true, areas, testers });
}

export async function PATCH(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return new NextResponse(null, { status: 404 });
  const { area, level } = (await req.json().catch(() => ({}))) as { area?: string; level?: string };
  if (!area || !isLevel(level)) return NextResponse.json({ ok: false, error: "Which area, and which position?" }, { status: 400 });
  try {
    await setAreaLevel(area, level, me.email);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That did not save." }, { status: 400 });
  }
  await record({ kind: "area_changed", actorId: me.id, actorEmail: me.email, detail: `${area} -> ${level}` });
  return NextResponse.json({ ok: true, areas: await areaRows() });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return new NextResponse(null, { status: 404 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ ok: false, error: "That does not look like an email address." }, { status: 400 });
  }
  await addAreaTester(email, me.email);
  await record({ kind: "area_tester_changed", actorId: me.id, actorEmail: me.email, subjectEmail: email.trim().toLowerCase(), detail: "made a tester" });
  return NextResponse.json({ ok: true, testers: await areaTesters() });
}

export async function DELETE(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return new NextResponse(null, { status: 404 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ ok: false, error: "Whose?" }, { status: 400 });
  await removeAreaTester(email);
  await record({ kind: "area_tester_changed", actorId: me.id, actorEmail: me.email, subjectEmail: email.trim().toLowerCase(), detail: "no longer a tester" });
  return NextResponse.json({ ok: true, testers: await areaTesters() });
}
