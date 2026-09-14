import "server-only";
import { hasDb, q } from "@/lib/db";
import type { ArchiveOverride } from "@/lib/listing-archive";

/**
 * The hand-set exceptions to the two-month draft cap.
 *
 * The cap is computed, not stored (see lib/listing-archive.ts) - this holds
 * only the listings somebody has archived early or pulled back out, keyed by
 * REX listing id.
 *
 * ── Fails OPEN, unlike the compliance chase log ───────────────────────────
 *
 * If the table cannot be read we return no overrides, which means the plain
 * age rule applies and the board still works. That is the right way round
 * here: the worst case is a listing an agent restored yesterday quietly
 * sitting in the archive again for one page load, and they can see it and
 * press the button. The compliance log fails shut because the cost there is
 * a landlord emailed five days running; the cost here is a row in the wrong
 * tab of a screen nobody can break from.
 */
export async function archiveOverrides(): Promise<Map<string, ArchiveOverride>> {
  if (!hasDb()) return new Map();
  try {
    const rows = await q<{ listing_id: string; state: string; at: Date }>(
      `SELECT listing_id, state, at FROM os_listing_archive`
    );
    const out = new Map<string, ArchiveOverride>();
    for (const r of rows) {
      if (r.state !== "archived" && r.state !== "restored") continue;
      out.set(r.listing_id, { state: r.state, at: new Date(r.at).toISOString() });
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Put one listing away, or bring it back.
 *
 * One row per listing, replaced rather than appended: the question this table
 * answers is "where does this listing sit NOW", and a history of somebody
 * changing their mind four times would have to be read backwards to answer it.
 * Who and when are kept on the row for the same reason they are kept anywhere
 * - somebody will ask why a property disappeared.
 */
export async function setArchive(
  listingId: string,
  state: "archived" | "restored",
  by: string | null,
  note?: string | null
): Promise<void> {
  if (!hasDb()) throw new Error("No database on this environment - the archive can't remember that.");
  await q(
    `INSERT INTO os_listing_archive (listing_id, state, note, by_user, at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (listing_id) DO UPDATE
       SET state = EXCLUDED.state, note = EXCLUDED.note, by_user = EXCLUDED.by_user, at = NOW()`,
    [listingId, state, note ?? null, by]
  );
}
