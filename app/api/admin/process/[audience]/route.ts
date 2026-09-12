import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { loadProcess, resetProcess, saveProcess } from "@/lib/process/store";
import type { ProcessMap } from "@/lib/process/types";

/** Read, save or reset one audience's process map. Admin only. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ audience: string }> }) {
  if (!(await requireCapability(req, "see:reports"))) return new NextResponse(null, { status: 404 });
  const { audience } = await ctx.params;
  const map = await loadProcess(audience);
  if (!map) return NextResponse.json({ error: "No such process." }, { status: 404 });
  return NextResponse.json({ ok: true, map });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ audience: string }> }) {
  const who = await requireCapability(req, "see:reports");
  if (!who) return new NextResponse(null, { status: 404 });
  const { audience } = await ctx.params;
  if (!(await loadProcess(audience))) return NextResponse.json({ error: "No such process." }, { status: 404 });
  let body: { map?: ProcessMap } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* falls through */
  }
  if (!body.map?.nodes) return NextResponse.json({ error: "Expected a map." }, { status: 400 });
  try {
    const map = await saveProcess(audience, body.map, who.id);
    return NextResponse.json({ ok: true, map });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ audience: string }> }) {
  if (!(await requireCapability(req, "see:reports"))) return new NextResponse(null, { status: 404 });
  const { audience } = await ctx.params;
  await resetProcess(audience);
  const map = await loadProcess(audience);
  return NextResponse.json({ ok: true, map });
}
