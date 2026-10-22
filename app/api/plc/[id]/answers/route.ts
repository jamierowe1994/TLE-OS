import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { getCase } from "@/lib/plc-store";
import { currentUser } from "@/lib/plc-actor";
import { can } from "@/lib/roles";
import { tenantAnswersFor } from "@/lib/plc-tenant-answers";

/**
 * GET /api/plc/<id>/answers → what the tenants said, for the Propoly deal
 *
 * Its own read rather than part of GET /api/plc/<id>: it reads the
 * application, the form, every passport and the guarantors, and the pack
 * itself should not wait on any of that. The panel asks for it once, beside
 * the pack, and shows it loading.
 *
 * Read only. Dates of birth and incomes, so it is for whoever works the PLC
 * queue and the agent who sent the pack, nobody else.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await getCase(id);
  if (!c) return NextResponse.json({ ok: false, error: "No handover with that reference." }, { status: 404 });

  const me = await currentUser(req);
  const dryRun = process.env.NODE_ENV !== "production";
  const theirs = Boolean(me?.email && c.agentEmail && me.email.toLowerCase() === c.agentEmail.toLowerCase());
  if (!dryRun && !(me && (can(me.role, "work:plc") || theirs))) {
    return NextResponse.json({ ok: false, error: "The tenants' answers are for compliance." }, { status: 403 });
  }

  try {
    return NextResponse.json({ ok: true, answers: await tenantAnswersFor(c) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Couldn't read the tenants' answers.") }, { status: 502 });
  }
}
