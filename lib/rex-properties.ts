import "server-only";
import { isTestFile, TEST_REFUSAL } from "@/lib/test-guard";
import { rexCall, rexConfigured, rexRows, rexWritesLocked, isExpiredToken } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import { switchOn } from "@/lib/switches";

/**
 * CREATING A PROPERTY IN REX — the break in the landlord → property → deal chain.
 *
 * ── Why this had to be written rather than unlocked ───────────────────────
 *
 * `Properties/create` appears nowhere in this OS. A landlord could be created
 * and then nothing could be attached to them: a listing needs a property, and
 * a tenancy application needs a listing. Every other write in the chain was a
 * variable away; this one was a road that had never been built.
 *
 * ── The payload is COPIED, not guessed ────────────────────────────────────
 *
 * Read off a real TLE record on 1 Sep 2026 — 77 Latimer Street, property
 * 26723125 — rather than inferred from documentation:
 *
 *   adr_street_number "77", adr_street_name "Latimer Street",
 *   adr_suburb_or_town "Leicester", adr_postcode "LE3 0QF", adr_country "uk"
 *   property_category    { id: "residential" }
 *   property_subcategory { id: "26529", text: "Terraced House" }
 *   contact_reln_property [{ reln_type: { id: "owner" }, contact: { id } }]
 *
 * **`reln_type.id` is the string "owner"** — that is how a landlord is joined
 * to a property, and it is the one field that makes this more than an address.
 * Note the subcategory ids are ACCOUNT-SPECIFIC numbers, not a standard
 * vocabulary, so they have to be looked up rather than hardcoded.
 *
 * The nested `related` shape follows the pattern already proven on the F&C
 * pipeline and on Listings/update: REX has no separate join endpoint, the
 * nested update IS the write path.
 *
 * ── Four gates, and no office fallback ────────────────────────────────────
 *
 * The same four lib/rex-contacts uses, for the same reasons. The last one
 * matters most: a create with no personal token is recorded against the
 * office account as "System User", which is exactly what happened to the
 * first listing write on 29 Aug. A property nobody can be shown to have
 * created is worse than a property that was never created.
 *
 * ── NEVER EXECUTED ────────────────────────────────────────────────────────
 *
 * At the time of writing this has not run against live REX. The shape is read
 * from real records, which is the strongest evidence available short of a
 * write, but it is not the same thing. The first one is supervised and uses a
 * clearly-marked test address.
 */

export interface NewProperty {
  /** "Flat 3" - REX's own unit field (adr_unit_number, in its model). */
  unitNumber?: string | null;
  streetNumber: string;
  streetName: string;
  town: string;
  postcode: string;
  /** REX's own category id — "residential" on every TLE record seen. */
  categoryId?: string;
  /** Account-specific subcategory id, e.g. "26529" for a terraced house. */
  subcategoryId?: string | null;
  /** The landlord's REX contact id, joined as reln_type "owner". */
  ownerContactId?: string | null;
}

/** `detail` is safe for any agent to read; `ownerDetail`, when there is one, names the lock. */
export type CreateOutcome =
  | { ok: true; propertyId: string; ownerDropped?: boolean }
  | {
      ok: false;
      reason: string;
      detail: string;
      ownerDetail?: string;
      /** reason "already_in_rex": the record(s) REX holds at this address, when it would say. */
      existing?: { id: string; name: string }[];
    };

/**
 * REX refused the create because it already holds the address. Ask its index
 * for the record so the agent can link it rather than search for it.
 */
async function alreadyHeld(p: NewProperty, token: string): Promise<{ id: string; name: string }[]> {
  const pc = p.postcode.trim().toUpperCase().replace(/\s+/g, "");
  const res = await rexCall(
    "Properties",
    "autocomplete",
    { search_string: `${p.streetNumber} ${p.streetName}`.trim().slice(0, 120), limit: 12 },
    token
  ).catch(() => null);
  if (!res?.ok) return [];
  return (rexRows(res.result) as { id?: unknown; address?: unknown }[])
    .map((r) => ({ id: String(r.id ?? ""), name: String(r.address ?? "").trim() }))
    .filter((r) => r.id && r.name.toUpperCase().replace(/\s+/g, "").includes(pc));
}

/** Everything that has to be true before a property can be written. */
async function blockedBecause(): Promise<{ reason: string; detail: string; ownerDetail?: string } | null> {
  if (!rexConfigured()) {
    return {
      reason: "rex_not_configured",
      detail: "The listings system isn't connected here.",
      ownerDetail: "REX credentials are not set on this environment.",
    };
  }
  if (!(await switchOn("rex_property_create"))) {
    return {
      reason: "switch_off",
      detail: "Adding a property is not switched on yet.",
      ownerDetail:
        "Creating properties in REX is switched off. Arm it on Admin → Switches - it writes a new " +
        "record into the live system six businesses share.",
    };
  }
  if (rexWritesLocked("Properties", "create")) {
    return {
      reason: "writes_locked",
      detail: "Adding a property is not switched on yet.",
      ownerDetail: "REX_ALLOW_WRITES does not include Properties/create.",
    };
  }
  return null;
}

/**
 * The address, as REX stores it.
 *
 * Trimmed and required rather than best-effort: a property with a blank street
 * is unfindable in REX afterwards, and the person who has to find it is an
 * agent standing in front of a landlord.
 */
function buildPayload(p: NewProperty) {
  const data: Record<string, unknown> = {
    adr_street_number: p.streetNumber.trim(),
    adr_street_name: p.streetName.trim(),
    adr_suburb_or_town: p.town.trim(),
    adr_postcode: p.postcode.trim().toUpperCase(),
    /* Lowercase "uk" — that is what the live records carry, and REX's enums
       are not forgiving about case. */
    adr_country: "uk",
    /* The _id forms: they are what Properties/describeModel lists (checked
       18 Sep 2026). The nested { id } shape is how a READ comes back, and a
       write naming a field the model does not have is refused outright. */
    property_category_id: p.categoryId?.trim() || "residential",
  };
  if (p.unitNumber?.trim()) data.adr_unit_number = p.unitNumber.trim();
  if (p.subcategoryId) data.property_subcategory_id = String(p.subcategoryId);
  if (p.ownerContactId) {
    data.related = {
      contact_reln_property: [
        { reln_type: { id: "owner" }, contact: { id: String(p.ownerContactId) } },
      ],
    };
  }
  return data;
}

export async function createProperty(
  p: NewProperty,
  userId: string | null
): Promise<CreateOutcome> {
  /* The street number is required too: REX refuses a property without one
     ("You cannot save a property without specifying a Street Number", bug
     3b357e55, 19 Sep 2026), so the OS says so first, in its own words. A
     house name counts - REX keeps it in the same field. */
  const WORDS = { streetNumber: "a house number or name", streetName: "a street name", town: "a town", postcode: "a postcode" } as const;
  const missing = (["streetNumber", "streetName", "town", "postcode"] as const).filter((k) => !p[k]?.trim());
  if (missing.length) {
    return {
      ok: false,
      reason: "incomplete",
      detail: `A property needs ${missing.map((k) => WORDS[k]).join(", ")} - without them it can't be found again.`,
    };
  }

  /* NEVER A TEST FILE (James, 17 Sep 2026: "we shouldn't be pushing the test
     one, so just make sure that stays the same"). Contacts already refuse
     their test flag; a property has none, so it is recognised by the test
     address the kits all use and by a test owner. */
  /* Not the postcode alone: M20 2RN is a real street, see lib/test-guard. */
  if (await isTestFile({ address: `${p.streetNumber ?? ""} ${p.streetName ?? ""}`, contactId: p.ownerContactId ?? null })) {
    return { ok: false, reason: "test_file", detail: TEST_REFUSAL };
  }

  const blocked = await blockedBecause();
  if (blocked) return { ok: false, ...blocked };

  const token = await rexTokenFor(userId).catch(() => null);
  if (!token) {
    return {
      ok: false,
      reason: "no_rex_session",
      detail: "Connect your listings account on your Profile first, so the property is recorded under your name rather than the office's.",
      ownerDetail:
        "You have no REX sign-in held, so the property would be created under the office account " +
        "rather than your name. Link your REX account on Profile, then try again. (This is the " +
        "same gap that made the first listing write record as 'System User'.)",
    };
  }

  let res = await rexCall(
    "Properties",
    "create",
    { data: buildPayload(p), return_id: true },
    token
  );
  /* The owner join is the one part never written before. If REX will not take
     it, the home still matters more than the join: make it without, and the
     owner can be added in REX by hand. */
  let ownerDropped = false;
  /* Only when the refusal is about the owner join. A duplicate address or a
     refused field fails the same way without the owner, and used to log every
     home twice (bug 52e65579, 19 Sep 2026). */
  const aboutOwner = /owner|contact|reln/i.test(res.error ?? "") && !/duplicate|already exists/i.test(res.error ?? "");
  if (!res.ok && !isExpiredToken(res) && p.ownerContactId && aboutOwner) {
    const bare = await rexCall("Properties", "create", { data: buildPayload({ ...p, ownerContactId: null }), return_id: true }, token);
    if (bare.ok) {
      res = bare;
      ownerDropped = true;
    }
  }

  if (isExpiredToken(res)) {
    return {
      ok: false,
      reason: "rex_session_expired",
      detail: "Your sign-in to the listings system has lapsed. Reconnect it on your Profile and try again.",
    };
  }
  if (!res.ok && /duplicate|already exists/i.test(res.error ?? "")) {
    /* REX already holds the address: the matcher did not recognise it, REX
       did. Not a failed address, a record to link. */
    const existing = await alreadyHeld(p, token);
    const named = existing.length ? ` REX has it as ${existing.map((e) => `${e.name} (${e.id})`).join("; ")}.` : "";
    return {
      ok: false,
      reason: "already_in_rex",
      detail: `REX already holds this address, so it was not added again. Pick it with Link it.${named}`,
      ownerDetail: `REX refused the create as a duplicate (${res.error ?? "DuplicateRecordException"}).${named} The address matcher did not recognise it - worth a look at why.`,
      existing,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "rex_refused",
      detail: "The address was not accepted. Check the street, town and postcode and try again.",
      /* REX's own words, for the owner. "The field passed in X is not
         permissible" says exactly what is wrong; "create failed" says nothing. */
      ownerDetail: res.error ?? `REX refused the property (${res.status}).`,
    };
  }

  const id =
    typeof res.result === "object" && res.result !== null
      ? String((res.result as { id?: unknown }).id ?? "")
      : String(res.result ?? "");
  if (!id) {
    return {
      ok: false,
      reason: "no_id",
      detail: "The address was saved but no reference came back, so it can't be linked. Search for the address and pick it from the list.",
      ownerDetail: "REX accepted the property but returned no id, so it cannot be linked to anything.",
    };
  }
  return { ok: true, propertyId: id, ownerDropped };
}

/**
 * The subcategories this account actually uses.
 *
 * A read, and a necessary one: the ids are account-specific numbers ("26529"
 * is Terraced House HERE and means nothing anywhere else), so a hardcoded list
 * would be wrong the day somebody adds one. The form asks REX.
 */
export async function propertySubcategories(): Promise<Array<{ id: string; text: string }>> {
  const res = await rexCall("PropertySubcategories", "search", { limit: 100 });
  if (!res.ok) return [];
  const rows = ((res.result as { rows?: unknown[] } | undefined)?.rows ?? []) as Array<{
    id?: unknown;
    text?: unknown;
    name?: unknown;
  }>;
  return rows
    .map((r) => ({ id: String(r.id ?? ""), text: String(r.text ?? r.name ?? "") }))
    .filter((r) => r.id && r.text);
}
