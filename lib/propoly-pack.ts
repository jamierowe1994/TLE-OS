/**
 * WHAT THE MOVE-IN PACK EMAIL LOOKS LIKE (James, 22 Oct 2026: "build the
 * email in so we know what we're looking for").
 *
 * One description, read by the screens that say what we expect (Admin >
 * Propoly, a let whose pack is not seen yet) and by the check that says which
 * expected files a logged pack is missing. Seen on real packs (5b Newton
 * Road 9 Oct, 17/7 Upper Grove Place 20 Oct, 12b Cliff Road 22 Oct): the
 * files are named by Propoly, e.g. "Gas safety certificate..pdf", "TDS
 * Custodial Leaflet.pdf", "Tenancy Agreement TQ4 6DG.pdf".
 *
 * No server imports: the client screens read this too.
 */

export const PACK_EMAIL = {
  fromName: "tle",
  from: "no-reply@propoly.com",
  subject: "Thank you for completing the Tenancy Process.",
  to: "The tenant (every tenant on the deal), with a copy to the agent on the let",
  when: "When Kirstie executes the deal in Propoly",
  deadlineDays: 28,
  why: "The tenant must have these within 28 days of moving in, or the landlord can't later serve notice to get the home back.",
} as const;

export type PackFileKey = "agreement" | "deposit" | "gas" | "epc" | "eicr" | "pat" | "legionella";

export interface PackFile {
  key: PackFileKey;
  label: string;
  /** Matches Propoly's file name for it. */
  re: RegExp;
  /** Only expected on an HMO. */
  hmoOnly?: boolean;
  /** Not expected on a Scottish let (the deposit goes to a Scottish scheme, which sends its own). */
  notScotland?: boolean;
}

export const PACK_FILES: PackFile[] = [
  { key: "agreement", label: "Tenancy agreement", re: /tenancy agreement|\blease\b|\bprt\b|\bast\b/i },
  { key: "deposit", label: "Deposit scheme leaflet", re: /leaflet|deposit|prescribed/i, notScotland: true },
  { key: "gas", label: "Gas safety certificate", re: /\bgas\b|\bgsc\b|\bcp12\b/i },
  { key: "epc", label: "Energy performance certificate (EPC)", re: /energy performance|\bepc\b/i },
  { key: "eicr", label: "Electrical report (EICR)", re: /electrical|\beicr\b/i },
  { key: "pat", label: "Portable appliance test (PAT)", re: /portable app|\bpat\b/i, hmoOnly: true },
  { key: "legionella", label: "Legionella risk assessment", re: /legionella/i, hmoOnly: true },
];

/** The files expected on this home's pack. */
export function expectedFiles(home: { hmo?: boolean; scotland?: boolean }): PackFile[] {
  return PACK_FILES.filter((f) => (!f.hmoOnly || home.hmo) && (!f.notScotland || !home.scotland));
}

/** Which expected files a pack came without, by label. */
export function missingFiles(names: string[], home: { hmo?: boolean; scotland?: boolean }): string[] {
  return expectedFiles(home).filter((f) => !names.some((n) => f.re.test(n))).map((f) => f.label);
}
