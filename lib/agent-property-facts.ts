import type { MaterialInfo, MatField } from "./matinfo";

/**
 * The agent's own word on what the property is (James, 6 Oct 2026).
 *
 * Homesearch matched 79A Torquay Road, Paignton to a two-bed flat. It is a
 * six-bed HMO, and nothing on the appraisal let Rhiannon say so - the wrong
 * size went on into the material slide and the market panel. The lookup can
 * be out of date (a recent conversion) or simply the wrong door, so the agent
 * who has stood in the hallway wins over it, field by field.
 *
 * Stored per appraisal under case-state kind "appraisal-facts". Null on a field
 * means "no correction - use the lookup".
 */
export type PropertyFacts = {
  type: string | null;
  beds: number | null;
  baths: number | null;
  /** The lookup found the wrong property altogether: none of its facts (and
   *  none of its sale estimate) go anywhere near the deck. */
  ignoreLookup: boolean;
};

export const NO_FACTS: PropertyFacts = { type: null, beds: null, baths: null, ignoreLookup: false };

export const PROPERTY_TYPES = [
  "HMO",
  "Flat",
  "Maisonette",
  "Terraced house",
  "Semi-detached house",
  "Detached house",
  "Bungalow",
  "Studio",
];

export const hasFacts = (f: PropertyFacts | null | undefined) =>
  Boolean(f && (f.type || f.beds != null || f.baths != null || f.ignoreLookup));

/**
 * The lookup's material information with the agent's corrections laid over it.
 *
 * Replaces the value in place where the lookup had the row, adds the row where
 * it did not, and with `ignoreLookup` keeps ONLY what the agent said - no sale
 * estimate, no floor area, no council tax band from somebody else's home.
 */
export function withAgentFacts(material: MaterialInfo | null, f: PropertyFacts): MaterialInfo | null {
  if (!hasFacts(f)) return material;
  const mine: MatField[] = [];
  if (f.type) mine.push({ label: "Property type", value: f.type, headline: true });
  if (f.beds != null) mine.push({ label: "Bedrooms", value: String(f.beds), headline: true });
  if (f.baths != null) mine.push({ label: "Bathrooms", value: String(f.baths), headline: true });

  if (f.ignoreLookup || !material) {
    if (!mine.length) return null;
    return {
      hsId: 0,
      groups: [{ id: "what", title: "What it is", fields: mine }],
      known: mine.length,
      possible: mine.length,
      valuation: null,
      bedrooms: f.beds,
      lat: null,
      lon: null,
      compliance: {
        epcRating: null,
        epcScore: null,
        epcAssessedOn: null,
        potentialRating: null,
        potentialScore: null,
        floodRisk: null,
        conservationArea: null,
        leaseYearsRemaining: null,
      },
    };
  }

  const groups = material.groups.map((g) => ({ ...g, fields: [...g.fields] }));
  for (const field of mine) {
    const g = groups.find((x) => x.fields.some((y) => y.label === field.label));
    if (g) {
      g.fields = g.fields.map((y) => (y.label === field.label ? { ...y, value: field.value } : y));
      continue;
    }
    let what = groups.find((x) => x.id === "what");
    if (!what) {
      what = { id: "what", title: "What it is", fields: [] };
      groups.unshift(what);
    }
    what.fields.push(field);
  }
  return { ...material, groups, bedrooms: f.beds ?? material.bedrooms };
}
