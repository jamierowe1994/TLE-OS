import { NextRequest, NextResponse } from "next/server";
import { scopeFor } from "@/lib/scope";
import { rexCall, rexConfigured } from "@/lib/rex";

/**
 * The numbers on an agent's own dashboard.
 *
 * ── Why this route had to exist ───────────────────────────────────────────
 *
 * The dashboard was not connected to anything. "Leads today 14", "Properties
 * 24", "Applications 6" were literals in components/widgets.tsx, and the only
 * live call on the whole screen was /api/news. Five pilot agents would have
 * opened the OS, landed here first, and been shown invented figures about
 * their own business with nothing marking them as fiction — which also breaks
 * the standing rule in CLAUDE.md, in the most visible place in the product.
 *
 * ── Every count is measured, and the fields are not guessable ─────────────
 *
 *   Listings      listing_agent_1_id + system_listing_state
 *   Leads         lead.assignee_id     (bare assignee_id is refused)
 *   Appraisals    agent_1_id
 *   Applications  application.agent_id
 *
 * `system_owner_user_id` works on Listings and is NOT a permissible lead
 * field. They are also different questions — owning a record and chasing it.
 *
 * ── Viewings are absent on purpose ────────────────────────────────────────
 *
 * REX calendar events carry no owning agent, so a per-agent viewings count
 * cannot be produced at all. The portal hit the same wall and recorded it.
 * A tile that quietly showed business-wide viewings next to an agent's own
 * everything-else would be the most misleading number on the screen.
 *
 * ── A failed count is null, never zero ────────────────────────────────────
 *
 * "You have no leads" and "we could not reach REX" are different sentences and
 * an agent would act on the first one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Crit = Array<{ name: string; type?: string; value: string }>;

async function count(service: string, criteria: Crit): Promise<number | null> {
  try {
    const res = await rexCall(service, "search", { criteria, limit: 1 });
    if (!res.ok) return null;
    const total = (res.result as { total?: number | string } | undefined)?.total;
    return total == null ? null : Number(total);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, reason: "REX isn't connected on this environment." });
  }

  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({
      ok: false,
      unlinked: true,
      reason:
        "We can't tell which REX user you are, so these would be somebody else's numbers. Ask James to link your account.",
    });
  }

  const me = scope.rexUserId;
  /* An owner sees the business; an agent sees themselves. Spreading an empty
     array is how "no filter" is expressed, so the same code serves both. */
  const mine = (field: string): Crit => (me ? [{ name: field, type: "=", value: me }] : []);

  const [onMarket, managed, leads, appraisals, applications] = await Promise.all([
    count("Listings", [
      ...mine("listing_agent_1_id"),
      { name: "system_listing_state", type: "=", value: "current" },
      { name: "listing_category_id", type: "=", value: "residential_rental" },
    ]),
    count("Listings", [
      ...mine("listing_agent_1_id"),
      { name: "system_listing_state", type: "=", value: "leased" },
      { name: "listing_category_id", type: "=", value: "residential_rental" },
    ]),
    count("Leads", mine("lead.assignee_id")),
    count("Appraisals", mine("agent_1_id")),
    count("TenancyApplications", mine("application.agent_id")),
  ]);

  return NextResponse.json({
    ok: true,
    scope: scope.label,
    everything: scope.everything,
    figures: { onMarket, managed, leads, appraisals, applications },
    pulledAt: new Date().toISOString(),
  });
}
