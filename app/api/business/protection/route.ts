import { NextResponse } from "next/server";
import { getProtectionBook } from "@/lib/business/payprop-tags";
import { getRlpTakeUp } from "@/lib/business/payprop-income";
import { previousMonth } from "@/lib/business/format";

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
    /* Alongside the tags, the premium payments for the month just closed -
       the only RLP record E&W will currently let us read. See getRlpTakeUp.
       Null while it gathers; the tab polls. */
    const [book, rlp] = await Promise.all([
      getProtectionBook(),
      getRlpTakeUp(previousMonth()).catch(() => null),
    ]);
    const rlpPayments = rlp
      ? { month: rlp.month, byAccount: rlp.byAccount.map(({ account, properties }) => ({ account, properties })) }
      : null;
    return NextResponse.json({ ...book, rlpPayments });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
