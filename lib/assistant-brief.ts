import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * The assistant's standing brief — who he is, not what he knows.
 *
 * One free-text field, written by James, that goes into the system prompt ahead
 * of the knowledge base. See the table comment in lib/db.ts for why it is
 * separate from `assistant_knowledge`.
 *
 * Capped because it shares a context window with everything the business has
 * written down, and because a brief that runs to thousands of words stops being
 * a brief. Twelve thousand characters is roughly four pages — far more than
 * "how to talk and what you're for" needs, and comfortably short of crowding
 * out the facts.
 */

export const BRIEF_MAX = 12_000;

export interface Brief {
  body: string;
  updatedBy: string;
  updatedAt: string | null;
}

const EMPTY: Brief = { body: "", updatedBy: "", updatedAt: null };

export async function getBrief(): Promise<Brief> {
  if (!hasDb()) return EMPTY;
  try {
    const rows = await q<{ body: string; updated_by: string; updated_at: string }>(
      `SELECT body, updated_by, updated_at::text AS updated_at
       FROM os_assistant_brief WHERE id = 'brief'`
    );
    const r = rows[0];
    return r ? { body: r.body, updatedBy: r.updated_by, updatedAt: r.updated_at } : EMPTY;
  } catch {
    /* No brief is a valid state — he falls back to the built-in persona rather
       than failing to answer. */
    return EMPTY;
  }
}

export async function setBrief(body: string, by: string): Promise<Brief> {
  const trimmed = body.slice(0, BRIEF_MAX);
  await q(
    `INSERT INTO os_assistant_brief (id, body, updated_by, updated_at)
     VALUES ('brief', $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [trimmed, by]
  );
  return { body: trimmed, updatedBy: by, updatedAt: new Date().toISOString() };
}
