import { hasDb, q } from "@/lib/db";
import { ago } from "@/lib/rex-leads";
import type { Lead } from "@/lib/leads-sample";

/**
 * Contacts added by hand, read back as leads.
 *
 * ── The bug this exists to fix ────────────────────────────────────────────
 *
 * "Add new lead" wrote a row to os_contacts, pushed it to REX, and said it was
 * saved. Nothing in the OS ever read os_contacts back. The Leads board is
 * REX's own book widened by the ledger, and a hand-added contact is in
 * neither - so an agent typed somebody in, was told it worked, and then could
 * not find them anywhere (James, 13 Sep 2026).
 *
 * ── Why they are merged at read time rather than written into the ledger ──
 *
 * os_leads is the record of what REX's scan has seen, and its rows are
 * overwritten by the next scan. A hand-added contact is not a REX lead and
 * would be either clobbered or quietly resurrected. Reading them alongside
 * keeps each table meaning one thing, and means a contact saved ten seconds
 * ago appears immediately rather than behind the board's two-minute cache.
 *
 * The id is prefixed `os-` so everything downstream can tell the difference:
 * there is no REX lead behind it, so nothing should go asking REX for its
 * enquiry.
 */

type Row = {
  id: string;
  kind: string;
  name: string;
  email: string | null;
  mobile: string | null;
  address: string | null;
  postcode: string | null;
  source: string | null;
  enquiry: string | null;
  notes: string | null;
  created_by: string | null;
  /** Their name on the staff list, so the board says "For Rhiannon Dodge" rather than an email. */
  created_by_name?: string | null;
  created_at: string;
  rex_id: string | null;
};

/** The prefix that says "ours, not REX's". */
export const OS_LEAD_PREFIX = "os-";

export const isOsContactLead = (id: string): boolean => id.startsWith(OS_LEAD_PREFIX);

/** The contact id behind an `os-` lead id. */
export const contactIdOf = (leadId: string): string => leadId.slice(OS_LEAD_PREFIX.length);

function toLead(r: Row): Lead {
  const landlord = r.kind === "landlord";
  const when = new Date(r.created_at);
  const area = [r.address, r.postcode].filter(Boolean).join(", ");
  return {
    id: OS_LEAD_PREFIX + r.id,
    name: r.name,
    email: r.email ?? "",
    phone: r.mobile ?? "",
    enquiry: landlord ? "Landlord" : "Letting",
    area,
    budget: "",
    /* Where it came from if they said, otherwise the plain truth. */
    source: r.source?.trim() || "Added by hand",
    received: ago(Math.floor(when.getTime() / 1000)),
    receivedAt: when.toISOString(),
    stage: "New",
    moveDate: "",
    preferred: area,
    agent: r.created_by_name || r.created_by || "",
    notes: r.notes ?? "",
    activity: [],
    address: r.address ?? undefined,
    /* Their REX contact, when the push landed - so email and campaigns have
       something to file against, exactly as a REX lead does. */
    contactId: r.rex_id ?? undefined,
    enquiryMessage: r.enquiry?.trim() || undefined,
  };
}

/**
 * Every hand-added contact, newest first.
 *
 * `createdBy` null means unscoped - an owner looking at the whole business.
 * An agent sees the ones they typed in: there is no REX assignee on a row
 * that has never been a REX lead, so who added it is the only honest owner.
 */
export async function contactsAsLeads(createdBy: string | null, limit = 200): Promise<Lead[]> {
  if (!hasDb()) return [];
  const cols = `id, kind, name, email, mobile, address, postcode, source, enquiry, notes,
                created_by, created_at::text AS created_at, rex_id,
                (SELECT NULLIF(u.name, '') FROM os_users u WHERE lower(u.email) = lower(os_contacts.created_by) LIMIT 1) AS created_by_name`;
  const rows = await q<Row>(
    createdBy
      ? `SELECT ${cols} FROM os_contacts WHERE created_by = $2 ORDER BY created_at DESC LIMIT $1`
      : `SELECT ${cols} FROM os_contacts ORDER BY created_at DESC LIMIT $1`,
    createdBy ? [limit, createdBy] : [limit]
  ).catch(() => []);
  return rows.map(toLead);
}
