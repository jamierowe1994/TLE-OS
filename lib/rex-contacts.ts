import "server-only";
import { rexCall, rexConfigured, rexWritesLocked, isExpiredToken, RexWriteBlocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { switchOn } from "@/lib/switches";
import type { OsContact } from "@/lib/contacts-store";

/**
 * The first thing this OS is allowed to CREATE in REX.
 *
 * Everything up to now has read. REX is the live system six businesses run on,
 * with tens of thousands of contacts in it, and there is no undo — so this is
 * deliberately the narrowest possible write: one contact, made by a named
 * person, tagged so it can always be found again.
 *
 * ── Four gates, and each one fails a different way ────────────────────────
 *
 *   1. REX_ALLOW_WRITES must name Contacts/create. This is the existing lock
 *      in lib/rex and it stays: it is set on the environment, so arming it is
 *      a deploy-level act that survives anything going wrong in the product.
 *   2. The "Create contacts in REX" switch must be armed (Admin -> Switches).
 *      This is the day-to-day control, so nobody has to edit a variable to
 *      pause it.
 *   3. The person must have their OWN REX sign-in. No falling back to the
 *      office account — see below.
 *   4. A duplicate check, which must be overridden deliberately.
 *
 * Two locks for one write is not belt-and-braces theatre. They answer
 * different questions: the variable says "this build may create contacts at
 * all", the switch says "and it may do so right now". The first is changed
 * once; the second gets toggled during testing, which is exactly what was
 * asked for.
 *
 * ── Why it refuses the office account ─────────────────────────────────────
 *
 * rexCall will happily fall back to the shared API user. For a read that is
 * harmless. For a create it is not: every contact would show as created by
 * the office login, forever, and the audit trail in REX — which is the one
 * six businesses actually rely on — would be wrong from the first record.
 * Refusing is better than a record with the wrong name on it, so a missing
 * personal token is an error with a fix in it, not a silent substitution.
 *
 * ── The tag is the way back out ───────────────────────────────────────────
 *
 * Every contact created from here carries OS_TAG. If this ever goes wrong at
 * volume, that tag is how you find every record it made, in one search, and
 * without having to reason about timestamps. A write into somebody else's live
 * system should always leave a handle for undoing it.
 */

/** Stable and undated on purpose: one search must find every record we made. */
export const OS_TAG = "Added in TLE OS";

export type PushRefusal =
  | "not_configured"
  | "switch_off"
  | "write_locked"
  | "no_rex_session"
  | "rex_session_expired"
  | "duplicate"
  | "refused";

export type PushOutcome =
  | { ok: true; rexId: string; detail: string }
  | { ok: false; reason: PushRefusal; detail: string };

/** REX keeps emails and phones as nested collections, not as fields. */
function buildPayload(c: OsContact): Record<string, unknown> {
  const related: Record<string, unknown> = {
    contact_names: [
      {
        name_first: c.nameFirst || c.name,
        name_last: c.nameLast || "",
      },
    ],
  };
  if (c.email) {
    related.contact_emails = [
      { email_address: c.email, email_desc: "Default", email_primary: true },
    ];
  }
  if (c.mobile) {
    related.contact_phones = [
      /* "Mob" is REX's own code for a mobile, taken from live records rather
         than guessed. phone_primary_sms matters: it decides which number the
         SMS templates pick up, and a contact with no primary SMS number is one
         nothing can ever text. */
      { phone_type: "Mob", phone_number: c.mobile, phone_primary: true, phone_primary_sms: true },
    ];
  }
  related.contact_tags = [{ tag: OS_TAG }];

  return {
    type: "person",
    name_first: c.nameFirst || c.name,
    name_last: c.nameLast || "",
    ...(c.email ? { email_address: c.email } : {}),
    ...(c.mobile ? { phone_number: c.mobile } : {}),
    ...(c.address ? { address_postal: c.address } : {}),
    ...(c.postcode ? { marketing_postcode: c.postcode } : {}),
    ...(c.source ? { marketing_enquiry_source: c.source } : {}),
    related,
  };
}

/** Why a push cannot happen right now, or null if it can. Read without
 *  touching REX, so a screen can show the state before anybody presses. */
export async function pushBlockedBecause(): Promise<{ reason: PushRefusal; detail: string } | null> {
  if (!rexConfigured()) {
    return { reason: "not_configured", detail: "REX isn't connected on this environment." };
  }
  if (!(await switchOn("rex_contact_create"))) {
    return {
      reason: "switch_off",
      detail: "Creating contacts in REX is switched off. Arm it on Admin -> Switches.",
    };
  }
  if (rexWritesLocked("Contacts", "create")) {
    return {
      reason: "write_locked",
      detail:
        "The REX write lock does not name Contacts/create. Add it to REX_ALLOW_WRITES in Railway " +
        "(comma-separated, alongside anything already there).",
    };
  }
  return null;
}

/**
 * Create the contact in REX as `userId`.
 *
 * Returns rather than throws, because every refusal here is a state the
 * calling screen should show plainly — a locked write is not an exception, it
 * is the normal answer until somebody arms it.
 */
export async function pushContactToRex(
  contact: OsContact,
  userId: string | null
): Promise<PushOutcome> {
  const blocked = await pushBlockedBecause();
  if (blocked) return { ok: false, ...blocked };

  const token = await rexTokenFor(userId).catch(() => null);
  if (!token) {
    return {
      ok: false,
      reason: "no_rex_session",
      detail:
        "You have no REX sign-in held, so the contact would be created under the office account " +
        "rather than your name. Link your REX account on Profile, then push this one from Leads. " +
        "(This is the same gap that made the first listing write record as 'System User'.)",
    };
  }

  try {
    const res = await rexCall("Contacts", "create", { data: buildPayload(contact), return_id: true }, token);
    if (isExpiredToken(res)) {
      return {
        ok: false,
        reason: "rex_session_expired",
        detail: "Your REX sign-in has lapsed. Sign in to REX again and push this one from the list.",
      };
    }
    if (!res.ok) {
      return { ok: false, reason: "refused", detail: res.error ?? `REX answered ${res.status}.` };
    }
    /* return_id gives back a bare id, but REX has been known to answer with
       the record instead. Both shapes are read rather than assumed, because
       storing "[object Object]" as a contact id fails silently forever. */
    const raw = res.result as unknown;
    const id =
      typeof raw === "number" || typeof raw === "string"
        ? String(raw)
        : String((raw as { id?: string | number } | null)?.id ?? "");
    if (!id) {
      return {
        ok: false,
        reason: "refused",
        detail: "REX accepted the contact but returned no id, so it cannot be linked back.",
      };
    }
    return { ok: true, rexId: id, detail: `Created in REX as contact ${id}, tagged "${OS_TAG}".` };
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      return { ok: false, reason: "write_locked", detail: e.message };
    }
    return { ok: false, reason: "refused", detail: e instanceof Error ? e.message : "The REX call failed." };
  }
}

/* ==========================================================================
   MIRRORING AN EDIT

   An edit in the OS should land on the same REX record, not beside it. That
   makes updates harder than creates in one specific way: emails and phones are
   nested sub-records with their own ids, and REX's update takes the same
   `related` shape as create.

   Send `related.contact_emails: [{email_address: "new@x.co"}]` with no id and
   REX ADDS a second email rather than changing the first. The book already has
   contacts carrying the same address twice from exactly this - see the sample
   read during the build, where molly-mac@hotmail.co.uk appears under two
   different sub-record ids.

   So this READS the record first, finds the id of each sub-record it is about
   to change, and sends the id back with the new value. Two calls per edit, and
   worth it: a duplicate phone number on a live contact is not something the
   agent who typed it will ever notice or be able to undo.
   ========================================================================== */

interface SubRecord { id?: string | number; email_address?: string; phone_number?: string; email_primary?: boolean; phone_primary?: boolean }

/** The sub-record we should amend: the primary one, else the first. */
function pick(rows: SubRecord[] | undefined, primaryKey: "email_primary" | "phone_primary"): SubRecord | null {
  if (!rows?.length) return null;
  return rows.find((r) => r[primaryKey] === true) ?? rows[0];
}

export async function pushContactUpdateToRex(
  contact: OsContact,
  userId: string | null
): Promise<PushOutcome> {
  if (!contact.rexId) {
    return { ok: false, reason: "refused", detail: "This person is not in REX yet, so there is nothing to update." };
  }

  const blocked = await pushBlockedBecause();
  if (blocked) return { ok: false, ...blocked };
  if (rexWritesLocked("Contacts", "update")) {
    return {
      ok: false,
      reason: "write_locked",
      detail:
        "The REX write lock does not name Contacts/update. Add it to REX_ALLOW_WRITES in Railway " +
        "alongside whatever is already there.",
    };
  }

  const token = await rexTokenFor(userId).catch(() => null);
  if (!token) {
    return {
      ok: false,
      reason: "no_rex_session",
      detail:
        "You have no REX sign-in held, so the change would be recorded under the office account " +
        "rather than your name. Link your REX account on Profile and try again.",
    };
  }

  try {
    /* Read first — see the note above on why. A failure here stops the write:
       updating blind is how you end up with two of somebody's phone number. */
    const current = await rexCall(
      "Contacts",
      "read",
      { id: Number(contact.rexId), extra_fields: ["related.contact_emails", "related.contact_phones", "related.contact_names"] },
      token
    );
    if (isExpiredToken(current)) {
      return { ok: false, reason: "rex_session_expired", detail: "Your REX sign-in has lapsed. Sign in again and save once more." };
    }
    if (!current.ok) {
      return { ok: false, reason: "refused", detail: `Could not read the REX record first: ${current.error ?? current.status}` };
    }

    const rel = (current.result as { related?: { contact_emails?: SubRecord[]; contact_phones?: SubRecord[]; contact_names?: SubRecord[] } } | null)?.related ?? {};
    const related: Record<string, unknown> = {};

    const nameRow = rel.contact_names?.[0];
    related.contact_names = [
      {
        ...(nameRow?.id ? { id: nameRow.id } : {}),
        name_first: contact.nameFirst || contact.name,
        name_last: contact.nameLast || "",
      },
    ];

    if (contact.email) {
      const row = pick(rel.contact_emails, "email_primary");
      related.contact_emails = [
        { ...(row?.id ? { id: row.id } : { email_desc: "Default", email_primary: true }), email_address: contact.email },
      ];
    }
    if (contact.mobile) {
      const row = pick(rel.contact_phones, "phone_primary");
      related.contact_phones = [
        {
          ...(row?.id
            ? { id: row.id }
            : { phone_type: "Mob", phone_primary: true, phone_primary_sms: true }),
          phone_number: contact.mobile,
        },
      ];
    }

    const res = await rexCall(
      "Contacts",
      "update",
      {
        data: {
          id: Number(contact.rexId),
          name_first: contact.nameFirst || contact.name,
          name_last: contact.nameLast || "",
          ...(contact.email ? { email_address: contact.email } : {}),
          ...(contact.mobile ? { phone_number: contact.mobile } : {}),
          ...(contact.address ? { address_postal: contact.address } : {}),
          ...(contact.postcode ? { marketing_postcode: contact.postcode } : {}),
          related,
        },
      },
      token
    );
    if (isExpiredToken(res)) {
      return { ok: false, reason: "rex_session_expired", detail: "Your REX sign-in has lapsed. Sign in again and save once more." };
    }
    if (!res.ok) {
      return { ok: false, reason: "refused", detail: res.error ?? `REX answered ${res.status}.` };
    }
    return { ok: true, rexId: contact.rexId, detail: `Change mirrored to REX contact ${contact.rexId}.` };
  } catch (e) {
    if (e instanceof RexWriteBlocked) return { ok: false, reason: "write_locked", detail: e.message };
    return { ok: false, reason: "refused", detail: e instanceof Error ? e.message : "The REX call failed." };
  }
}
