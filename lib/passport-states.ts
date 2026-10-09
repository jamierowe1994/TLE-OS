import "server-only";
import { hasDb, q } from "@/lib/db";
import { DEMO_CONTACT_ID } from "@/lib/passport";
import { EMPTY_PASSPORT, answered, type PassportData } from "@/lib/passport-shape";
import type { PassportState, PassportStateRow } from "@/lib/passport-states-shape";

/**
 * Where every tenant's passport has got to, for the Passport column on Leads.
 *
 * James, 9 Oct 2026: between the name and the address, say whether the
 * passport has been sent and whether it is done, and let the board be
 * filtered by it. The drawer already knew this one lead at a time
 * (GET /api/tenant/passport/invite); this is the same answer for the whole
 * board in one read.
 *
 * ── The four words ────────────────────────────────────────────────────────
 *
 *   Completed - they pressed the final button (submitted_at).
 *   Started   - not finished, but they have typed something beyond the name
 *               and email the invite seeds. Measured by answers, the same
 *               count as the tenant's own progress bar, so opening the link
 *               and leaving is not "started".
 *   Sent      - the invite email went (invited_at), nothing typed yet.
 *   Not sent  - no passport at all, or one minted and never emailed. Not
 *               returned: a lead with no row here is Not sent.
 *
 * One row per email at its furthest state: a tenant two agents each sent one
 * to and who finished one of them is Completed.
 *
 * ── Whose ─────────────────────────────────────────────────────────────────
 *
 * The office sees every passport. An agent sees the ones they minted and the
 * ones sent to their own leads by somebody else (Kirstie sends for the
 * office), so their own board is right without showing them anybody else's
 * tenants. Never a token or a link - see lib/passports-done-shape.
 */
export async function passportStates(p: { rexUserId: string | null }): Promise<PassportStateRow[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    email: string; contact_id: string | null; data: Partial<PassportData> | null;
    invited_at: string | Date | null; updated_at: string | Date; submitted_at: string | Date | null;
  }>(
    `SELECT p.email, p.contact_id,
            CASE WHEN p.submitted_at IS NULL THEN p.data END AS data,
            p.invited_at, p.updated_at, p.submitted_at
       FROM os_tenant_passports p
      WHERE COALESCE(p.contact_id, '') <> $1
        AND (p.email <> '' OR p.contact_id IS NOT NULL)
        AND ($2::text IS NULL
             OR p.agent_id IN (SELECT id FROM os_users WHERE rex_user_id = $2)
             OR lower(trim(p.email)) IN (SELECT lower(email) FROM os_leads WHERE assignee_id = $2 AND email <> ''))`,
    [DEMO_CONTACT_ID, p.rexUserId]
  );

  const RANK: Record<PassportState, number> = { sent: 1, started: 2, done: 3 };
  const best = new Map<string, PassportStateRow>();
  for (const r of rows) {
    let state: PassportState | null = null;
    let at: Date | null = null;
    if (r.submitted_at) {
      state = "done";
      at = new Date(r.submitted_at);
    } else {
      const d = { ...EMPTY_PASSPORT, ...(r.data ?? {}) } as PassportData;
      const seeded = answered({ ...EMPTY_PASSPORT, legalName: d.legalName, email: d.email }).done;
      if (answered(d).done > seeded) {
        state = "started";
        at = new Date(r.updated_at);
      } else if (r.invited_at) {
        state = "sent";
        at = new Date(r.invited_at);
      }
    }
    if (!state || !at) continue;
    const email = r.email.trim().toLowerCase();
    const key = email || `contact:${r.contact_id}`;
    const row: PassportStateRow = { email, contactId: r.contact_id, state, at: at.toISOString() };
    const had = best.get(key);
    if (!had || RANK[state] > RANK[had.state] || (RANK[state] === RANK[had.state] && row.at > had.at)) best.set(key, row);
  }
  return [...best.values()];
}
