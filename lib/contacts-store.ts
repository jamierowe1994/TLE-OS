import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * People added in the OS.
 *
 * ── Saving and pushing are two acts, on purpose ───────────────────────────
 *
 * The obvious design is one button that writes to REX and reports what REX
 * said. It is wrong here, because the REX write is gated twice (an env-level
 * allowlist and a switch) and will be refused far more often than not during
 * a pilot. Tying Save to it means an agent who has just spent twenty minutes
 * on the phone loses the lot to a lock they cannot see and did not set.
 *
 * So this table always takes the record, and `rexState` says honestly what
 * happened next. A row that reads "held" is not a failure — it is work banked,
 * waiting for the lock to come off, and it can be pushed later without anybody
 * re-typing anything.
 *
 * ── It replaces a Save button that saved nothing ──────────────────────────
 *
 * NewLeadPanel's Save called `onCreated?.(d)` — an OPTIONAL callback that its
 * only caller never passed — and then showed "Saved to Leads". Nothing was
 * written anywhere. The lesson taken here is that persistence must not be
 * injected: the panel now posts to an endpoint that always writes, so there is
 * no arrangement of props that can make the button quietly inert again.
 */

export type RexState = "held" | "sent" | "failed" | "linked";

export interface OsContact {
  id: string;
  kind: "tenant" | "landlord";
  name: string;
  nameFirst: string;
  nameLast: string;
  email: string;
  mobile: string;
  address: string;
  postcode: string;
  source: string;
  enquiry: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  rexId: string | null;
  rexState: RexState;
  rexDetail: string;
  rexAt: string | null;
  rexBy: string;
}

export interface NewContact {
  kind: "tenant" | "landlord";
  name: string;
  email?: string;
  mobile?: string;
  address?: string;
  postcode?: string;
  source?: string;
  enquiry?: string;
  notes?: string;
}

/**
 * "Sarah Jane Johnson" -> first "Sarah Jane", last "Johnson".
 *
 * REX keeps names split, and the whole string in name_first is how a book ends
 * up unsearchable by surname. Everything before the final token is the given
 * name, which handles middle names and gets double-barrelled surnames wrong in
 * the same way every CRM does — the single-word case ("Cher") keeps the name
 * as the FIRST name, because a record with only a surname reads as a company.
 */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

type Row = {
  id: string; kind: string; name: string; name_first: string; name_last: string;
  email: string; mobile: string; address: string; postcode: string; source: string;
  enquiry: string; notes: string; created_by: string; created_at: string;
  rex_id: string | null; rex_state: string; rex_detail: string;
  rex_at: string | null; rex_by: string;
};

function toContact(r: Row): OsContact {
  return {
    id: r.id,
    kind: r.kind === "landlord" ? "landlord" : "tenant",
    name: r.name,
    nameFirst: r.name_first,
    nameLast: r.name_last,
    email: r.email,
    mobile: r.mobile,
    address: r.address,
    postcode: r.postcode,
    source: r.source,
    enquiry: r.enquiry,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    rexId: r.rex_id,
    rexState: (["held", "sent", "failed", "linked"] as const).includes(r.rex_state as RexState)
      ? (r.rex_state as RexState)
      : "held",
    rexDetail: r.rex_detail,
    rexAt: r.rex_at,
    rexBy: r.rex_by,
  };
}

const COLUMNS = `id, kind, name, name_first, name_last, email, mobile, address, postcode,
  source, enquiry, notes, created_by, created_at::text AS created_at,
  rex_id, rex_state, rex_detail, rex_at::text AS rex_at, rex_by`;

/** Write the record. Throws if there is no database — a Save that cannot save
 *  must say so rather than return a cheerful object nobody stored. */
export async function saveContact(c: NewContact, createdBy: string): Promise<OsContact> {
  if (!hasDb()) throw new Error("No database is connected, so this cannot be saved.");
  const { first, last } = splitName(c.name);
  const id = randomUUID();
  const rows = await q<Row>(
    `INSERT INTO os_contacts
       (id, kind, name, name_first, name_last, email, mobile, address, postcode,
        source, enquiry, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${COLUMNS}`,
    [
      id, c.kind, c.name.trim(), first, last,
      (c.email ?? "").trim(), (c.mobile ?? "").trim(), (c.address ?? "").trim(),
      (c.postcode ?? "").trim(), (c.source ?? "").trim(), (c.enquiry ?? "").trim(),
      (c.notes ?? "").trim(), createdBy,
    ]
  );
  return toContact(rows[0]);
}

/**
 * Record what REX did with it.
 *
 * `detail` is kept even on success, because "created as a new contact" and
 * "matched an existing one" are different facts that both end in a rex_id, and
 * a month later nobody remembers which.
 */
export async function markRex(
  id: string,
  state: RexState,
  detail: string,
  rexId: string | null,
  by: string
): Promise<void> {
  if (!hasDb()) return;
  await q(
    `UPDATE os_contacts
        SET rex_state = $2, rex_detail = $3, rex_id = COALESCE($4, rex_id),
            rex_at = NOW(), rex_by = $5
      WHERE id = $1`,
    [id, state, detail.slice(0, 500), rexId, by]
  );
}

export async function getContact(id: string): Promise<OsContact | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT ${COLUMNS} FROM os_contacts WHERE id = $1`, [id]);
  return rows[0] ? toContact(rows[0]) : null;
}

/** Newest first. `state` narrows to one outcome — "held" is the useful one,
 *  because it is the list of everything still waiting to reach REX. */
export async function listContacts(opts?: { state?: RexState; limit?: number }): Promise<OsContact[]> {
  if (!hasDb()) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const rows = opts?.state
    ? await q<Row>(
        `SELECT ${COLUMNS} FROM os_contacts WHERE rex_state = $1 ORDER BY created_at DESC LIMIT $2`,
        [opts.state, limit]
      )
    : await q<Row>(`SELECT ${COLUMNS} FROM os_contacts ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map(toContact);
}
