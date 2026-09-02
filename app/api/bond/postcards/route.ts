import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { postcardProvider, postcards } from "@/lib/bond";

/** The postcards so far and whether the print house is connected. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: false, reason: "no database" }, { status: 503 });
  return NextResponse.json({ ok: true, provider: postcardProvider(), postcards: await postcards() });
}
