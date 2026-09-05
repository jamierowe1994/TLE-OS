import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { payPropAccounts, payPropGetAll } from "@/lib/business/payprop";

/**
 * GET /api/payprop/invoice-categories → what PayProp calls its invoices.
 *
 * A read-only probe for the wiring tab. It exists because the watcher's
 * "holding fee in" matched nothing on 38 deals at seed time (4 Sep): the
 * register only counts an invoice whose category is literally "Holding
 * deposit", and whether either agency raises one under that name, another
 * name, or none at all is a fact only PayProp can settle. So: every invoice
 * category on each agency with a count, and any category that so much as
 * mentions holding, with a sample of what it is raised against.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const out: Record<string, unknown> = {};
  for (const account of payPropAccounts()) {
    let rows: Row[] = [];
    try {
      rows = await payPropGetAll<Row>(account, "export/invoices");
    } catch (e) {
      out[account] = { error: e instanceof Error ? e.message : "read failed" };
      continue;
    }
    const counts = new Map<string, number>();
    const holding: Array<{ category: string; amount: unknown; from: unknown; property: string | null; description: string | null }> = [];
    for (const inv of rows) {
      const cat = str((inv.category as Row | undefined)?.name) ?? "(no category)";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
      const desc = str(inv.description) ?? str(inv.reference);
      if (/hold/i.test(cat) || /hold/i.test(desc ?? "")) {
        if (holding.length < 12) {
          const prop = inv.property as Row | undefined;
          holding.push({
            category: cat,
            amount: inv.gross_amount,
            from: inv.from_date,
            property: str(prop?.name) ?? str((prop?.address as Row | undefined)?.first_line),
            description: desc,
          });
        }
      }
    }
    out[account] = {
      invoices: rows.length,
      categories: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
      holdingLike: holding,
      sampleKeys: Object.keys(rows[0] ?? {}),
    };
  }
  return NextResponse.json({ ok: true, accounts: out });
}
