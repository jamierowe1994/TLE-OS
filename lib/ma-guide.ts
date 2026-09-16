/**
 * The best-price guide, as arithmetic and nothing else.
 *
 * Its own module, with no imports, because it is asked the same question from
 * two sides of the wire: the research route asks it about every comparable it
 * found, and the presentation builder asks it about the ones the agent TICKED,
 * which is the figure the landlord's deck actually carries. Two copies of the
 * quartiles would be two answers to one question on one screen.
 *
 * Quartiles, not mean ± a made-up percentage. A mean is dragged by one
 * penthouse; the middle 50% of real local asking rents is a range an agent can
 * defend line by line, because every number in it is a property we could name.
 *
 * Fewer than four comparables produces a guide with a caveat attached rather
 * than no guide at all - an agent standing in a kitchen would rather have
 * "only two, treat as indicative" than a blank.
 */

export type Nearness = "sector" | "district" | "area";

export interface Guide {
  low: number;
  mid: number;
  high: number;
  basedOn: number;
  /**
   * The WIDEST ring any comparable came from.
   *
   * It used to be the NARROWEST: "same sector" if any one comparable was in
   * the sector. Measured on 27 Abington Avenue NN1 4PA, 16 Sep 2026: four
   * comparables labelled "same sector" when one was in NN1 4 and the other
   * three were in Spratton, Corby and Kettering Road. A label describes the
   * sample, and the sample reached as far as its furthest property.
   */
  ring: Nearness;
  /** How many came from each ring, so the page can say "1 in NN1 4, 3 further out". */
  mix: Record<Nearness, number>;
  /** Said plainly when the sample cannot mean much. Agents are told to trust this line. */
  caveat: string | null;
}

export function buildGuide(comps: { rentMonthly: number; nearness: Nearness }[]): Guide | null {
  if (!comps.length) return null;
  const rents = comps.map((c) => c.rentMonthly).sort((a, b) => a - b);
  const at = (q: number) => rents[Math.min(rents.length - 1, Math.floor(rents.length * q))];
  const mix: Record<Nearness, number> = { sector: 0, district: 0, area: 0 };
  for (const c of comps) mix[c.nearness]++;
  const ring: Nearness = mix.area ? "area" : mix.district ? "district" : "sector";
  const low = at(0.25);
  const high = at(0.75);
  const n = rents.length;

  /* Three different ways a guide can be untrustworthy, and they need
     different words.

     Too FEW comparables is a small-sample problem.

     Mostly OUTSIDE the postcode district is a distance problem, and it fires
     on the share, not on whether any one property is local. That is the bug
     this replaced: one comparable in the sector used to vouch for three from
     other towns, and the line agents are told to trust stayed silent.

     A very wide SPREAD is its own problem: measured on B32, widening to the B
     area gave 43 properties across all of Birmingham and a £775-£2,000
     quartile spread, which is not a guide, it is a shrug with numbers on it. */
  const local = mix.sector + mix.district;
  const mostlyAway = local * 2 < n;
  const wideSpread = low > 0 && high / low > 1.8;
  const plural = (k: number) => `${k} comparable${k === 1 ? "" : "s"}`;

  let caveat: string | null = null;
  if (n < 4) {
    caveat = `Only ${plural(n)}, so treat this as indicative, not evidence.`;
    if (mostlyAway) {
      caveat += local
        ? ` Only ${local} ${local === 1 ? "is" : "are"} in the same postcode district.`
        : " None is in the same postcode district.";
    }
  } else if (mostlyAway) {
    caveat = `${
      local
        ? `Only ${local} of ${n} comparables ${local === 1 ? "is" : "are"} in the same postcode district. The rest are`
        : `None of these ${n} comparables is in the same postcode district. They are all`
    } across the wider area${wideSpread ? ", and the spread is too wide to quote" : ""}. Treat as background, not evidence.`;
  } else if (wideSpread) {
    caveat = "The spread is very wide. Quote a figure from the named comparables, not this range.";
  }

  return { low, mid: at(0.5), high, basedOn: n, ring, mix, caveat };
}

/**
 * Where the sample came from, in words: "1 in NN1 4, 3 further out".
 *
 * Zero rings are left out. The postcode names are passed in rather than
 * worked out here, so this stays free of the postcode parser.
 */
export function guideReach(g: Guide, sector: string | null, district: string | null): string {
  const parts: string[] = [];
  if (g.mix.sector) parts.push(`${g.mix.sector} in ${sector ?? "the sector"}`);
  if (g.mix.district) parts.push(`${g.mix.district} ${g.mix.sector ? "elsewhere " : ""}in ${district ?? "the district"}`);
  if (g.mix.area) parts.push(`${g.mix.area} further out`);
  return parts.join(", ");
}
