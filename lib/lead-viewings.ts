import "server-only";
import { hasDb, q } from "@/lib/db";
import type { LeadViewingRow } from "@/lib/lead-viewings-shape";

/**
 * WHO IS BOOKED IN TO VIEW, for the whole Leads board in one read.
 *
 * Lorna, 21 Oct 2026 (ticket d44f5ea3): "When I've booked a viewing for
 * somebody from the leads, the lead stays there but then I've no way of
 * knowing from the same screen who is booked in to view and who isn't." The
 * lead's own record has always known (lib/person-viewings); the board asked
 * nobody. This is the same answer, for every lead at once.
 *
 * Two places a viewing lives, read the way lib/person-viewings reads them:
 *   os_viewings      REX's diary, read back. Booked in REX or by the OS, it
 *                    names the applicant as a contact (id and email).
 *   os_appointments  a viewing booked in the OS, the moment it is booked,
 *                    before REX has been read back (or when REX refused the
 *                    copy). Keyed by the lead and the applicant's email.
 * One booking that is in both is shown once: the OS row names the REX event
 * it became.
 *
 * From a fortnight back, so a lead viewed last week still says so, to
 * however far ahead anything is booked. Cancelled ones are left out.
 *
 * Scoped like the passports: the office sees every lead's viewings, an agent
 * sees those of the leads that are theirs (REX assignee, or passed on to them
 * in the OS) and the viewings they booked themselves. Never a phone number or
 * an address book - the email is only the key the board already holds.
 */
export async function leadViewings(p: { rexUserId: string | null; osUserId: string | null }): Promise<LeadViewingRow[]> {
  if (!hasDb()) return [];

  const [rex, own, mine] = await Promise.all([
    q<{ id: string; starts_at: Date; listing_id: string | null; title: string; label: string | null; agent: string | null; status: string | null; email: string | null; contact_id: string | null }>(
      `SELECT v.id, v.starts_at, v.listing_id, v.title, v.payload->>'listingLabel' AS label, v.agent, v.status,
              LOWER(TRIM(c->>'email')) AS email, c->>'id' AS contact_id
         FROM os_viewings v, jsonb_array_elements(v.contacts) c
        WHERE v.kind = 'viewing' AND NOT v.cancelled
          AND v.starts_at > NOW() - INTERVAL '14 days'`
    ),
    q<{ id: string; starts_at: Date; where_at: string; author_id: string | null; author_name: string; rex_event_id: string | null; lead_id: string | null; email: string | null; listing_id: string | null }>(
      `SELECT id, starts_at, where_at, author_id, author_name, rex_event_id, lead_id,
              LOWER(TRIM(contact_email)) AS email, booking->>'listingId' AS listing_id
         FROM os_appointments
        WHERE kind = 'viewing' AND booking IS NOT NULL AND cancelled_at IS NULL
          AND starts_at > NOW() - INTERVAL '14 days'`
    ),
    p.rexUserId
      ? q<{ id: string; email: string | null; contact_id: string | null }>(
          `SELECT id, LOWER(TRIM(email)) AS email, contact_id FROM os_leads
            WHERE assignee_id = $1
               OR id IN (SELECT lead_id FROM os_lead_owners WHERE to_rex_user_id = $1)`,
          [p.rexUserId]
        )
      : Promise.resolve(null),
  ]);

  const out: LeadViewingRow[] = [];
  const seenRex = new Set<string>();
  for (const v of rex) {
    seenRex.add(v.id);
    out.push({
      id: v.id,
      email: v.email ?? "",
      contactId: v.contact_id ?? null,
      leadId: null,
      startsAt: new Date(v.starts_at).toISOString(),
      address: (v.label || v.title || "").replace(/^.*?viewing\s*(?:at\s+|[-:]\s*)?/i, "").replace(/\s+with\s+.*$/i, "").trim(),
      agent: v.agent ?? null,
      bookedHere: false,
    });
  }
  const mineByOs = new Set<string>();
  for (const a of own) {
    if (a.rex_event_id && seenRex.has(`rex-${a.rex_event_id}`)) {
      /* The same booking: the REX row stays, but it was booked here, and by whom. */
      for (const r of out) if (r.id === `rex-${a.rex_event_id}`) { r.leadId = a.lead_id; r.bookedHere = true; }
      if (a.author_id && a.author_id === p.osUserId) mineByOs.add(`rex-${a.rex_event_id}`);
      continue;
    }
    if (a.author_id && a.author_id === p.osUserId) mineByOs.add(`os-${a.id}`);
    out.push({
      id: `os-${a.id}`,
      email: a.email ?? "",
      contactId: null,
      leadId: a.lead_id,
      startsAt: new Date(a.starts_at).toISOString(),
      address: (a.where_at ?? "").trim(),
      agent: a.author_name || null,
      bookedHere: true,
    });
  }

  if (!mine) return out;
  const emails = new Set(mine.map((l) => l.email).filter(Boolean) as string[]);
  const contacts = new Set(mine.map((l) => l.contact_id).filter(Boolean) as string[]);
  const leads = new Set(mine.map((l) => l.id));
  return out.filter(
    (r) => mineByOs.has(r.id) || (r.email && emails.has(r.email)) || (r.contactId && contacts.has(r.contactId)) || (r.leadId && leads.has(r.leadId))
  );
}
