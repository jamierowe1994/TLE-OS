import "server-only";
import type { NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";
import { q } from "@/lib/db";
import { can } from "@/lib/roles";
import { findUserById } from "@/lib/users";
import { getAgentStatement, type AgentStatement } from "@/lib/business/payprop-income";
import { isPeriodKind, resolvePeriod, type Period } from "@/lib/statement-period";

/**
 * Who a commission statement is for, and for when, answered once for both
 * the screen and the PDF so the two can never be about different people.
 *
 * An agent sees their own and nobody else's. Owners and the office (anyone
 * holding see:everything) can pick any agent. An owner viewing as somebody
 * lands on that person's.
 */

export interface StatementAgent {
  id: string;
  name: string;
}

export type StatementAnswer =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      canPick: boolean;
      /** Every agent, for the picker. Only sent to those who can pick. */
      agents: StatementAgent[] | null;
      /** Null when somebody who can pick has not picked yet. */
      agent: StatementAgent | null;
      period: Period;
      statement: AgentStatement | null;
    };

export async function statementFor(req: NextRequest, opts: { read: boolean }): Promise<StatementAnswer> {
  const { actor, subject } = await whoIs(req);
  if (!actor) return { ok: false, status: 401, error: "Sign in first." };
  const me = subject ?? actor;
  const canPick = can(actor.role, "see:everything");

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("period");
  const resolved = resolvePeriod(isPeriodKind(kind) ? kind : "this-month", { from: sp.get("from"), to: sp.get("to") });
  if (!resolved.ok) return { ok: false, status: 400, error: resolved.error };

  const asked = (sp.get("agent") ?? "").trim();
  let person: { id: string; name: string; email: string } | null = null;
  if (asked && asked !== me.id) {
    if (!canPick) return { ok: false, status: 403, error: "You can only see your own statement." };
    const u = await findUserById(asked);
    if (!u) return { ok: false, status: 404, error: "That person isn't on the OS." };
    person = { id: u.id, name: u.name, email: u.email };
  } else if (asked || !canPick || me.role === "agent") {
    /* Your own: always for an agent, and for anyone else who asks for
       themselves by id. Somebody who can pick and has not yet picked gets
       the picker rather than a statement of their own they never earn. */
    person = { id: me.id, name: me.name, email: me.email };
  }

  const agents = canPick
    ? await q<{ id: string; name: string }>(
        `SELECT id, name FROM os_users WHERE role = 'agent' AND locked_at IS NULL ORDER BY lower(name)`,
      ).catch(() => [])
    : null;

  const statement = person && opts.read
    ? await getAgentStatement(person.email, person.name, resolved.period.from, resolved.period.to)
    : null;

  return {
    ok: true,
    canPick,
    agents,
    agent: person ? { id: person.id, name: person.name } : null,
    period: resolved.period,
    statement,
  };
}
