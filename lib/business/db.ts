import "server-only";
import { hasDb, q as osQuery, qShared } from "@/lib/db";

/**
 * The database seam for the ported portal code.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * `lib/db`'s `q()` refuses any INSERT/UPDATE/DELETE against a table that is
 * not `os_`-prefixed. That guard exists because the OS and the TLE portal
 * share one Postgres, and a typo in OS code must never be able to corrupt the
 * portal's live business data.
 *
 * Susan's stats are now ported INTO the OS, and they legitimately own nine
 * portal tables. Under `q()` every write would be refused — which is the guard
 * doing exactly its job, on code that is now on the right side of the line.
 *
 * ── Why an allowlist rather than lifting the guard ────────────────────────
 *
 * The temptation is to route this code through `qShared` wholesale, which
 * accepts anything with a reason string. That would hand the ported code the
 * run of the entire shared database — including `users`, the portal's own
 * account table with its password hashes — on the strength of a comment.
 *
 * So the tables are NAMED. A write to one of these nine passes; a write to
 * anything else is refused exactly as it would be in the rest of the OS. When
 * the portal is finally stripped out these tables get renamed `os_` and this
 * file is deleted.
 *
 * MEASURED, not assumed: this is the complete set of tables the ported code
 * writes to, taken by grepping every INSERT/UPDATE/DELETE in lib/business.
 */
const OWNED = new Set([
  "actual_overrides",
  "arrears_snapshots",
  "assistant_knowledge",
  "forecasts",
  "gci_months",
  "history_funnels",
  "integration_cache",
  "propoly_cache",
  /* payprop_tokens — and this one is not optional, it is load-bearing.
   *
   * PayProp UK is OAuth-only. Its refresh token ROTATES: every refresh returns
   * a new one and invalidates the old. The token lives in this single shared
   * row, which both products read.
   *
   * Leave it off this list and the failure is silent and total. TLE OS reads
   * the token, refreshes, PayProp issues a new one and kills the old — and the
   * write-back is REFUSED. The row still holds the dead token. The next call
   * from either product gets invalid_grant, and every PayProp figure in BOTH
   * apps quietly becomes zero. Nothing errors loudly; the money simply
   * disappears from the screen.
   *
   * The rule that follows, and it must survive this file:
   * THERE IS ONLY EVER ONE REFRESHER. Both products share one row precisely so
   * that whoever refreshes writes the new token back for the other. Two
   * independent token stores would invalidate each other on alternate calls. */
  "payprop_tokens",
]);

/* `users` is DELIBERATELY NOT in that list.
 *
 * The portal's own account table, with its password hashes. The ported code
 * touches it (users-store), and it must not be able to write to it from here:
 * the OS has its own `os_users`, and two products writing accounts into one
 * table is how somebody ends up locked out of one by a change made in the
 * other. Reads are fine and are how the OS resolves a portal agent. */

const WRITE = /^\s*(insert\s+into|update|delete\s+from)\s+["']?([a-z_][a-z0-9_]*)/i;

export { hasDb };

/**
 * Query as the ported portal code.
 *
 * Reads go straight through. Writes to an owned table are passed to `qShared`
 * with the reason recorded; anything else falls back to `q()`, which refuses
 * it with the OS's own message.
 */
export async function q<Row extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<Row[]> {
  const m = text.match(WRITE);
  if (!m) return osQuery<Row>(text, params);

  const table = m[2].toLowerCase();
  if (!OWNED.has(table)) {
    // Not ours — let the OS's guard say so, in its own words.
    return osQuery<Row>(text, params);
  }
  return qShared<Row>(
    text,
    params,
    `Susan's business stats, ported from the TLE portal on 27 Aug 2026 — "${table}" is one of the nine tables that work owns. See lib/business/db.ts.`
  );
}
