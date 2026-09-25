import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { sectionQueue, SECTION_BY_KEY, sweepList, type SectionKey } from "@/lib/clean-sweep";

/** The clean sweep's list: every home, oldest portfolio first, with what it still needs (lib/clean-sweep). */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:clean-sweep")) return NextResponse.json({ ok: false, error: "The clean sweep is for the office." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, homes: [] });
  const section = req.nextUrl.searchParams.get("section") as SectionKey | null;
  if (section) {
    /* One person's queue in the second pass: Susan's homes, oldest first, with their section's gaps. */
    if (!SECTION_BY_KEY.has(section)) return NextResponse.json({ ok: false, error: "No such section." }, { status: 400 });
    const queue = await sectionQueue(section);
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    return NextResponse.json({ ok: true, stored: true, queue, progress: { total: queue.length, done: queue.filter((h) => h.doneAt).length, today: queue.filter((h) => h.doneAt === day).length } });
  }
  const homes = await sweepList();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return NextResponse.json({
    ok: true,
    stored: true,
    homes,
    progress: {
      total: homes.filter((h) => h.onSheet).length,
      checked: homes.filter((h) => h.onSheet && h.checkedAt).length,
      today: homes.filter((h) => h.checkedAt === today).length,
    },
  });
}
