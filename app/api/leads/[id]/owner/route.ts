import { NextRequest, NextResponse } from "next/server";
import { leadAccess } from "@/lib/lead-access";
import { hasDb, q } from "@/lib/db";
import { leadAgents } from "@/lib/lead-agents";
import { heldBy, ownerOf, setOwner, worksThePool } from "@/lib/lead-owner";
import { addTouch } from "@/lib/lead-touches";
import { isOsContactLead, contactIdOf } from "@/lib/contact-leads";
import { ownerNameSql } from "@/lib/contacts-store";
import { scopeForWho } from "@/lib/scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/leads/[id]/owner - "Not my lead" (Dan Richards, 15 Oct 2026).
 *
 * { to: "<agent key from /api/leads/agents>" | "office", reason?: string }
 *
 * Whoever may open the lead may pass it on: its agent, and owners and the
 * office for any lead. Held in the OS (lib/lead-owner); REX's assignee is not
 * changed. The move goes on the lead's log, and the new agent's bell says so
 * (lib/notifications). Answers `gone: true` when the person who moved it can
 * no longer see it, so the drawer closes and the board drops it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { who, denied } = await leadAccess(req, id);
  if (denied) return denied;
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here, so the lead can't be passed on." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { to?: string; reason?: string };
  const toKey = String(body.to ?? "").trim();
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  if (!toKey) return NextResponse.json({ ok: false, error: "Pick who should have it, or Back to the office." }, { status: 400 });

  let to: { rexUserId: string | null; email: string | null; name: string } | null = null;
  if (toKey !== "office") {
    const agent = (await leadAgents().catch(() => [])).find((a) => a.key === toKey);
    if (!agent) return NextResponse.json({ ok: false, error: "We can't find that agent. Pick them from the list again." }, { status: 400 });
    to = { rexUserId: agent.rexUserId, email: agent.email, name: agent.name };
  }

  /* Who has it now, in words, for the log: the OS's holder if it has been
     moved before, otherwise the name the board shows. */
  const before = await ownerOf(id).catch(() => null);
  let fromName = before ? (before.pool ? "the office" : before.toName) : "";
  if (!before) {
    const rows = isOsContactLead(id)
      ? await q<{ name: string | null }>(`SELECT ${ownerNameSql("os_contacts")} AS name FROM os_contacts WHERE id = $1`, [contactIdOf(id)]).catch(() => [])
      : await q<{ name: string | null }>(`SELECT agent AS name FROM os_leads WHERE id = $1`, [id]).catch(() => []);
    fromName = rows[0]?.name?.trim() || "";
  }
  if (fromName === "Unassigned") fromName = "";
  if (to && before && !before.pool && before.toName === to.name) {
    return NextResponse.json({ ok: false, error: `${to.name.split(/\s+/)[0]} already has this lead.` }, { status: 400 });
  }
  if (!to && before?.pool) return NextResponse.json({ ok: false, error: "This lead is already back with the office." }, { status: 400 });

  const by = { email: who.actor.email, name: who.actor.name?.trim() || who.actor.email };
  try {
    const owner = await setOwner({ leadId: id, to, reason, fromName, by });
    const first = (n: string) => (n === "the office" ? n : n.split(/\s+/)[0]);
    const sentence = to
      ? `Passed to ${to.name}${fromName && fromName !== to.name ? ` from ${first(fromName)}` : ""}`
      : `Back to the office${fromName ? ` from ${first(fromName)}` : ""}`;
    await addTouch({ leadId: id, kind: "moved", outcome: null, body: reason ? `${sentence} - ${reason}` : sentence, byId: who.actor.id, byName: by.name }).catch(() => null);

    /* Can the person who moved it still see it? Owners and the office always
       can; an agent can when they passed it to themselves (nobody does). */
    const scope = await scopeForWho(req, who);
    const me = (who.viewingAs ? who.subject?.email : who.actor.email) ?? null;
    const gone = !(scope.everything || worksThePool(who)) && !heldBy(owner, { rexUserId: scope.rexUserId, email: me });
    return NextResponse.json({ ok: true, owner, gone, agent: to ? to.name : "Unassigned" });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
