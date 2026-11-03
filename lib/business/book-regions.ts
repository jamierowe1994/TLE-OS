/**
 * THE BOOK BY REGION (Susan Liles, 3 Nov 2026).
 *
 * "The E&W number includes the lets that Sean McMahon does in his
 * Edinburgh/Glasgow portfolio ... we have England / Wales / Scotland (Core /
 * Portfolio)." The PayProp agency is not the country: Sean's own Edinburgh and
 * Glasgow homes sit on the E&W agency. So a home's region is its own address,
 * and Margo's Glasgow portfolio stays apart until Sean completes the purchase,
 * because its fees are accounted for separately.
 *
 * - Margo's portfolio: the rule the Income tab already uses (isMargoHome).
 * - Otherwise England, Wales or Scotland by postcode (nationOf); every other
 *   Scottish home is Scotland - Core.
 * - A home neither says is "unknown" and is listed, never guessed.
 *
 * Client-safe: the Portfolio tab reads the labels.
 */

import { isMargoHome } from "@/lib/business/margo-portfolio";
import { nationOf } from "@/lib/property-flags";

export type BookRegion = "england" | "wales" | "scotland_core" | "margo";
export type BookRegionOrUnknown = BookRegion | "unknown";

export const BOOK_REGIONS: Array<{ key: BookRegion; label: string; short: string }> = [
  { key: "england", label: "England", short: "England" },
  { key: "wales", label: "Wales", short: "Wales" },
  { key: "scotland_core", label: "Scotland - Core", short: "Scotland - Core" },
  { key: "margo", label: "Scotland - Margo's Glasgow Portfolio", short: "Scotland - Margo" },
];

/** Where one PayProp home sits. */
export function bookRegionOf(
  account: string,
  responsibleAgent: string | null | undefined,
  postcode: string | null | undefined,
  ...address: Array<string | null | undefined>
): BookRegionOrUnknown {
  if (isMargoHome(account, responsibleAgent)) return "margo";
  const nation = nationOf(postcode, ...address);
  if (nation === "scotland") return "scotland_core";
  return nation ?? "unknown";
}
