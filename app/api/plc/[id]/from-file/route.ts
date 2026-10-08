import { NextRequest, NextResponse } from "next/server";
import { PlcRefused } from "@/lib/plc-store";
import { missingDocuments } from "@/lib/plc";
import { pullFileDocs } from "@/lib/plc-from-file";
import { actorName } from "@/lib/plc-actor";

/**
 * POST /api/plc/<id>/from-file → file what the OS already holds into this
 * pack (lib/plc-from-file): the home's Documents tab, its certificates on
 * file, and the landlord's ID and AML from their other homes. The wizard calls
 * it when a pack opens; calling it again only picks up what is new.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { tenants?: string[]; landlord?: string | null; propertyId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    /* No names is fine: the reader just has less to go on. */
  }
  try {
    const out = await pullFileDocs(id, {
      by: await actorName(req, "Agent"),
      tenants: Array.isArray(body.tenants) ? body.tenants.map(String).slice(0, 8) : [],
      landlord: typeof body.landlord === "string" ? body.landlord : null,
      propertyId: typeof body.propertyId === "string" && /^[\w-]{1,40}$/.test(body.propertyId) ? body.propertyId : null,
    });
    return NextResponse.json({
      ok: true,
      case: out.case,
      added: out.added,
      left: out.left,
      missing: missingDocuments(out.case).map((m) => m.id),
    });
  } catch (e) {
    const status = e instanceof PlcRefused ? 409 : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't work." }, { status });
  }
}
