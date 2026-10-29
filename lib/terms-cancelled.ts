import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Terms nobody should chase any more (Lorna Fieldson, 28 Oct 2026: "it says
 * terms out 1 which is for 15 Egton Street. This property was withdrawn 25
 * Sept, there needs to be a button to cancel the terms on this screen").
 *
 * Keyed by the Terms out list's own ids - esign:<REX request>, docuseal:<appraisal>.
 * Cancelled here they come off Terms out, the bell and the automatic nudges.
 * Nothing is sent to the landlord and the old signing link isn't voided: James
 * chose that on 29 Oct, as voiding a REX e-sign can email the landlord. Our
 * own terms page (page:<id>) is withdrawn properly instead, in lib/terms/flow.
 */

const KIND = "terms-cancelled";

export type TermsCancelled = { id: string; why: string; by: string; at: string };

/** Every cancelled id. A failed read cancels nothing, so it can only over-count. */
export async function cancelledTermIds(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ record_id: string }>(`SELECT record_id FROM os_case_state WHERE kind = $1`, [KIND]).catch(() => [] as { record_id: string }[]);
  return new Set(rows.map((r) => r.record_id));
}

export async function cancelTermsHere(id: string, why: string, by: string): Promise<void> {
  if (!/^(esign|docuseal):.+/.test(id)) throw new Error("Which terms?");
  const payload: TermsCancelled = { id, why: why.trim().slice(0, 300), by, at: new Date().toISOString() };
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_by) VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = $3::jsonb, updated_at = NOW(), updated_by = $4`,
    [KIND, id, JSON.stringify(payload), by]
  );
}
