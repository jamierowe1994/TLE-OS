import "server-only";
import { rexCall, rexConfigured, rexWritesLocked, isExpiredToken } from "@/lib/rex";
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

export type CreateOutcome =
  | { ok: true; propertyId: string }
  | { ok: false; reason: string; detail: string };

/** Everything that has to be true before a property can be written. */
async function blockedBecause(): Promise<{ reason: string; detail: string } | null> {
  if (!rexConfigured()) {
    return { reason: "rex_not_configured", detail: "REX credentials are not set on this environment." };
  }
  if (!(await switchOn("rex_property_create"))) {
    return {
      reason: "switch_off",
      detail:
        "Creating properties in REX is switched off. Arm it on Admin → Switches — it writes a new " +
        "record into the live system six businesses share.",
    };
  }
  if (rexWritesLocked("Properties", "create")) {
    return {
      reason: "writes_locked",
      detail: "REX_ALLOW_WRITES does not include Properties/create.",
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
    property_category: { id: p.categoryId?.trim() || "residential" },
  };
  if (p.subcategoryId) data.property_subcategory = { id: String(p.subcategoryId) };
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
  const missing = (["streetName", "town", "postcode"] as const).filter((k) => !p[k]?.trim());
  if (missing.length) {
    return {
      ok: false,
      reason: "incomplete",
      detail: `A property needs ${missing.join(", ")} — REX records without them cannot be found again.`,
    };
  }

  const blocked = await blockedBecause();
  if (blocked) return { ok: false, ...blocked };

  const token = await rexTokenFor(userId).catch(() => null);
  if (!token) {
    return {
      ok: false,
      reason: "no_rex_session",
      detail:
        "You have no REX sign-in held, so the property would be created under the office account " +
        "rather than your name. Link your REX account on Profile, then try again. (This is the " +
        "same gap that made the first listing write record as 'System User'.)",
    };
  }

  const res = await rexCall(
    "Properties",
    "create",
    { data: buildPayload(p), return_id: true },
    token
  );

  if (isExpiredToken(res)) {
    return {
      ok: false,
      reason: "rex_session_expired",
      detail: "Your REX sign-in has lapsed. Sign in to REX again and try once more.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "rex_refused",
      /* REX's own words. "The field passed in X is not permissible" tells an
         agent exactly what is wrong; "create failed" tells them nothing. */
      detail: res.error ?? `REX refused the property (${res.status}).`,
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
      detail: "REX accepted the property but returned no id, so it cannot be linked to anything.",
    };
  }
  return { ok: true, propertyId: id };
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
