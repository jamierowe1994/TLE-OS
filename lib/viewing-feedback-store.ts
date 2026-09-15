import "server-only";
import { hasDb, q } from "@/lib/db";
import type { ViewingFeedback } from "@/lib/diary";

/**
 * Viewing feedback written in the OS (15 Sep 2026).
 *
 * The Viewings drawer has always asked the right two questions - did they turn
 * up, and how did it land - and then kept the answer on the screen. Nothing was
 * stored, so the viewing stayed "Feedback due" for ever and the tile read as a
 * team that writes nothing down. This is where the answer goes, and the diary
 * lays it onto the viewing (app/api/diary) so it leaves "due" the moment it is
 * saved.
 *
 * REX's own Feedback records win where both exist: that is what the team wrote
 * in REX, and the drawer never offers the form over one. An OS answer can be
 * corrected by saving again - one row per viewing, the latest wins.
 */

export interface FeedbackInput {
  viewingId: string;
  attended: boolean;
  choice: string;
  label: string;
  note: string;
  applicant: string;
  address: string;
  listingId: string | null;
  startsAt: string | null;
}

export async function saveViewingFeedback(f: FeedbackInput, by: { email: string; name: string }): Promise<void> {
  if (!hasDb()) throw new Error("No database here, so the feedback has nowhere to go.");
  await q(
    `INSERT INTO os_viewing_feedback
       (viewing_id, attended, choice, label, note, applicant, address, listing_id, starts_at, by_email, by_name, saved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (viewing_id) DO UPDATE SET
       attended = EXCLUDED.attended, choice = EXCLUDED.choice, label = EXCLUDED.label, note = EXCLUDED.note,
       by_email = EXCLUDED.by_email, by_name = EXCLUDED.by_name, saved_at = NOW()`,
    [
      f.viewingId, f.attended, f.choice.slice(0, 40), f.label.slice(0, 120), f.note.slice(0, 4000),
      f.applicant.slice(0, 200), f.address.slice(0, 300), f.listingId, f.startsAt, by.email, by.name,
    ]
  );
}

/** The OS answers for these viewings, in the diary's own feedback shape. */
export async function osFeedbackFor(ids: string[]): Promise<Map<string, ViewingFeedback>> {
  const out = new Map<string, ViewingFeedback>();
  if (!hasDb() || !ids.length) return out;
  const rows = await q<{
    viewing_id: string; attended: boolean; label: string; note: string; applicant: string; by_name: string; saved_at: Date;
  }>(
    `SELECT viewing_id, attended, label, note, applicant, by_name, saved_at FROM os_viewing_feedback WHERE viewing_id = ANY($1)`,
    [ids]
  ).catch(() => []);
  for (const r of rows) {
    out.set(r.viewing_id, {
      id: `os-feedback-${r.viewing_id}`,
      date: new Date(r.saved_at).toISOString().slice(0, 10),
      type: "Viewing",
      interest: null,
      note: r.note || null,
      who: r.applicant ? [r.applicant] : [],
      agent: r.by_name || null,
      source: "os",
      outcome: r.attended ? r.label || "Attended" : "No-show",
    });
  }
  return out;
}
