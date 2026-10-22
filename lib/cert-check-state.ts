import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * WHERE A CERTIFICATE FILE STANDS WITH THE COMPLIANCE TEAM, by its R2 key.
 *
 * James, 22 Oct 2026, after Jo's first morning on the Verified tab: every
 * certificate row gets an Email Tenant button, "blocked out until it's
 * verified, and then we should be able to click it". So the property file, the
 * Email Certificates screens (lib/home-send) and the desk all need the same
 * answer to "has compliance checked this file?", and this is it.
 *
 *   waiting   on To verify: filed since the checks began and not yet checked,
 *             or held for the check (lib/cert-hold awaiting_check)
 *   queried   compliance said something is wrong with it
 *   verified  checked and good (or filed by compliance themselves)
 *
 * A file with no answer here needs none: the Propoly backlog from before the
 * checks began, read against the paper at the time, and REX's own copies.
 * Those can be sent as they always could.
 */

/** The cut-over: everything in os_certificates before this is the backlog (lib/compliance-desk). */
export const CHECKS_BEGAN = "2026-09-20";

export interface CertCheckState {
  state: "waiting" | "queried" | "verified";
  certificateId: string;
  /** Who checked it, and when. Verified and queried only. */
  by?: string;
  at?: string;
}

export async function checkStatesFor(keys: string[]): Promise<Record<string, CertCheckState>> {
  const out: Record<string, CertCheckState> = {};
  if (!hasDb() || !keys.length) return out;
  const rows = await q<{ id: string; r2_key: string; held: boolean | null; since: boolean; state: string | null; by_name: string | null; at: Date | null }>(
    `SELECT c.id, c.r2_key, c.awaiting_check AS held, c.added_at >= $2::date AS since, k.state, k.by_name, k.at
       FROM os_certificates c
       LEFT JOIN os_compliance_checks k ON k.kind = 'certificate' AND k.subject_id = c.id
      WHERE c.r2_key = ANY($1)`,
    [keys, CHECKS_BEGAN]
  );
  const rank = { verified: 3, queried: 2, waiting: 1 } as const;
  for (const r of rows) {
    const state: CertCheckState["state"] | null =
      r.state === "verified" ? "verified" : r.state === "queried" ? "queried" : r.held || r.since ? "waiting" : null;
    if (!state) continue;
    /* The same file filed twice: the best answer stands. */
    const had = out[r.r2_key];
    if (had && rank[had.state] >= rank[state]) continue;
    out[r.r2_key] = {
      state,
      certificateId: r.id,
      ...(state !== "waiting" ? { by: r.by_name ?? "", at: r.at ? new Date(r.at).toISOString() : undefined } : {}),
    };
  }
  return out;
}

/** The sentence for a file that can't go to a tenant yet, or null when it can. */
export function notYetSendable(s: CertCheckState | undefined): string | null {
  if (s?.state === "waiting") return "Waiting for the compliance team to verify it, so it can't be sent yet.";
  if (s?.state === "queried") return "Queried by the compliance team, so it can't be sent until a good one is verified.";
  return null;
}
