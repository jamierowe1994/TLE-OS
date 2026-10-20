import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * INTRO ONLY (training call, 16 Oct 2026).
 *
 * Some landlords only want us to advertise, market and find the tenant; they
 * do the rest themselves (Sean McMahon has several, and two of another
 * agent's landlords already use OpenRent and want applicants guided through
 * it). The agent invoices for the introduction and nothing more happens in
 * the OS: once the tenant is introduced and agreed, the let stops. No PLC,
 * no push to Propoly, no compliance chasing, no Portfolio, no rent box, no
 * landlord or tenant chasers.
 *
 * Kept in the OS only. REX's service list is managed / rent collect / let
 * only, so a new intro-only listing goes to REX as let only (its nearest) and
 * this mark is what makes it intro only. One row per listing; no row means
 * the listing's own service stands. Nobody's existing files are relabelled
 * from here - James clears those through himself.
 */

export type IntroSource = "listing" | "new-listing" | "appraisal";

let cache: { at: number; ids: Set<string> } | null = null;
const KEEP_MS = 30_000;

/** Every listing marked intro only, as strings. Empty without a database. */
export async function introOnlyIds(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  if (cache && Date.now() - cache.at < KEEP_MS) return cache.ids;
  /* A failed read is not kept: the next call asks again. */
  const rows = await q<{ listing_id: string }>(`SELECT listing_id FROM os_intro_only`).catch(() => null);
  if (!rows) return cache?.ids ?? new Set();
  const ids = new Set(rows.map((r) => String(r.listing_id)));
  cache = { at: Date.now(), ids };
  return ids;
}

export async function isIntroOnly(listingId: string | number | null | undefined): Promise<boolean> {
  if (listingId == null || listingId === "") return false;
  return (await introOnlyIds()).has(String(listingId));
}

/** Who marked it and when, for the listing page. Null when it isn't. */
export async function introOnlyMark(listingId: string | number): Promise<{ by: string; at: string; source: string } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ by_name: string; set_at: Date; source: string }>(`SELECT by_name, set_at, source FROM os_intro_only WHERE listing_id = $1`, [String(listingId)]).catch(() => []);
  const r = rows[0];
  return r ? { by: r.by_name, at: new Date(r.set_at).toISOString(), source: r.source } : null;
}

export async function setIntroOnly(listingId: string | number, on: boolean, o: { by: string; source?: IntroSource }): Promise<void> {
  const id = String(listingId);
  if (on) {
    await q(
      `INSERT INTO os_intro_only (listing_id, source, by_name) VALUES ($1,$2,$3)
       ON CONFLICT (listing_id) DO UPDATE SET source = EXCLUDED.source, by_name = EXCLUDED.by_name, set_at = NOW()`,
      [id, o.source ?? "listing", o.by]
    );
  } else {
    await q(`DELETE FROM os_intro_only WHERE listing_id = $1`, [id]);
  }
  cache = null;
}

/**
 * The file's service changed (the valuation, Change the fees): the listing
 * behind it follows, where there is one yet. The listing made from the file
 * (os_case_state 'direct-listing'), else the current listing on its home.
 * Never throws - the file's own save already stands.
 */
export async function followFile(ma: { id: string; rexPropertyId: string | null; serviceLevel: string | null }, by: string): Promise<void> {
  if (!hasDb()) return;
  try {
    const made = await q<{ listing_id: string | null }>(
      `SELECT payload->>'listingId' AS listing_id FROM os_case_state WHERE kind = 'direct-listing' AND record_id = $1`,
      [ma.id]
    ).catch(() => []);
    let listingId = made[0]?.listing_id ?? null;
    if (!listingId && ma.rexPropertyId) {
      const { currentListingOn } = await import("@/lib/rex-listing-create");
      listingId = await currentListingOn(ma.rexPropertyId).catch(() => null);
    }
    if (!listingId) return;
    const on = ma.serviceLevel === "intro_only";
    if (on === (await isIntroOnly(listingId))) return;
    await setIntroOnly(listingId, on, { by, source: "appraisal" });
  } catch {
    /* The listing page can still be set by hand. */
  }
}

/** Whether the let behind this application (a REX one, an OS offer or a test file) is intro only. */
export async function applicationIsIntroOnly(applicationId: string | null | undefined): Promise<boolean> {
  if (!applicationId) return false;
  try {
    const { isTestId, testApplication } = await import("@/lib/test-overlay");
    if (isTestId(applicationId)) return isIntroOnly((await testApplication(applicationId).catch(() => null))?.app.listingId);
    const { getApplicationById } = await import("@/lib/applications");
    return isIntroOnly((await getApplicationById(applicationId).catch(() => null))?.listingId);
  } catch {
    return false;
  }
}

/**
 * The keys on a marketing-only let (Sean McMahon, 20 Oct 2026: "the last
 * thing is the move-in date and hand over the keys ... I need to be around to
 * give the keys out"). Off unless the agent turns it on: Dan Richards's
 * OpenRent landlord holds her own.
 */
export type IntroKeys = { on: boolean; at: string | null; note: string; doneAt: string | null; by: string };

export async function introKeys(listingId: string | number): Promise<IntroKeys | null> {
  if (!hasDb()) return null;
  const rows = await q<{ keys_handover: boolean; keys_at: Date | null; keys_note: string; keys_done_at: Date | null; keys_by: string }>(
    `SELECT keys_handover, keys_at, keys_note, keys_done_at, keys_by FROM os_intro_only WHERE listing_id = $1`,
    [String(listingId)]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return null;
  return { on: r.keys_handover, at: r.keys_at ? new Date(r.keys_at).toISOString() : null, note: r.keys_note, doneAt: r.keys_done_at ? new Date(r.keys_done_at).toISOString() : null, by: r.keys_by };
}

export async function setIntroKeys(listingId: string | number, p: { on: boolean; at: string | null; note: string; done: boolean; by: string }): Promise<IntroKeys | null> {
  await q(
    `UPDATE os_intro_only SET keys_handover = $2, keys_at = $3, keys_note = $4,
            keys_done_at = CASE WHEN $5 THEN COALESCE(keys_done_at, NOW()) ELSE NULL END, keys_by = $6
      WHERE listing_id = $1`,
    [String(listingId), p.on, p.on ? p.at : null, p.note.slice(0, 300), p.on && p.done, p.by]
  );
  return introKeys(listingId);
}
