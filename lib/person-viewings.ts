import "server-only";
import { hasDb, q } from "@/lib/db";
import { testListing, testViewingsForTenant } from "@/lib/test-overlay";

/**
 * EVERY VIEWING ONE PERSON HAS BEEN TO, or is going to.
 *
 * James, 20 Sep 2026: "there's literally nowhere that I can view what
 * properties they've already viewed". The viewings ledger is written per
 * LISTING (lib/rex-viewings), and every reader until now asked it about a
 * property. This asks it about a person.
 *
 * Matched on the REX contact id where the lead has one, and on the email
 * address either way - REX names an attendee by contact, the OS's own
 * bookings by address, and somebody who enquired twice is one person.
 *
 * A test file's viewings (lib/test-overlay) come too, so a test tenant's
 * record reads like a real one. Nothing here writes anything.
 */

export interface PersonViewing {
  id: string;
  startsAt: string;
  mins: number;
  listingId: string | null;
  address: string;
  agent: string | null;
  status: string | null;
  cancelled: boolean;
  /** Feedback exists for it - REX's, or the OS's own write-up. */
  feedback: boolean;
  /** A test file's viewing, so the screen can say so. */
  test?: boolean;
}

type Row = {
  id: string;
  listing_id: string | null;
  starts_at: Date;
  mins: number;
  title: string;
  status: string | null;
  cancelled: boolean;
  agent: string | null;
  feedback_id: string | null;
  payload: { listingLabel?: string | null } | null;
  os_feedback: string | null;
};

const iso = (d: Date | string) => new Date(d).toISOString();

/** Upcoming first, then the ones that have been, newest first. */
export async function viewingsForPerson(p: { contactId?: string | null; email?: string | null }): Promise<{ upcoming: PersonViewing[]; past: PersonViewing[] }> {
  const email = (p.email ?? "").trim().toLowerCase();
  const contactId = (p.contactId ?? "").trim();
  if (!hasDb() || (!email && !contactId)) return { upcoming: [], past: [] };

  /* Containment on the contacts array: by REX contact id, and by email. A GIN
     index on contacts would make this an index hit; at today's size (a few
     thousand rows) the scan is milliseconds. */
  const wants: string[] = [];
  if (contactId) wants.push(JSON.stringify([{ id: contactId }]));
  if (email) wants.push(JSON.stringify([{ email }]));

  const rows = await q<Row>(
    `SELECT v.id, v.listing_id, v.starts_at, v.mins, v.title, v.status, v.cancelled, v.agent, v.feedback_id, v.payload,
            (SELECT f.choice FROM os_viewing_feedback f WHERE f.viewing_id = v.id OR 'rex-' || f.viewing_id = v.id LIMIT 1) AS os_feedback
       FROM os_viewings v
      WHERE v.kind = 'viewing' AND (${wants.map((_, i) => `v.contacts @> $${i + 1}::jsonb`).join(" OR ")})
      ORDER BY v.starts_at DESC
      LIMIT 100`,
    wants
  ).catch(() => []);

  const all: PersonViewing[] = rows.map((r) => ({
    id: r.id,
    startsAt: iso(r.starts_at),
    mins: r.mins ?? 30,
    listingId: r.listing_id,
    address: (r.payload?.listingLabel || r.title || "").replace(/^viewing[:\s-]+/i, "").trim() || "A property",
    agent: r.agent,
    status: r.status,
    cancelled: r.cancelled,
    feedback: Boolean(r.feedback_id || r.os_feedback),
  }));

  /* A test file's viewings, for the tester walking their own test tenant. */
  if (email) {
    for (const v of await testViewingsForTenant(email).catch(() => [])) {
      const l = await testListing(v.listingId).catch(() => null);
      all.push({
        id: `os-${v.appointmentId}`,
        startsAt: v.startsAt,
        mins: 30,
        listingId: String(v.listingId),
        address: l ? `${l.name}, ${l.locality} ${l.postcode}`.trim() : "A test property",
        agent: v.withName,
        status: v.done ? "completed" : "booked",
        cancelled: false,
        feedback: v.done,
        test: true,
      });
    }
  }

  const now = Date.now();
  const live = all.filter((v) => !v.cancelled);
  return {
    upcoming: live.filter((v) => new Date(v.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: live.filter((v) => new Date(v.startsAt).getTime() < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
  };
}
