import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { isScope, SCOPES, type Scope } from "@/lib/r2";
import { AGENT_HOME_PAPERS, paperKind, recordInAgentBook } from "@/lib/record-papers";

/**
 * WHO MAY OPEN A STORED FILE.
 *
 * Until 22 Sep 2026 the only check on /api/r2/file and /api/r2/list was
 * "does this key belong to us": any signed-in role could list and open every
 * landlord's and tenant's documents, every PLC pack and every signed
 * contract. The note on the file route said this check belonged there once
 * there were real users. There are now.
 *
 * The rule is by role and by the record the file is filed under (the `ref`
 * in the key, documents/<ref>/...):
 *
 *   - owners, pre-tenancy, compliance, marketing and support see everything:
 *     that is their job.
 *   - an agent may open property paperwork and their own files. They may NOT
 *     open another agent's PLC pack (a tenant's ID, income and references),
 *     a passport, another person's compliance documents, or what somebody
 *     uploaded to Steve.
 *   - a home's clean-sweep record (documents/property-<id>/<kind>/...): an
 *     agent opens only the kinds in lib/record-papers AGENT_HOME_PAPERS, one
 *     file at a time, and only on a home in their own book (Lianna Denholm,
 *     ticket 35aa0745, 20 Nov 2026). Never a listing of the whole record,
 *     never another agent's home, never ID, AML or references.
 *
 * Refusals are a sentence for the screen, never a bare status.
 */

/** The record reference and scope a key is filed under, or null. */
export function refOf(key: string): { scope: Scope; ref: string } | null {
  const [prefix, ref] = key.split("/");
  const scope = (Object.keys(SCOPES) as Scope[]).find((s) => SCOPES[s].prefix === prefix);
  return scope && ref ? { scope, ref } : null;
}

export const STAFF_SEES_ALL = new Set(["owner", "super_admin", "developer", "support", "pretenancy", "compliance", "marketing"]);

/**
 * A sentence when this person may not open files under this record, else null.
 * `key` is the one file being opened (/api/r2/file); a listing of the whole
 * record (/api/r2/list) passes none.
 */
export async function refusal(actor: OsUser, scopeRaw: string, ref: string, key?: string): Promise<string | null> {
  if (STAFF_SEES_ALL.has(actor.role)) return null;
  if (!isScope(scopeRaw)) return "Unknown file type.";
  if (scopeRaw === "photo" || scopeRaw === "library") return null;
  if (/^steve-/i.test(ref)) return "Those files went to Steve, and stay with the office.";
  if (/^(passport|tenant)-/i.test(ref)) return "A tenant's passport documents are held by pre-tenancy.";
  if (/^agent-compliance-/i.test(ref)) return "Another person's compliance documents are theirs and the office's.";
  /* A home's clean-sweep papers (24 Sep 2026): landlord ID, passports, AML,
     references. Held by the office, except the tenancy papers on a home in
     the agent's own book (lib/record-papers, 20 Nov 2026). */
  if (/^property-/i.test(ref)) {
    const kind = key && refOf(key)?.ref === ref ? paperKind(key) : null;
    if (!kind || !AGENT_HOME_PAPERS.has(kind)) return "Those documents are held by the office.";
    if (!(await recordInAgentBook(actor, ref.slice("property-".length)))) return "That home isn't in your book, so its papers stay with the office.";
    return null;
  }
  /* A PLC pack: the agent who assembled it, and pre-tenancy. Nobody else. */
  if (hasDb()) {
    const mine = await q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM os_plc_cases WHERE (id = $1 OR application_ref = $1)`,
      [ref]
    ).catch(() => []);
    if (Number(mine[0]?.n ?? 0) > 0) {
      const own = await q<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM os_plc_cases WHERE (id = $1 OR application_ref = $1) AND LOWER(agent_email) = LOWER($2)`,
        [ref, actor.email]
      ).catch(() => []);
      if (Number(own[0]?.n ?? 0) === 0) return "That pre-let pack is another agent's. Pre-tenancy can open it for you.";
    }
  }
  return null;
}
