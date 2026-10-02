import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { leadScope } from "@/lib/scope";
import { leadsForListing, salesAmong } from "@/lib/lead-ledger";
import { hiddenLeadIds } from "@/lib/hidden-leads";
import { ago } from "@/lib/rex-leads";

/**
 * ONE LISTING'S ENQUIRIES (2 Oct 2026).
 *
 * The listing drawer used to fetch the whole Leads board (/api/leads, up to
 * five hundred leads with their messages) and throw away all but the few for
 * this listing, in the browser, every time a listing was opened. This asks
 * the lead ledger for this listing's leads only (lib/lead-ledger,
 * leadsForListing - the same os_leads rows the board is drawn from) and
 * applies the board's own three rules on the server:
 *
 *   - whose: an agent sees the leads assigned to them, as on their board;
 *     the owner and see-everything roles see them all (lib/scope leadScope)
 *   - removed by hand: never shown (lib/hidden-leads)
 *   - sales: dropped, as the board drops them (salesAmong)
 *
 * Same fields the drawer read off each board lead, so the drawer only
 * changes the address it asks.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = String(id ?? "").trim();
  if (!/^-?\d+$/.test(listingId)) return NextResponse.json({ ok: false, error: "Which listing?", leads: [] }, { status: 400 });

  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first.", leads: [] }, { status: 401 });

  const scope = await leadScope(req);
  if (scope.unlinked) return NextResponse.json({ ok: true, unlinked: true, leads: [] });

  try {
    const [all, hidden] = await Promise.all([
      leadsForListing(listingId, 100),
      hiddenLeadIds().catch(() => new Set<string>()),
    ]);
    const mine = all.filter(
      (l) => l && l.id && !hidden.has(l.id) && (!scope.rexUserId || l.assigneeId === scope.rexUserId)
    );
    const sales = await salesAmong(mine.map((l) => l.id)).catch(() => new Set<string>());
    const leads = mine
      .filter((l) => !sales.has(l.id))
      .map((l) => ({
        id: l.id,
        name: l.name,
        source: l.source,
        /* The ledger keeps "3h ago" as it read when filed; said again from
           receivedAt, as the board does (app/api/leads fromLedger). */
        received: l.receivedAt ? ago(Math.floor(new Date(l.receivedAt).getTime() / 1000)) : l.received,
        receivedAt: l.receivedAt,
        email: l.email,
        phone: l.phone,
        enquiryMessage: l.enquiryMessage,
        listingId: l.listingId,
      }));
    return NextResponse.json({ ok: true, live: true, scope: scope.label, leads });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "The enquiries did not load.", leads: [] }, { status: 502 });
  }
}
