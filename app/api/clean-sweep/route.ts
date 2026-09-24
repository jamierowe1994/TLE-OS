import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { sweepList } from "@/lib/clean-sweep";

/** The clean sweep's list: every home, oldest portfolio first, with what it still needs (lib/clean-sweep). */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:clean-sweep")) return NextResponse.json({ ok: false, error: "The clean sweep is for the office." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, homes: [] });
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
