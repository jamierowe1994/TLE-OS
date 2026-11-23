import { NextRequest, NextResponse } from "next/server";
import { depositActor } from "@/lib/deposit-access";
import { hasDb } from "@/lib/db";
import { publicError } from "@/lib/public-error";
import { depositRegister, STATUS_CHOICES } from "@/lib/deposit-audit";

/**
 * GET /api/admin/deposits - the deposit register (lib/deposit-audit) for
 * Admin > Compliance > Deposits. Everyone who can open Admin (James, 19 Nov
 * 2026: "everyone in admin should be able to see it"), and Michael on his
 * compliance desk (23 Nov 2026, lib/deposit-access). Read fresh every
 * time; a failure is an error, never an older copy.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await depositActor(req);
  if (!me) return NextResponse.json({ ok: false, error: "The deposit register isn't on your account. Ask James if you need it." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  try {
    const register = await depositRegister();
    return NextResponse.json({ ok: true, ...register, choices: STATUS_CHOICES }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[deposits] register", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: publicError(e, "The deposit register couldn't be read just now.") }, { status: 500 });
  }
}
