import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { documentsForDeal } from "@/lib/tenant-documents";

/**
 * What the tenants on one deal have sent in, for the agent's side of the file.
 *
 * A tenant uploading into the portal with nothing on the agent's screen would
 * be a feature that looks finished and quietly is not: the tenant would see
 * "sent", and nobody here would ever look at it. This is the other end.
 *
 * Staff only. The tenant's own route (/api/tenant/documents) is scoped to
 * their account; this one is scoped to the deal and requires an office login,
 * so the two can never be reached with the wrong kind of session.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, documents: await documentsForDeal(id) });
}
