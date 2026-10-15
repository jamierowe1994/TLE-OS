import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { record } from "@/lib/audit";
import { lettingsAgents } from "@/lib/rex-agents";
import { managedBookFor } from "@/lib/managed-book-cache";
import { agentMoves, clearHomeMove, setHomeMove } from "@/lib/agent-moves";
import { publicError } from "@/lib/public-error";

/**
 * Move a home to another agent, in the OS only (Sean McMahon, 15 Oct 2026).
 *
 *   GET  ?property=<property id>              → { canChange, agents, move }
 *   POST { propertyId, rexUserId }            → the home is that agent's
 *   POST { propertyId, clear: true }          → back to whoever the book names
 *
 * For whoever sees the whole business (owners and the office). Nothing is
 * written to REX: the home's page, Portfolio, Maintenance and the rest read
 * the move from os_agent_moves (lib/agent-moves). Every change is audited.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function allowed(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  return { actor, ok: Boolean(actor && can(actor.role, "see:everything") && !who?.viewingAs) };
}

export async function GET(req: NextRequest) {
  const { actor, ok } = await allowed(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const propertyId = req.nextUrl.searchParams.get("property")?.trim() ?? "";
  if (!ok) return NextResponse.json({ ok: true, canChange: false, agents: [], move: null });
  const [agents, moves] = await Promise.all([lettingsAgents().catch(() => []), agentMoves().catch(() => [])]);
  const move = moves.find((m) => m.kind === "home" && m.key === propertyId) ?? null;
  return NextResponse.json(
    { ok: true, canChange: true, agents: agents.map((a) => ({ id: a.id, name: a.name })), move },
    { headers: { "cache-control": "private, no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const { actor, ok } = await allowed(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!ok) return NextResponse.json({ ok: false, error: "Moving a home to another agent is for the owners and the office." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { propertyId?: unknown; rexUserId?: unknown; clear?: unknown } | null;
  const propertyId = String(b?.propertyId ?? "").trim();
  if (!propertyId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });

  try {
    const { book } = await managedBookFor(null);
    const home = book.properties.find((p) => p.propertyId === propertyId);
    if (!home) return NextResponse.json({ ok: false, error: "That home isn't in the book." }, { status: 404 });

    if (b?.clear === true) {
      await clearHomeMove(propertyId);
      await record({
        kind: "home_agent_moved",
        actorId: actor.id,
        actorEmail: actor.email,
        detail: `Home ${propertyId} (${home.name}): move taken off, back to the agent the book names. OS only, not REX.`,
      }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    const to = String(b?.rexUserId ?? "").trim();
    if (!/^\d+$/.test(to)) return NextResponse.json({ ok: false, error: "Pick an agent." }, { status: 400 });
    const agents = await lettingsAgents().catch(() => []);
    const who = agents.find((a) => a.id === to);
    if (!who) return NextResponse.json({ ok: false, error: "That person is not one of the lettings agents." }, { status: 400 });
    await setHomeMove({ key: propertyId, label: home.name, toRexId: who.id, toName: who.name, setBy: actor.name || actor.email });
    await record({
      kind: "home_agent_moved",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Home ${propertyId} (${home.name}): ${home.agent?.name ?? "no agent"} -> ${who.name}. OS only, not REX.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, agent: { id: who.id, name: who.name } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save. Try again in a minute.") }, { status: 502 });
  }
}
