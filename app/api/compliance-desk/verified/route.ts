import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { sendTargetFor, verifiedToSend } from "@/lib/compliance-desk";

/**
 * The desk's Verified list (Jo, 21 Oct 2026; lib/compliance-desk verifiedToSend).
 *
 * GET               → certificates verified and not yet with the tenants,
 *                     oldest first, then the ones sent in the last fortnight.
 * GET ?target=<id>  → where Email Certificates opens for that certificate: the
 *                     home's let, every let at the house with a tenant, and
 *                     the certificate ticked. The send itself is
 *                     /api/portfolio/send-to-tenants, with its own gate.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, reason: "No database on this environment.", items: [] });
  try {
    const target = (req.nextUrl.searchParams.get("target") ?? "").trim();
    if (target) {
      const t = await sendTargetFor(target);
      if ("error" in t) return NextResponse.json({ ok: false, error: t.error }, { status: 404 });
      return NextResponse.json({ ok: true, ...t });
    }
    return NextResponse.json({ ok: true, stored: true, items: await verifiedToSend() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The verified certificates couldn't be read just now. Try again in a minute.") }, { status: 502 });
  }
}
