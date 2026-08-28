import { NextResponse } from "next/server";
import { getProtectionBook } from "@/lib/business/payprop-tags";

/**
 * GET /api/admin/protection → managed rent protection, from PayProp's tags.
 *
 * Read-only. See lib/payprop-tags for why tags rather than service levels, and
 * for the reason E&W currently answers 403.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getProtectionBook());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
