import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import type { ViewingFeedback } from "@/lib/diary";

/**
 * WHAT THEY SAID AFTER THE VIEWING, out of REX.
 *
 * REX keeps viewing feedback in its own `Feedback` service - NOT on the
 * calendar event and not on the listing. The event carries only a linked
 * record pointing at it (`records[].service === "Feedback"`), which is an id
 * and nothing else: no note, no interest level, no name. The OS read that id,
 * used it as a boolean, and threw it away.
 *
 * ── What is actually in there (measured 14 Sep 2026) ──────────────────────
 *
 * The account holds over 10,000 feedback records and the team is still
 * writing them - the newest carry today's date. So "nobody records feedback"
 * was never true. But two things are worth knowing before reading any figure
 * off this:
 *
 *   • Most of it is ENQUIRY feedback, not viewing feedback. Of the 200 newest
 *     rows, 158 were type Enquiry, 38 Viewing, 4 Price Reduction.
 *   • On the CURRENT RENTAL BOOK only 40 of 412 past, uncancelled viewings
 *     have a feedback record attached at all. That is the real number behind
 *     "feedback due", and it is a process fact rather than a bug.
 *
 * An interest level is rarer still: 33 of the newest 300 rows carry one, and
 * 47 carry a written note. So both are optional here, and a viewing with a
 * feedback record but no words is a real and common state - it says somebody
 * logged the visit, not that they wrote it up.
 */

interface RexFeedback {
  id?: string | number;
  date_of?: string | null;
  note?: string | null;
  feedback_type?: { text?: string | null } | null;
  interest_level?: { text?: string | null } | null;
  agent?: { name?: string | null } | null;
  related?: {
    feedback_contacts?: { contact?: { name?: string | null } | null; name?: string | null }[] | null;
  } | null;
}

function toFeedback(f: RexFeedback): ViewingFeedback | null {
  if (f.id == null) return null;
  const note = typeof f.note === "string" && f.note.trim() ? f.note.trim() : null;
  const level = f.interest_level?.text?.trim() || null;
  return {
    id: String(f.id),
    date: f.date_of ?? null,
    type: f.feedback_type?.text?.trim() || null,
    /* Hot / Warm / Cold, in REX's own words. Deliberately NOT translated into
       the OS's "Applying / Thinking / Not for them": those are a different
       question (what happens next) and mapping one onto the other would put
       words in a viewer's mouth that nobody wrote down. */
    interest: level === "Hot" || level === "Warm" || level === "Cold" ? level : null,
    note,
    who: (f.related?.feedback_contacts ?? [])
      .map((c) => (c.contact?.name ?? c.name ?? "").trim())
      .filter(Boolean),
    agent: f.agent?.name?.trim() || null,
  };
}

/**
 * The feedback behind a set of ids, keyed by id.
 *
 * Batched, because the ids arrive from a diary pull that has already made
 * enough REX calls - and REX commonly takes ~15s per call, so one search for
 * sixty ids is the difference between a page and a page-load.
 */
export async function feedbackByIds(ids: string[]): Promise<Map<string, ViewingFeedback>> {
  const out = new Map<string, ViewingFeedback>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!rexConfigured() || !wanted.length) return out;

  for (let i = 0; i < wanted.length; i += 60) {
    const batch = wanted.slice(i, i + 60);
    const res = await rexCall("Feedback", "search", {
      criteria: [{ name: "id", type: "in", value: batch }],
      limit: 100,
    });
    if (!res.ok) continue; /* feedback is a nicety; a diary without it still works */
    for (const row of rexRows(res.result) as RexFeedback[]) {
      const f = toFeedback(row);
      if (f) out.set(f.id, f);
    }
  }
  return out;
}

/** Everything REX holds against one listing, newest first. */
export async function feedbackForListing(listingId: string): Promise<ViewingFeedback[]> {
  if (!rexConfigured() || !listingId) return [];
  const res = await rexCall("Feedback", "search", {
    criteria: [{ name: "listing_id", value: String(listingId) }],
    limit: 100,
  });
  if (!res.ok) return [];
  return (rexRows(res.result) as RexFeedback[])
    .map(toFeedback)
    .filter((f): f is ViewingFeedback => f != null)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
