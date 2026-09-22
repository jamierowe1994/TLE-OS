import "server-only";
import { hasDb, q } from "@/lib/db";
import { testListing, testViewingsForTenant } from "@/lib/test-overlay";
import { lastSent, sentWords } from "@/lib/confirmations";

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
  /** Booked in the OS: what its confirmation email needs, so it can be sent from the record. */
  booking?: OsBooking;
  /** The confirmation has gone: to whom and when, in words. */
  confirmed?: string | null;
}

export interface OsBooking {
  leadId: string;
  listingId: string | null;
  applicantName: string;
  applicantEmail: string | null;
  address: string;
  startsAt: string;
  minutes: number;
  unaccompanied?: boolean;
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
export async function viewingsForPerson(p: { contactId?: string | null; email?: string | null; leadId?: string | null }): Promise<{ upcoming: PersonViewing[]; past: PersonViewing[] }> {
  const email = (p.email ?? "").trim().toLowerCase();
  const contactId = (p.contactId ?? "").trim();
  const leadId = (p.leadId ?? "").trim();
  if (!hasDb() || (!email && !contactId && !leadId)) return { upcoming: [], past: [] };

  /* Containment on the contacts array: by REX contact id, and by email. A GIN
     index on contacts would make this an index hit; at today's size (a few
     thousand rows) the scan is milliseconds. */
  const wants: string[] = [];
  if (contactId) wants.push(JSON.stringify([{ id: contactId }]));
  if (email) wants.push(JSON.stringify([{ email }]));

  const rows = wants.length
    ? await q<Row>(
        `SELECT v.id, v.listing_id, v.starts_at, v.mins, v.title, v.status, v.cancelled, v.agent, v.feedback_id, v.payload,
                (SELECT f.choice FROM os_viewing_feedback f WHERE f.viewing_id = v.id OR 'rex-' || f.viewing_id = v.id LIMIT 1) AS os_feedback
           FROM os_viewings v
          WHERE v.kind = 'viewing' AND (${wants.map((_, i) => `v.contacts @> $${i + 1}::jsonb`).join(" OR ")})
          ORDER BY v.starts_at DESC
          LIMIT 100`,
        wants
      ).catch(() => [])
    : [];

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

  /* Booked in the OS (22 Sep 2026): the OS's own row, whether or not REX took
     the copy. One REX did take comes back above as rex-<event> once the diary
     has been read, and is not shown twice. The confirmation's state rides
     along, so the record can offer to send it. */
  const own = await q<{ id: string; starts_at: Date; mins: number; where_at: string; author_name: string; rex_event_id: string | null; booking: OsBooking | null }>(
    `SELECT id, starts_at, mins, where_at, author_name, rex_event_id, booking
       FROM os_appointments
      WHERE kind = 'viewing' AND booking IS NOT NULL
        AND (($1 <> '' AND lead_id = $1) OR ($2 <> '' AND LOWER(contact_email) = $2))
      ORDER BY starts_at DESC
      LIMIT 50`,
    [leadId, email]
  ).catch(() => []);
  const seen = new Set(all.map((v) => v.id));
  for (const a of own) {
    if (!a.booking) continue;
    if (a.rex_event_id && seen.has(`rex-${a.rex_event_id}`)) continue;
    const b = a.booking;
    const sent = await lastSent(`viewing|${b.leadId}|${b.listingId ?? "-"}|${new Date(b.startsAt).toISOString()}`).catch(() => null);
    all.push({
      id: `os-${a.id}`,
      startsAt: iso(a.starts_at),
      mins: a.mins ?? 30,
      listingId: b.listingId,
      address: a.where_at || b.address || "A property",
      agent: a.author_name || null,
      status: "booked",
      cancelled: false,
      feedback: false,
      booking: b,
      confirmed: sent ? `Confirmation sent to ${sent.to} on ${sentWords(sent.sentAt)}.` : null,
    });
  }

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
