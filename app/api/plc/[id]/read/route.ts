import { NextRequest, NextResponse } from "next/server";
import { getCase } from "@/lib/plc-store";
import { keyIsOurs } from "@/lib/r2";
import { readDroppedFile } from "@/lib/plc-read-file";

/**
 * POST /api/plc/<id>/read → which check a just-uploaded file belongs to, and
 * the dates and names on it.
 *
 * Writes nothing. The wizard uploads, asks this, then files the document with
 * the answer. Reading is kept out of the filing request because filing has to
 * happen one at a time (each answer is the whole case) and reading takes
 * seconds: a folder of twenty would otherwise be read in single file.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { key?: string; name?: string; tenants?: string[]; landlord?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const key = (body.key ?? "").trim();
  if (!keyIsOurs(key)) {
    return NextResponse.json({ ok: false, error: "That file reference isn't one of ours." }, { status: 400 });
  }
  const c = await getCase(id);
  if (!c) return NextResponse.json({ ok: false, error: "No pack with that reference." }, { status: 404 });

  const read = await readDroppedFile(
    { key, name: (body.name ?? "").trim() || "Document" },
    {
      address: c.address,
      landlordName: body.landlord ?? null,
      tenantNames: Array.isArray(body.tenants) ? body.tenants.map(String).slice(0, 8) : [],
    }
  );
  return NextResponse.json({ ok: true, read });
}
