import { NextRequest, NextResponse } from "next/server";
import { scopeFor } from "@/lib/scope";
import { rexCall, rexConfigured } from "@/lib/rex";
import { RULES } from "@/lib/staleness";

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

const held = new Map<string, { at: number; figures: Record<string, number | null> }>();

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

  /* Held for the figures rule's fifteen minutes (19 Sep 2026). These are five
     all-time counts - 90,791 leads does not move inside a quarter of an hour -
     and they were being asked of REX, five calls a time, on every dashboard
     load by everybody. The answer carries `pulledAt`, so a held figure is
     drawn with the time it was read, which is what the rule asks for. Only a
     COMPLETE answer is held: a null is a call that failed, and that is asked
     again next time. */
  const key = me ?? "all";
  const hit = held.get(key);
  if (hit && Date.now() - hit.at < RULES.figures.freshMs) {
    return NextResponse.json({ ok: true, scope: scope.label, everything: scope.everything, figures: hit.figures, pulledAt: new Date(hit.at).toISOString() });
  }

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

  const figures = { onMarket, managed, leads, appraisals, applications };
  if (Object.values(figures).every((v) => v != null)) held.set(key, { at: Date.now(), figures });

  return NextResponse.json({
    ok: true,
    scope: scope.label,
    everything: scope.everything,
    figures,
    pulledAt: new Date().toISOString(),
  });
}
