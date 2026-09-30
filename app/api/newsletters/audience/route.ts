import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { audience } from "@/lib/newsletters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Everybody a newsletter could go to, marked signed up or not (lib/newsletters audience). */
export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ ok: true, people: await audience() });
}
