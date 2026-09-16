import "server-only";
import { createHash, randomBytes } from "crypto";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * THE HAND-OFF: a landlord at a desktop, sending a document from their phone.
 *
 * James, 16 Sep 2026: "on desktop view, when they go to upload the documents,
 * we should offer them the option to scan a QR code. They will be taken
 * directly through to their mobile, and then they can scan the documents there
 * without the need to sign in."
 *
 * Which is exactly right for the moment it serves. The landlord is at a
 * computer with a gas certificate in their hand, no scanner, and the only
 * camera in the room is in their pocket. Emailing themselves a link, opening
 * it, and typing a password one-handed is three steps too many.
 *
 * ── The token is a bearer credential, and that is the whole design problem ──
 *
 * There is no sign-in, so the link IS the authority. Anyone who photographs
 * the screen has it, and nothing about a QR code can prevent that. So the
 * safety cannot live in keeping it secret; it has to live in what the thing
 * can DO:
 *
 *   APPEND ONLY.  The page it opens can send a file and read the TITLES of
 *                 what is outstanding ("Gas safety certificate"). It cannot
 *                 open a document, a statement, the contract, the valuation
 *                 or the agent's details. A leaked link can add to the file;
 *                 it can never read it.
 *   SHORT.        Twenty minutes from the moment the desktop drew it. Long
 *                 enough to photograph four certificates; short enough that a
 *                 screenshot pasted into a chat is dead before anybody looks.
 *   HASHED.       SHA-256 at rest, like any other credential, so a dump of
 *                 the table lets nobody upload anything.
 *   SCOPED.       To one account and one appraisal, resolved server-side. The
 *                 phone never sends an account id and could not change it.
 *
 * Multi-use inside the window rather than single-use, deliberately: a landlord
 * with three certificates must not have to walk back to the desk and rescan
 * between each one. The count is kept so a document can later say how it came
 * in.
 */

/** How long a code is good for, from the moment the desktop drew it. */
export const HANDOFF_MINUTES = 20;

export interface Handoff {
  accountId: string;
  appraisalId: string | null;
  expiresAt: string;
}

/* 32 bytes, base64url. Not uid(): this one is guessed-at rather than merely
   unique, so it wants the full entropy and none of the structure. */
const mintToken = () => randomBytes(32).toString("base64url");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * A fresh code for this landlord. Returns the token ONCE - it is never stored
 * in the clear, so it cannot be read back out and a lost one is reminted.
 */
export async function mintHandoff(
  accountId: string,
  appraisalId: string | null
): Promise<{ token: string; expiresAt: string } | null> {
  if (!hasDb()) return null;
  const token = mintToken();
  const rows = await q<{ expires_at: Date }>(
    `INSERT INTO os_doc_handoffs (id, token_hash, account_id, appraisal_id, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)
     RETURNING expires_at`,
    [uid(), hash(token), accountId, appraisalId, String(HANDOFF_MINUTES)]
  );
  if (!rows[0]) return null;
  return { token, expiresAt: new Date(rows[0].expires_at).toISOString() };
}

/**
 * Who a token belongs to, or null if it is unknown, expired or there is no
 * database. Read-only: the page that renders the phone screen calls this on
 * every paint and must not be what counts a use.
 */
export async function readHandoff(token: string): Promise<Handoff | null> {
  if (!hasDb() || !token) return null;
  const rows = await q<{ account_id: string; appraisal_id: string | null; expires_at: Date }>(
    `SELECT account_id, appraisal_id, expires_at
       FROM os_doc_handoffs
      WHERE token_hash = $1 AND expires_at > NOW()`,
    [hash(token)]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    accountId: r.account_id,
    appraisalId: r.appraisal_id,
    expiresAt: new Date(r.expires_at).toISOString(),
  };
}

/**
 * The same lookup, for an upload, counting the use.
 *
 * Separate from readHandoff so that rendering the page cannot inflate the
 * count - the number says how many SENDS were attempted through this code, and
 * a figure that also counted refreshes would say nothing. It counts the
 * attempt rather than the filed document, because it is claimed before the
 * bytes are written: a code whose uploads all failed is still a code somebody
 * used, which is the thing worth being able to see. The expiry is
 * re-checked here rather than trusted from the render: a landlord can sit on
 * the page past the window, and the upload is where that has to be caught.
 */
export async function useHandoff(token: string): Promise<Handoff | null> {
  if (!hasDb() || !token) return null;
  const rows = await q<{ account_id: string; appraisal_id: string | null; expires_at: Date }>(
    `UPDATE os_doc_handoffs
        SET uses = uses + 1, last_used_at = NOW()
      WHERE token_hash = $1 AND expires_at > NOW()
      RETURNING account_id, appraisal_id, expires_at`,
    [hash(token)]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    accountId: r.account_id,
    appraisalId: r.appraisal_id,
    expiresAt: new Date(r.expires_at).toISOString(),
  };
}

/** Housekeeping. Dead codes are of no interest to anybody. */
export async function purgeHandoffs(): Promise<number> {
  if (!hasDb()) return 0;
  const rows = await q<{ id: string }>(
    `DELETE FROM os_doc_handoffs WHERE expires_at < NOW() - interval '1 day' RETURNING id`
  );
  return rows.length;
}
