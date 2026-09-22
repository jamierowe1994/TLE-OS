import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { hideLead, unhideLead } from "@/lib/hidden-leads";
import { q } from "@/lib/db";
import { ensureRexLink } from "@/lib/users";

export const dynamic = "force-dynamic";

/** POST: take a lead off the board. DELETE: put it back. REX is untouched. */
async function act(req: NextRequest, ctx: { params: Promise<{ id: string }> }, hide: boolean) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here, so nothing can be removed." }, { status: 503 });
  const { id } = await ctx.params;
  /* An agent hides their own leads (18 Sep sweep, item 4): the lead's
     assignee by REX id, or the agent named on it. Owners and the office are
     not gated. A lead the ledger does not hold is an OS one, which is theirs. */
  if (actor.role === "agent") {
    const rows = await q<{ assignee_id: string | null; agent: string | null }>(`SELECT assignee_id, agent FROM os_leads WHERE id = $1`, [id]).catch(() => []);
    const lead = rows[0];
    if (lead) {
      const mine = await ensureRexLink(actor).catch(() => null);
      const byId = lead.assignee_id && mine ? String(lead.assignee_id) === String(mine) : null;
      const byName = (lead.agent ?? "").trim().toLowerCase() === (actor.name ?? "").trim().toLowerCase() && Boolean(actor.name);
      if (!(byId === true || (byId === null && byName))) {
        return NextResponse.json({ ok: false, error: `That lead is ${(lead.agent ?? "another agent").split(/\s+/)[0]}'s. Only they can take it off the board.` }, { status: 403 });
      }
    }
  }
  const who = (actor as unknown as { email?: string; name?: string }).email ?? (actor as unknown as { name?: string }).name ?? null;
  try {
    if (hide) await hideLead(id, who);
    else await unhideLead(id);
    return NextResponse.json({ ok: true, id, hidden: hide });
  } catch {
    return NextResponse.json({ ok: false, error: "That did not save. Try again." }, { status: 500 });
  }
}

export const POST = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => act(req, ctx, true);
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => act(req, ctx, false);
