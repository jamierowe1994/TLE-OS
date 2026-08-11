/**
 * The link between a landlord, a property and a tenant.
 *
 * Made when an offer is accepted, and then LEFT ALONE. That is the important
 * part: the link is not a status that drifts with the paperwork, it is a
 * statement that these people are attached to this property. Referencing,
 * deposits, signatures and move-in all happen underneath it without touching
 * it.
 *
 * Exactly two things break it (James, 11 Aug 2026):
 *
 *   1. they leave the property — the tenancy ran and has now ended
 *   2. it fell over before they ever moved in — referencing failed, or the
 *      deal collapsed
 *
 * Anything else leaves it standing. A link that quietly disappears because a
 * reference is late is worse than useless: it's the record of who lives where,
 * and half the business hangs off it.
 *
 * REX models this as a TenancyApplication: the tenants hang off it in
 * `related.listing_application_tenants`, and its `listing` carries the
 * landlord through the listing's own Landlord relationship. So the OS doesn't
 * invent a join — it writes the object REX already uses, and both systems
 * agree without anybody reconciling anything.
 */

export type LinkState = "accepted" | "active" | "ended" | "fell_through";

/** Why a link stopped. Only these two end it — see the note above. */
export type UnlinkReason = "moved_out" | "referencing_failed" | "deal_collapsed";

export const UNLINK_REASONS: { id: UnlinkReason; label: string; detail: string; ends: LinkState }[] = [
  {
    id: "moved_out",
    label: "They've left the property",
    detail: "The tenancy ran its course and has ended. The link closes with the history intact.",
    ends: "ended",
  },
  {
    id: "referencing_failed",
    label: "Referencing failed",
    detail: "They didn't pass. Nobody moved in, so the property goes back on the market.",
    ends: "fell_through",
  },
  {
    id: "deal_collapsed",
    label: "The deal fell through",
    detail: "Withdrawn, or it collapsed before move-in for another reason.",
    ends: "fell_through",
  },
];

export type LinkedTenant = {
  /** REX contact id, when they came from REX. */
  contactId: string | null;
  name: string;
  email: string | null;
  mobile: string | null;
  isPrimary: boolean;
};

export type TenancyLink = {
  state: LinkState;
  /** REX's TenancyApplication id, once the link exists over there too. */
  rexApplicationId: string | null;
  listingId: string;
  listingName: string;
  landlord: { contactId: string | null; name: string } | null;
  tenants: LinkedTenant[];
  offerAmount: number | null;
  acceptedOn: string | null;
  /** Agreed move-in, which is when "accepted" becomes "active". */
  startDate: string | null;
  endDate: string | null;
  endedOn: string | null;
  endedReason: UnlinkReason | null;
  endedNotes: string;
};

export function isLive(l: TenancyLink): boolean {
  return l.state === "accepted" || l.state === "active";
}

/**
 * Accepted becomes active on the day they move in — a date, not a decision, so
 * nobody has to remember to press anything. Ended states never move on their
 * own.
 */
export function settle(l: TenancyLink, now = new Date()): TenancyLink {
  if (l.state !== "accepted" || !l.startDate) return l;
  return new Date(l.startDate) <= now ? { ...l, state: "active" } : l;
}

export function unlink(l: TenancyLink, reason: UnlinkReason, notes = "", when = new Date()): TenancyLink {
  const rule = UNLINK_REASONS.find((r) => r.id === reason)!;
  return {
    ...l,
    state: rule.ends,
    endedOn: when.toISOString().slice(0, 10),
    endedReason: reason,
    endedNotes: notes,
  };
}

/** Plain words for the screen — the state alone doesn't tell the story. */
export function describe(l: TenancyLink): string {
  const names = l.tenants.map((t) => t.name.split(" ")[0]).join(" & ") || "the tenant";
  switch (l.state) {
    case "accepted":
      return `${names} are attached to ${l.listingName}${
        l.startDate ? `, moving in ${l.startDate}` : ""
      }. Referencing and paperwork happen underneath this — the link stays either way.`;
    case "active":
      return `${names} live at ${l.listingName}.`;
    case "ended":
      return `${names} left ${l.listingName}${l.endedOn ? ` on ${l.endedOn}` : ""}.`;
    case "fell_through":
      return `${names} never moved into ${l.listingName}${
        l.endedReason === "referencing_failed" ? " — referencing failed" : ""
      }.`;
  }
}

/**
 * The REX payload. `related.listing_application_tenants` is how the tenant
 * contacts attach; the landlord needs no mention because the listing already
 * carries them.
 */
export function toRexApplication(l: TenancyLink) {
  return {
    listing_id: Number(l.listingId),
    offer_amount: l.offerAmount,
    date_accepted: l.acceptedOn,
    start_date: l.startDate,
    end_date: l.endDate,
    application_status: { id: l.state === "fell_through" ? "unsuccessful" : "accepted" },
    ...(l.state === "fell_through" ? { date_unsuccessful: l.endedOn } : {}),
    related: {
      listing_application_tenants: l.tenants
        .filter((t) => t.contactId)
        .map((t) => ({ contact_id: Number(t.contactId), is_primary: t.isPrimary })),
    },
  };
}
