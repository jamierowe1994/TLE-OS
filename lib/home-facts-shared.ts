/**
 * THE FACTS ABOUT A HOME THAT DECIDE ITS CERTIFICATES (19 Oct 2026).
 *
 * Rhiannon: a flat showed as an HMO and was asked for a licence, with no way
 * to say otherwise. Dan: a flat with electric heaters and no gas was asked for
 * a gas safety certificate, and a new build's EIC had nowhere to go. These are
 * the answers a person in the OS can give, and what each one changes:
 *
 *   home type    HMO or not          -> the HMO set (licence, fire, PAT, alarms)
 *   gas supply   gas or none         -> gas safety, asked for or not
 *   hot water    boiler or tank      -> recorded for the engineer; changes no duty
 *   electrical   EICR or EIC         -> which certificate answers the electrical
 *                                       duty. Still one duty, still five years.
 *
 * The rule itself stays lib/compliance requiredCerts. Client-safe: no imports.
 */

export type HomeType = "single" | "hmo";
export type GasSupply = "gas" | "none";
export type HotWater = "boiler" | "tank";
export type ElectricalCert = "eicr" | "eic";
export type EicReason = "new_build" | "rewire";

export type FactKey = "homeType" | "gasSupply" | "hotWater" | "electrical" | "eicReason";

export interface HomeFacts {
  homeType: HomeType | null;
  gasSupply: GasSupply | null;
  hotWater: HotWater | null;
  electrical: ElectricalCert | null;
  eicReason: EicReason | null;
  /** Who said each one, and when. */
  setBy: Partial<Record<FactKey, { by: string; at: string }>>;
}

export const NO_FACTS: HomeFacts = { homeType: null, gasSupply: null, hotWater: null, electrical: null, eicReason: null, setBy: {} };

export const CHOICES = {
  homeType: [
    { value: "single", label: "Not an HMO", sub: "A flat or house let to one household" },
    { value: "hmo", label: "HMO", sub: "Shared by more than one household" },
  ],
  gasSupply: [
    { value: "gas", label: "Gas at the property", sub: "Boiler, hob or fire on gas" },
    { value: "none", label: "No gas supply", sub: "Nothing at the property runs on gas" },
  ],
  hotWater: [
    { value: "boiler", label: "Central heating", sub: "Hot water from the boiler" },
    { value: "tank", label: "Hot water tank", sub: "A cylinder or immersion" },
  ],
  electrical: [
    { value: "eicr", label: "EICR", sub: "Condition report, every 5 years" },
    { value: "eic", label: "EIC", sub: "New build or full rewire" },
  ],
  eicReason: [
    { value: "new_build", label: "New build", sub: "" },
    { value: "rewire", label: "Full rewire", sub: "" },
  ],
} as const satisfies Record<FactKey, readonly { value: string; label: string; sub: string }[]>;

export const isChoice = (k: FactKey, v: unknown): boolean => CHOICES[k].some((c) => c.value === v);
export const choiceLabel = (k: FactKey, v: string | null | undefined): string | null => CHOICES[k].find((c) => c.value === v)?.label ?? null;

/**
 * An EIC stands in for an EICR on a let home for five years from the day it
 * was issued (the Electrical Safety Standards regulations: a certificate for
 * a new installation, issued within the last five years). So the expiry an
 * EIC is filed with is never later than that, whatever interval it recommends.
 */
export const EIC_YEARS = 5;
export function eicExpiry(issue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) return null;
  const [y, m, d] = issue.split("-").map(Number);
  const t = new Date(Date.UTC(y + EIC_YEARS, m - 1, d));
  return t.toISOString().slice(0, 10);
}

/** Heating that the advert describes as not gas: the moment to ask whether there is any gas at all. */
export const heatingWithoutGas = (heating: string | null | undefined): boolean =>
  /\b(electric|storage heater|heat pump|oil|none)\b/i.test(heating ?? "") && !/\bgas\b|\blpg\b/i.test(heating ?? "");
