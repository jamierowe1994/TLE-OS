import "server-only";
import { hasDb, q } from "@/lib/db";
import { isScottish } from "@/lib/property-flags";
import type { PassportData, PassportRecord, PassportRules } from "@/lib/passport";
import { SCOTLAND } from "@/lib/passport-shape";

/**
 * SCOTTISH PASSPORTS CARRY NO NATIONALITY AND NO RIGHT TO RENT.
 *
 * Lianna Denholm, 15 Oct 2026: "Can we please remove nationality from
 * Scottish passports?" James: in Scotland we can't have nationality on the
 * tenant passport. And the same day: Right to Rent is England-only law, so
 * the Right to rent section (British or Irish passport, share code) goes too.
 *
 * THE RULE. A passport is Scottish when EITHER
 *   - the agent who sent it is a Scottish agent, or
 *   - it has been sent for a home in Scotland (os_tenant_passports.scottish_home,
 *     set by an invite, a viewing or an offer on a Scottish home), or the
 *     screen showing it is for a Scottish home.
 * Either one is enough, so a Scottish home is covered whoever sends it.
 *
 * A SCOTTISH AGENT. The OS holds no office or country against a person, so it
 * is read from what they do: an agent with a LARN on file (os_agent_larn), or
 * whose managed homes are mostly in Scotland (os_properties.agent_name). On
 * 15 Oct 2026 that was Lianna Denholm (34 of 35), Sean McMahon (65 of 70) and
 * Margaret Wilson (84 of 84); every other agent had none in Scotland.
 *
 * HIDDEN, NOT DELETED. A Scottish passport finished before this has its
 * nationality and Right to rent answers kept in the database; they are simply
 * never sent to a screen, and a save from the form keeps what is stored
 * rather than blanking it. Clearing them is James's decision.
 */

const TTL_MS = 10 * 60 * 1000;
const agentCache = new Map<string, { at: number; scottish: boolean }>();

/** "Lianna Jane Denholm" and "Lianna Denholm" are the same person on the book. */
const firstLast = (name: string) => {
  const w = name.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
  return w.length ? `${w[0]} ${w[w.length - 1]}` : "";
};

/** A Scottish agent: a LARN on file, or most of their managed homes in Scotland. */
export async function scottishAgent(agentId: string | null | undefined): Promise<boolean> {
  if (!agentId || !hasDb()) return false;
  const hit = agentCache.get(agentId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.scottish;

  const scottish = await (async () => {
    const users = await q<{ name: string; rex_user_id: string | null; larn: string | null }>(
      `SELECT u.name, u.rex_user_id, l.larn
         FROM os_users u LEFT JOIN os_agent_larn l ON l.rex_user_id = u.rex_user_id
        WHERE u.id = $1`,
      [agentId]
    );
    const u = users[0];
    if (!u) return false;
    if (u.larn) return true;
    const key = firstLast(u.name);
    if (!key) return false;
    const homes = await q<{ agent_name: string; postcode: string | null; locality: string | null }>(
      `SELECT agent_name, postcode, locality FROM os_properties WHERE active AND agent_name IS NOT NULL`
    );
    const theirs = homes.filter((h) => firstLast(h.agent_name) === key);
    if (!theirs.length) return false;
    const scot = theirs.filter((h) => isScottish(h.postcode, h.locality)).length;
    return scot * 2 > theirs.length;
  })().catch(() => false);

  agentCache.set(agentId, { at: Date.now(), scottish });
  return scottish;
}

/** The rules a passport is asked and shown by. `home` is the home on the screen, when there is one. */
export async function passportRules(rec: Pick<PassportRecord, "agentId" | "scottishHome">, home?: string | null): Promise<PassportRules> {
  const scotland = rec.scottishHome || isScottish(home) || (await scottishAgent(rec.agentId));
  return scotland ? SCOTLAND : {};
}

/** The answers as a screen may see them: no nationality or Right to rent on a Scottish passport. */
export function forScreen(d: PassportData, rules: PassportRules): PassportData {
  const out = { ...d };
  if (rules.noNationality) out.nationality = "";
  if (rules.noRightToRent) {
    out.hasBritishPassport = null;
    out.shareCode = "";
  }
  return out;
}

/** A save from a Scottish passport's form keeps whatever is stored for the answers it never shows. */
export function keepStored(next: PassportData, stored: PassportData, rules: PassportRules): PassportData {
  const out = { ...next };
  if (rules.noNationality) out.nationality = stored.nationality ?? "";
  if (rules.noRightToRent) {
    out.hasBritishPassport = stored.hasBritishPassport ?? null;
    out.shareCode = stored.shareCode ?? "";
  }
  return out;
}
