/**
 * What a listing IS, in the three words every screen uses: Available, Let
 * agreed, Draft. One rule, read by the Listings page, the dashboard's On market
 * and Pipeline tiles and the Overview (Rig run 3, P-026, 10 Oct 2026).
 *
 * Before this the dashboard said 109 on the market with 46 let agreed, the
 * Overview 63 with 46, and Listings 56 available and 63 let agreed - three
 * screens, three meanings, one minute apart:
 *
 *   on the market  = AVAILABLE: published to the portals and not let agreed.
 *                    A let-agreed home is not on the market, published or not.
 *   let agreed     = let agreed, whatever its advert says - in REX, or by an
 *                    offer accepted in the OS that REX has not caught up with
 *                    (lib/activity `accepted`, which Listings already used).
 *   drafts         = neither, and still being worked on: a draft the cap has
 *                    filed away (`archived`) is in no count here.
 *
 * Client-safe; no imports.
 */
export type ListingStage = "Available" | "Let agreed" | "Draft";

export interface StageListing {
  id?: string | number;
  letAgreed: boolean;
  publicationStatus: string | null;
  archived?: boolean;
}

export function stageOf(l: StageListing, accepted?: ReadonlySet<string>): ListingStage {
  if (l.letAgreed || (accepted && l.id != null && accepted.has(String(l.id)))) return "Let agreed";
  if (l.publicationStatus === "published") return "Available";
  return "Draft";
}

/** The three counts, off the working book (archived drafts left out). */
export function stageCounts(listings: StageListing[], accepted?: ReadonlySet<string>): { available: number; letAgreed: number; drafts: number } {
  const out = { available: 0, letAgreed: 0, drafts: 0 };
  for (const l of listings) {
    if (l.archived) continue;
    const s = stageOf(l, accepted);
    if (s === "Available") out.available += 1;
    else if (s === "Let agreed") out.letAgreed += 1;
    else out.drafts += 1;
  }
  return out;
}
