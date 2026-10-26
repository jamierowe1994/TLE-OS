/**
 * WHAT KIND OF PERSON A REX RELATIONSHIP IS (26 Oct 2026).
 *
 * REX joins people to a listing or a property with a relationship type. The
 * landlord is usually `{ id: "owner", text: "Listing Owner" }`, but REX has
 * sub-types under it, and a listing relisted in REX can come back with one:
 * 68 Main Street, Blantyre (listing 854323, relisted by Sean McMahon 23 Oct)
 * had its landlord, Capital Two Limited, joined as `{ id: 179, text:
 * "Landlord", parent_type: { id: "owner" } }`. Every check for id === "owner"
 * read that as no landlord, and Push to Propoly refused the let ("No landlord
 * on the listing") while the landlord was sitting on it.
 *
 * So a sub-type counts as its parent: the kind is the parent type's id where
 * there is one, else the type's own. Client-safe, no imports.
 */

type Row = Record<string, unknown>;

/** "owner", "purchtenant" and so on, with a sub-type read as its parent. Empty when there is no type. */
export function relnKind(reln: unknown): string {
  const t = ((reln as Row | null)?.reln_type ?? null) as Row | string | null;
  if (t == null) return "";
  if (typeof t !== "object") return String(t).trim().toLowerCase();
  const parent = ((t.parent_type ?? null) as Row | null)?.id;
  const id = parent != null && String(parent).trim() ? parent : t.id;
  return String(id ?? "").trim().toLowerCase();
}

/** The landlord's relationship: "Listing Owner", or any sub-type of it ("Landlord"). */
export const isOwnerReln = (reln: unknown): boolean => relnKind(reln) === "owner";
