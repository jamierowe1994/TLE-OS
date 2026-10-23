import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { appraisalsChanged, getAppraisal } from "@/lib/appraisal-store";
import { cancelAppraisal, mayChangeAppraisal } from "@/lib/appraisal-change";
import { isTestFile } from "@/lib/test-guard";
import { hideLead } from "@/lib/hidden-leads";
import { record } from "@/lib/audit";

/**
 * TIDY AWAY AN APPRAISAL (James, 23 Oct 2026; Kayleigh's ask: "there's no way
 * to delete an appraisal in OS").
 *
 * "It will then ask ... Is this a test file? Landlord does not wish to be
 * contacted ... If it is an actual test file, just delete it. If it's just a
 * lost file, then we should ask whether they would like to keep it and just
 * remove it from that section. What we don't want to do is get clobbered up."
 *
 *  - archive: off the board, kept. Stage goes to lost, so every reminder,
 *    chase and queued send that already skips a lost file skips it, and the
 *    stage it was at is kept so Bring back puts it where it was.
 *  - delete: only a test file. Its last row is copied to
 *    os_deleted_appraisals first, so a slip can be put back.
 *
 * Either way a visit still to come is cancelled first, through the same
 * cancel the file's own button uses: out of the diaries, nothing emailed.
 * REX is never asked to delete anything.
 */

export type TidyResult = { ok: boolean; said: string };

const pretty = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 300);

async function clearVisit(me: OsUser, id: string, appointmentAt: string | null | undefined, cancelledAt: string | null | undefined): Promise<string | null> {
  if (!appointmentAt || cancelledAt || new Date(appointmentAt).getTime() < Date.now()) return null;
  const c = await cancelAppraisal(me, id);
  return c.ok ? null : c.said;
}

export async function archiveAppraisal(me: OsUser, id: string, why: string): Promise<TidyResult> {
  if (!hasDb()) return { ok: false, said: "Archiving needs the database, which isn't connected here." };
  const ma = await getAppraisal(id);
  if (!ma) return { ok: false, said: "That appraisal could not be found." };
  if (!(await mayChangeAppraisal(me, ma, null))) return { ok: false, said: "Only the appraisal's agent, an owner or the office can archive it." };
  if (ma.archivedAt) return { ok: true, said: "That appraisal is already archived." };
  const stuck = await clearVisit(me, id, ma.appointmentAt, ma.cancelledAt);
  if (stuck) return { ok: false, said: `It wasn't archived: ${stuck}` };
  await q(
    `UPDATE os_market_appraisals
        SET archived_from = stage, stage = 'lost', archived_at = NOW(), archived_by = $2, archived_why = $3, updated_at = NOW()
      WHERE id = $1 AND archived_at IS NULL`,
    [id, me.name || me.email, pretty(why)]
  );
  /* Anything still waiting to go to this landlord about it stays put. */
  await q(
    `UPDATE os_scheduled_sends SET state = 'cancelled', error = 'The appraisal was archived, so it was not sent.'
      WHERE state = 'queued' AND ref = ANY($1)`,
    [[ma.id, ma.leadId].filter(Boolean)]
  ).catch(() => null);
  appraisalsChanged();
  await record({ kind: "appraisal_archived", actorId: me.id, actorEmail: me.email, detail: `${ma.address} (${ma.id}): ${pretty(why)}` });
  return { ok: true, said: "Archived. It's off the board, and Archived on Market Appraisals brings it back." };
}

export async function unarchiveAppraisal(me: OsUser, id: string): Promise<TidyResult> {
  if (!hasDb()) return { ok: false, said: "That needs the database, which isn't connected here." };
  const ma = await getAppraisal(id);
  if (!ma) return { ok: false, said: "That appraisal could not be found." };
  if (!(await mayChangeAppraisal(me, ma, null))) return { ok: false, said: "Only the appraisal's agent, an owner or the office can bring it back." };
  await q(
    `UPDATE os_market_appraisals
        SET stage = COALESCE(archived_from, 'booked'), archived_from = NULL, archived_at = NULL, archived_by = NULL, archived_why = NULL, updated_at = NOW()
      WHERE id = $1`,
    [id]
  );
  appraisalsChanged();
  await record({ kind: "appraisal_archived", actorId: me.id, actorEmail: me.email, detail: `${ma.address} (${ma.id}): brought back` });
  return { ok: true, said: "Back on the board where it was." };
}

/**
 * A test file only. Steve may press this one (lib/steve-never lets "Delete
 * test file" through), so it is the server that decides: an appraisal with
 * terms sent or won is real business and is archived instead.
 */
export async function deleteTestAppraisal(me: OsUser, id: string, why: string): Promise<TidyResult> {
  if (!hasDb()) return { ok: false, said: "Deleting needs the database, which isn't connected here." };
  const ma = await getAppraisal(id);
  if (!ma) return { ok: false, said: "That appraisal could not be found." };
  if (!(await mayChangeAppraisal(me, ma, null))) return { ok: false, said: "Only the appraisal's agent, an owner or the office can delete a test appraisal." };
  const marked = await isTestFile({ appraisalId: ma.id, leadId: ma.leadId, address: ma.address }).catch(() => false);
  if (!marked && (ma.stage === "won" || ma.termsSentAt)) {
    return { ok: false, said: "This one has had terms sent, so it isn't deleted as a test. Archive it instead." };
  }
  const stuck = await clearVisit(me, id, ma.appointmentAt, ma.cancelledAt);
  if (stuck) return { ok: false, said: `It wasn't deleted: ${stuck}` };
  const rows = await q<Record<string, unknown>>(`SELECT * FROM os_market_appraisals WHERE id = $1`, [id]);
  if (!rows[0]) return { ok: true, said: "Already gone." };
  await q(`INSERT INTO os_deleted_appraisals (id, row, deleted_by, why) VALUES ($1, $2::jsonb, $3, $4)`, [id, JSON.stringify(rows[0]), me.name || me.email, pretty(why) || "Test file"]);
  await q(
    `UPDATE os_scheduled_sends SET state = 'cancelled', error = 'Test appraisal deleted' WHERE state = 'queued' AND ref = ANY($1)`,
    [[ma.id, ma.leadId].filter(Boolean)]
  ).catch(() => null);
  await q(`DELETE FROM os_market_appraisals WHERE id = $1`, [id]);
  /* The lead it was booked from is a test too: off the leads board, kept. */
  if (ma.leadId) await hideLead(ma.leadId, me.email).catch(() => undefined);
  appraisalsChanged();
  await record({ kind: "appraisal_deleted", actorId: me.id, actorEmail: me.email, detail: `${ma.address} (${ma.id}), landlord ${ma.landlord}: ${pretty(why) || "test file"}` });
  return { ok: true, said: "Deleted. It was a test file, so it's gone from the board." };
}
