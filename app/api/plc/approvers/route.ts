import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { plcApprovers, savePlcApprovers } from "@/lib/plc-approvers";

/**
 * GET  /api/plc/approvers  → who may give a PLC pack its final approval
 * POST /api/plc/approvers  → { emails: string[] } replaces the list
 *
 * Changing it is a permissions change, so it needs manage:roles (owner only),
 * the same as handing out a role.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:roles"))) {
    return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, emails: await plcApprovers() });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "manage:roles");
  if (!me) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  let body: { emails?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  try {
    const emails = await savePlcApprovers(Array.isArray(body.emails) ? body.emails.map(String) : [], me.name);
    return NextResponse.json({ ok: true, emails });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't save." }, { status: 400 });
  }
}
