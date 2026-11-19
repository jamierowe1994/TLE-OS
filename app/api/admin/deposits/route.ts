import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { publicError } from "@/lib/public-error";
import { depositRegister, STATUS_CHOICES } from "@/lib/deposit-audit";

/**
 * GET /api/admin/deposits - the deposit register (lib/deposit-audit) for
 * Admin > Compliance > Deposits. Everyone who can open Admin (James, 19 Nov
 * 2026: "everyone in admin should be able to see it"). Read fresh every
 * time; a failure is an error, never an older copy.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "admin:open");
  if (!me) return NextResponse.json({ ok: false, error: "Only Admin can see the deposit register." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  try {
    const register = await depositRegister();
    return NextResponse.json({ ok: true, ...register, choices: STATUS_CHOICES }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[deposits] register", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: publicError(e, "The deposit register couldn't be read just now.") }, { status: 500 });
  }
}
