import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { loadMoneySources, matchDealMoney } from "@/lib/business/deposit-match";
import { normaliseEmail } from "@/lib/users";

/**
 * GET /api/pretenancy/money-debug → why each live deal did or did not match
 * money in PayProp. For the wiring tab. Names and amounts only; no emails
 * are echoed, only whether one was found.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const [deals, src] = await Promise.all([getAllPropolyDeals(), loadMoneySources()]);
  if (!deals) return NextResponse.json({ ok: false, error: "Propoly did not answer." });
  if (!src) return NextResponse.json({ ok: false, error: "No PayProp account reachable." });
  const emails = new Map(src.tenants.filter((t) => t.email).map((t) => [t.email as string, t]));
  const out = deals
    .filter((d) => d.statusKey !== "cancelled")
    .map((d) => {
      const tenants = d.app.tenants.map((t) => {
        const e = t.email ? normaliseEmail(t.email) : null;
        const hit = e ? emails.get(e) : undefined;
        const bal = hit ? src.balances.get(hit.id) : undefined;
        return {
          name: t.name,
          hasEmail: Boolean(e),
          inPayPropByEmail: Boolean(hit),
          payPropName: hit?.name ?? null,
          balance: bal?.balance ?? null,
          depositBalance: bal?.depositBalance ?? null,
          lastPayment: bal?.lastPayment ?? null,
          incoming: hit ? src.incoming.filter((i) => i.tenantId === hit.id).map((i) => ({ amount: i.amount, reconciled: i.reconciled })) : [],
        };
      });
      const m = matchDealMoney(d, src);
      return {
        property: d.app.propertyName,
        status: d.statusKey,
        holdingFee: d.app.propoly?.holdingFee ?? null,
        deposit: d.app.propoly?.deposit ?? null,
        flatfair: Boolean(d.app.propoly?.depositReplacement),
        standingOrderRef: d.app.propoly?.standingOrderRef ?? null,
        tenants,
        matched: { holding: m.holding?.status ?? null, deposit: m.deposit?.status ?? null },
      };
    });
  return NextResponse.json({
    ok: true,
    payprop: { tenants: src.tenants.length, withEmail: emails.size, balances: src.balances.size, incoming: src.incoming.length },
    deals: out,
  });
}
