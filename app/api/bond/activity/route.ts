import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { recentActivity } from "@/lib/bond";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no database" }, { status: 503 });
  return NextResponse.json({ ok: true, activity: await recentActivity(200) });
}
