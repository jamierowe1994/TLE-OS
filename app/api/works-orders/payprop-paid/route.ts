import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { checkPayPropPaid } from "@/lib/works-payprop-paid";

/**
 * POST → look in PayProp for the contractor invoices waiting to be paid, and
 * tick off the ones it has paid out of the rent (lib/works-payprop-paid).
 * Asked by Contractors > To pay and by a job with its invoice in, on opening.
 *
 * Any member of staff may ask: it reads PayProp, never writes to it, and only
 * moves a job from "invoiced" to "paid" on PayProp's word. It answers with
 * which jobs moved, so the page can read them again, and nothing else.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const result = await checkPayPropPaid();
  return NextResponse.json(result.ok ? { ...result, marked: result.marked.map((m) => m.id) } : result);
}
