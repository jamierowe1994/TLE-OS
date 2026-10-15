import "server-only";
import { hasDb, q } from "@/lib/db";
import { currentLets } from "@/lib/current-lets";
import { countsOf, landlordsOf, pmCountsFor } from "@/lib/managed-book";
import type { ManagedBook, ManagedProperty } from "@/lib/portfolio-types";

/**
 * WHOSE HOME IT IS, HELD IN THE OS (Sean McMahon, 15 Oct 2026: "tons of
 * properties are missing from tle-os for me").
 *
 * An agent's Portfolio is the REX lets in their name plus the REX PM homes
 * whose REX property they own. Sean is buying Margo Wilson's Glasgow book,
 * but every one of her homes still names Margaret Wilson in REX and REX PM,
 * so his Portfolio showed 48 homes and none of hers - 45D Lainshaw Street and
 * 36 Carnoustie Crescent, with damp reports due, among them.
 *
 * REX is not touched (owner moves in REX are James's call, one at a time).
 * The OS holds the move instead, in os_agent_moves:
 *
 *   - kind 'home':  one home, keyed by the book row's property id (the REX
 *                   property, or the OS's own pm- id for a home not on REX).
 *                   Set from the home's page by an owner or the office.
 *   - kind 'agent': every home one agent has, keyed by that agent's REX user
 *                   id - "Margaret Wilson's homes are Sean's".
 *
 * A home move wins over an agent move. Laid over the book at read time, like
 * notice and the record landlords, so a move shows on the next page load
 * rather than after the next REX read. The whole business sees the home under
 * its new agent; the old agent's book loses it; the new agent's book gains it
 * from the whole book. Everything that reads an agent's book through
 * managedBookFor - Portfolio, Maintenance Mine, raising a repair, the home's
 * page, compliance - follows.
 */

export type AgentMove = {
  kind: "home" | "agent";
  key: string;
  label: string;
  toRexId: string;
  toName: string;
  note: string;
  setBy: string;
  setAt: string;
};

type Row = { kind: string; key: string; label: string; to_rex_id: string; to_name: string; note: string; set_by: string; set_at: Date };

let cached: { at: number; moves: AgentMove[] } | null = null;
const FRESH_MS = 60_000;

/** Forget the cached moves - after one is set or removed. */
export function forgetAgentMoves(): void {
  cached = null;
}

export async function agentMoves(): Promise<AgentMove[]> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.moves;
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT kind, key, label, to_rex_id, to_name, note, set_by, set_at FROM os_agent_moves ORDER BY set_at`);
  const moves = rows
    .filter((r) => r.kind === "home" || r.kind === "agent")
    .map((r) => ({
      kind: r.kind as AgentMove["kind"],
      key: r.key,
      label: r.label,
      toRexId: r.to_rex_id,
      toName: r.to_name,
      note: r.note,
      setBy: r.set_by,
      setAt: new Date(r.set_at).toISOString(),
    }));
  cached = { at: Date.now(), moves };
  return moves;
}

export async function setHomeMove(m: { key: string; label: string; toRexId: string; toName: string; setBy: string }): Promise<void> {
  await q(
    `INSERT INTO os_agent_moves (kind, key, label, to_rex_id, to_name, set_by, set_at)
     VALUES ('home', $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (kind, key) DO UPDATE SET label = EXCLUDED.label, to_rex_id = EXCLUDED.to_rex_id,
       to_name = EXCLUDED.to_name, set_by = EXCLUDED.set_by, set_at = NOW()`,
    [m.key, m.label, m.toRexId, m.toName, m.setBy]
  );
  forgetAgentMoves();
}

export async function clearHomeMove(key: string): Promise<void> {
  await q(`DELETE FROM os_agent_moves WHERE kind = 'home' AND key = $1`, [key]);
  forgetAgentMoves();
}

/** First and last word: REX's "Margaret Wilson" and a "name:Margaret Wilson" row are one person. */
const personKey = (n: string | null | undefined) => {
  const w = String(n ?? "").replace(/\(.*?\)/g, " ").toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : "";
};

/** The move that applies to this row, if any. A home move wins over an agent move. */
export function moveFor(p: ManagedProperty, moves: AgentMove[]): AgentMove | null {
  const ids = [p.propertyId, p.listingId].filter(Boolean).map(String);
  const home = moves.find((m) => m.kind === "home" && ids.includes(m.key));
  if (home) return home;
  if (!p.agent) return null;
  const who = personKey(p.agent.name);
  return moves.find((m) => m.kind === "agent" && (m.key === p.agent!.id || (who && personKey(m.label) === who))) ?? null;
}

function moved(p: ManagedProperty, m: AgentMove): ManagedProperty {
  if (p.agent?.id === m.toRexId) return p;
  return { ...p, agent: { id: m.toRexId, name: m.toName }, agentMovedFrom: p.agent?.name ?? null };
}

async function recount(book: ManagedBook, properties: ManagedProperty[]): Promise<ManagedBook> {
  const landlords = landlordsOf(currentLets(properties));
  const counts = { ...book.counts, ...countsOf(properties, landlords) };
  counts.rentsFromPayProp = currentLets(properties).filter((p) => p.rentSource === "payprop").length;
  const pm = await pmCountsFor(new Set(properties.map((p) => String(p.propertyId ?? "")))).catch(() => null);
  if (pm) Object.assign(counts, pm);
  return { ...book, properties, landlords, counts };
}

/**
 * The book with the OS's moves laid over it. `whole` reads the whole
 * business's book, only when somebody's homes are moving to this agent.
 */
export async function withAgentMoves(book: ManagedBook, rexUserId: string | null, whole: () => Promise<ManagedBook>): Promise<ManagedBook> {
  let moves: AgentMove[];
  try {
    moves = await agentMoves();
  } catch {
    return book;
  }
  if (!moves.length) return book;

  if (!rexUserId) {
    let touched = false;
    const properties = book.properties.map((p) => {
      const m = moveFor(p, moves);
      if (!m || p.agent?.id === m.toRexId) return p;
      touched = true;
      return moved(p, m);
    });
    return touched ? { ...book, properties } : book;
  }

  /* Out: rows a move sends to somebody else. */
  let touched = false;
  const kept = book.properties.filter((p) => {
    const m = moveFor(p, moves);
    if (m && m.toRexId !== rexUserId) { touched = true; return false; }
    return true;
  }).map((p) => {
    const m = moveFor(p, moves);
    return m ? moved(p, m) : p;
  });

  /* In: rows of the whole book a move sends to this agent. Thrown, not
     swallowed - an agent's book missing the homes moved to them is the
     very fault this exists to fix, and it must say it could not read them. */
  if (moves.some((m) => m.toRexId === rexUserId)) {
    const all = await whole();
    const have = new Set(kept.map((p) => p.listingId));
    for (const p of all.properties) {
      if (have.has(p.listingId)) continue;
      const m = moveFor(p, moves);
      if (m?.toRexId !== rexUserId) continue;
      kept.push(moved(p, m));
      have.add(p.listingId);
      touched = true;
    }
  }
  return touched ? recount(book, kept) : book;
}
