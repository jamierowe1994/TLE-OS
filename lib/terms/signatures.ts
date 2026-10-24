import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * SIGNATURES MADE ON OUR OWN PAGE (James, 24 Oct 2026).
 *
 * The agent and each landlord now sign on the OS's page (drawn, typed, or the
 * agent's saved one) and DocuSeal seals it (lib/terms/flow agentSign and
 * landlordSign). DocuSeal keeps the signed PDF and its certificate; this keeps
 * our own record beside it: the image as it was drawn, when, from where, and
 * what the landlord chose about starting in the cancellation period. That is
 * what the pages show back, and evidence of our own if a signature is ever
 * questioned.
 */

export interface SignatureRecord {
  /** A PNG data URL, as drawn or as the typed name was set. */
  image: string;
  at: string;
  ip: string | null;
  userAgent: string | null;
  /** Landlords only: asked us to start during the cancellation period. */
  startNow?: boolean | null;
}

const KIND = "terms-signature";
const SAVED = "agent-signature";

/** Only an image we can hand to DocuSeal and draw on a page: a PNG or JPEG data URL, under 400KB. */
export function cleanSignature(image: unknown): string | null {
  const s = typeof image === "string" ? image.trim() : "";
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)) return null;
  return s.length <= 400_000 ? s : null;
}

export async function saveSignature(termsId: string, key: string, rec: SignatureRecord, by: string): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KIND, `${termsId}|${key}`, JSON.stringify(rec), by]
  );
}

/** Every signature on one contract, by "agent" or the person's key. */
export async function signaturesFor(termsId: string): Promise<Record<string, SignatureRecord>> {
  if (!hasDb()) return {};
  const rows = await q<{ record_id: string; payload: SignatureRecord }>(
    `SELECT record_id, payload FROM os_case_state WHERE kind = $1 AND record_id LIKE $2`,
    [KIND, `${termsId}|%`]
  ).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.record_id.slice(termsId.length + 1), r.payload]));
}

/** The agent's own signature, kept for next time when they ticked "Save it for next time". */
export async function savedAgentSignature(userId: string): Promise<string | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: { image?: string } }>(`SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`, [SAVED, userId]).catch(() => []);
  return cleanSignature(rows[0]?.payload?.image ?? null);
}

export async function keepAgentSignature(userId: string, image: string | null): Promise<void> {
  if (!hasDb()) return;
  if (!image) {
    await q(`DELETE FROM os_case_state WHERE kind = $1 AND record_id = $2`, [SAVED, userId]);
    return;
  }
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $2)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [SAVED, userId, JSON.stringify({ image, at: new Date().toISOString() })]
  );
}
