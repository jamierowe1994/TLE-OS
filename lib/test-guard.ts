import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * IS THIS A TEST FILE? ONE ANSWER, ASKED BEFORE EVERY REX WRITE.
 *
 * James, 18 Sep 2026: "Test files should never be pushed anywhere, apart from
 * being kept on record." With every REX write switched on for the pilot, each
 * one asks here first, and a yes means it stays in the OS.
 *
 * A test is recognised by anything Create a test leaves behind:
 *   - an appraisal or lead written down in os_test_kits (cleared ones too);
 *   - a contact flagged is_test, by its OS id or its REX id, or behind an
 *     os-<contactId> lead;
 *   - the test address itself, 14 Test Street.
 *
 * Deliberately NOT the postcode on its own: M20 2RN is a real street in
 * Didsbury, and a real landlord there must still reach REX.
 */

export const TEST_STREET = /\b14\s+Test\s+Street\b/i;

export const TEST_REFUSAL = "This is a test file from Admin -> Testing, so it stays in the OS and never goes to REX.";

export async function isTestFile(p: {
  appraisalId?: string | null;
  leadId?: string | null;
  /** An OS contact id or a REX contact id. */
  contactId?: string | number | null;
  address?: string | null;
}): Promise<boolean> {
  if (p.address && TEST_STREET.test(p.address)) return true;
  if (!hasDb()) return false;

  const appraisalId = (p.appraisalId ?? "").trim();
  let leadId = (p.leadId ?? "").trim();
  /* An appraisal booked from a lead is lead-<leadId>, so the lead is in its id. */
  if (!leadId && appraisalId.startsWith("lead-")) leadId = appraisalId.slice(5);

  if (appraisalId || leadId) {
    const kits = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM os_test_kits
        WHERE ($1 <> '' AND refs->'appraisals' ? $1) OR ($2 <> '' AND refs->'leadIds' ? $2)`,
      [appraisalId, leadId]
    ).catch(() => [{ n: 0 }]);
    if ((kits[0]?.n ?? 0) > 0) return true;
  }

  const contactIds = [p.contactId != null ? String(p.contactId).trim() : "", leadId.startsWith("os-") ? leadId.slice(3) : ""].filter(Boolean);
  if (contactIds.length) {
    const rows = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM os_contacts WHERE is_test AND (id::text = ANY($1) OR rex_id = ANY($1))`,
      [contactIds]
    ).catch(() => [{ n: 0 }]);
    if ((rows[0]?.n ?? 0) > 0) return true;
  }

  if (appraisalId) {
    const rows = await q<{ address: string }>(`SELECT address FROM os_market_appraisals WHERE id = $1`, [appraisalId]).catch(() => []);
    if (rows[0] && TEST_STREET.test(rows[0].address)) return true;
  }
  return false;
}
