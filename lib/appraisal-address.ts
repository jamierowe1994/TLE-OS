import { postcodeIn } from "@/lib/postcode";

/**
 * Which address an appraisal should show: its own, or the lead's.
 *
 * Pulled out of appraisal-store deliberately. That module is `server-only`
 * and reaches Postgres, so the rule inside it could only ever be verified by
 * reading it — and the contacts store needs a database, which the pilot
 * laptops and every local environment do not have. A rule that cannot be
 * exercised anywhere except production is a rule you are hoping about.
 *
 * So the decision lives here, pure, and is tested for real.
 */

export interface LiveAddress {
  address: string;
  postcode: string;
}

/**
 * The lead wins when it has something to say, and only then.
 *
 * - No lead behind this appraisal → its own copy is the truth.
 * - Lead has a blank address → keep what the appraisal was booked with,
 *   rather than blanking a property out from under an agent mid-visit.
 * - Lead has an address but no postcode → read one out of the address if it
 *   is in there, otherwise keep the appraisal's. Never invent one.
 */
export function mergeAddress<T extends { address: string; postcode: string }>(
  appraisal: T,
  live: LiveAddress | null | undefined
): T {
  const address = live?.address?.trim();
  if (!address) return appraisal;
  const postcode = live?.postcode?.trim() || postcodeIn(address) || appraisal.postcode;
  return { ...appraisal, address, postcode };
}
