import "server-only";
import { hasDb, q } from "@/lib/db";
import { listingRead } from "@/lib/listing-details";

/**
 * WHICH HOME AN EMAIL IS ABOUT (Howard, 14 Oct 2026).
 *
 * A home's Messages (lib/conversation) are found by the landlord's email
 * address, so a landlord with three homes had every email on all three: the
 * one about the boiler at No. 18 sat on No. 4 as well. Howard: "use reference
 * number as the matching identifier rather than using the email address".
 *
 * A home's references are the ones a landlord actually has in front of them:
 *
 *   PRP00622     the property reference, on every statement and letter from
 *                the management system (os_properties.ref, 606 of 617 homes)
 *   490915       the PayProp number (os_properties.payprop_no)
 *   26749975     the property's number in the listings system
 *   EH4 2EG      the postcode, the next best thing when no number is quoted
 *
 * An email that quotes this home's reference is about this home. One that
 * quotes a DIFFERENT home's PRP reference, and not this one's, is about that
 * home, so it leaves this home's Messages. Anything else falls back to the
 * email address, exactly as before, and says so. Only the PRP form is used
 * to send an email elsewhere: a bare six- or eight-digit number could be a
 * phone number or an amount, so those only ever confirm a match.
 */

export interface HomeRefs {
  /** "18 Carlton Road", for the line under the bubble. */
  label: string;
  /** PRP number without its zeros (622), when the home has one. */
  prp: number | null;
  /** The PRP reference as written on the record, for the line under the bubble. */
  prpRef: string | null;
  /** Other numbers that confirm a match: PayProp, listings system. */
  numbers: string[];
  postcode: string | null;
}

export type HomeMatch =
  | { on: "reference"; ref: string; home: string }
  | { on: "postcode"; ref: string; home: string }
  | { on: "email" };

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s || null;
};

const PRP = /\bPRP[\s-]?0*(\d{1,7})\b/gi;

function prpNumber(ref: string | null | undefined): number | null {
  const m = /^\s*PRP[\s-]?0*(\d{1,7})\s*$/i.exec(ref ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * The home behind a listing: the listing's property from the same Listings/
 * read the drawer has just made (held for two minutes, lib/listing-details),
 * then the OS property record for its references. Null when it cannot be
 * told - the Messages then work by email address, as they always have.
 */
export async function homeForListing(listingId: string | null | undefined): Promise<HomeRefs | null> {
  const id = Number(listingId);
  if (!Number.isFinite(id) || id <= 0 || !hasDb()) return null;
  const res = await listingRead(id, "Listings", "read", { id }).catch(() => null);
  if (!res?.ok || !res.result) return null;
  const l = res.result as Obj;
  const p = (l.property ?? {}) as Obj;
  const propertyId = str(p.id) ?? str(l.property_id);
  if (!propertyId) return null;

  const rows = await q<{ ref: string; address: string; postcode: string | null; payprop_no: string | null }>(
    `SELECT ref, address, postcode, payprop_no FROM os_properties WHERE rex_property_id = $1 ORDER BY active DESC, updated_at DESC LIMIT 1`,
    [propertyId]
  ).catch(() => []);
  const rec = rows[0] ?? null;

  const street = [str(p.adr_unit_number) ? `${str(p.adr_unit_number)}/` : "", str(p.adr_street_number) ?? "", str(p.adr_street_name) ?? ""]
    .join(" ")
    .replace(/\/\s+/, "/")
    .replace(/\s+/g, " ")
    .trim();
  const label = street || (rec?.address ?? "").split(",").slice(0, 2).join(",").trim() || "this home";
  const prpRef = rec?.ref?.trim() || null;
  return {
    label,
    prp: prpNumber(prpRef),
    prpRef,
    numbers: [rec?.payprop_no, propertyId].map((x) => (x ?? "").trim()).filter((x) => /^\d{5,}$/.test(x)),
    postcode: str(p.adr_postcode) ?? rec?.postcode?.trim() ?? null,
  };
}

/**
 * Which home this text is about, as far as this home is concerned:
 * a HomeMatch to keep it (with why), or "elsewhere" when it names another
 * home's PRP reference and not this one's.
 */
export function matchHome(text: string, home: HomeRefs): HomeMatch | "elsewhere" {
  const t = text ?? "";
  const prps = [...t.matchAll(PRP)].map((m) => Number(m[1]));
  if (home.prp != null && prps.includes(home.prp)) {
    return { on: "reference", ref: home.prpRef ?? `PRP${home.prp}`, home: home.label };
  }
  for (const n of home.numbers) {
    if (new RegExp(`(^|[^\\d])${n}([^\\d]|$)`).test(t)) return { on: "reference", ref: n, home: home.label };
  }
  if (prps.length) return "elsewhere";
  const pc = postcodeRe(home.postcode);
  if (pc && pc.test(t)) return { on: "postcode", ref: home.postcode!.toUpperCase(), home: home.label };
  return { on: "email" };
}

function postcodeRe(postcode: string | null): RegExp | null {
  const m = /^\s*([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\s*$/i.exec(postcode ?? "");
  return m ? new RegExp(`\\b${m[1]}\\s?${m[2]}\\b`, "i") : null;
}
