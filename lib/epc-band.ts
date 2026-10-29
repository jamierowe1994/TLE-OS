/**
 * An EPC's band and its score, one scale (client-safe: the advert screens
 * check the two agree before a save, the listing route refuses them if not).
 *
 * REX has no rating field to write: it shows the band its score falls in, and
 * so do the portals. Lianna, 28 Oct 2026, 12 South Chesters Lane: she picked
 * Band C and saved six times, and the rating never moved, because the band
 * only changes when the score does.
 */

export type EpcBand = "A" | "B" | "C" | "D" | "E" | "F" | "G";

/** The scores each band covers, as every EPC prints them. */
export const BAND_SCORES: Record<EpcBand, [number, number]> = {
  A: [92, 150],
  B: [81, 91],
  C: [69, 80],
  D: [55, 68],
  E: [39, 54],
  F: [21, 38],
  G: [1, 20],
};

/** SAP score to band, the scale every EPC prints. */
export function bandForScore(score: number | null | undefined): EpcBand | null {
  if (score == null || !Number.isFinite(score) || score < 1) return null;
  if (score >= 92) return "A";
  if (score >= 81) return "B";
  if (score >= 69) return "C";
  if (score >= 55) return "D";
  if (score >= 39) return "E";
  if (score >= 21) return "F";
  return "G";
}

/** Said when a band and a score disagree, or null when they agree (or either is missing). */
export function bandScoreClash(band: string | null | undefined, score: number | null | undefined): string | null {
  const fromScore = bandForScore(score);
  if (!band || !fromScore || band === fromScore || !(band in BAND_SCORES)) return null;
  const [lo, hi] = BAND_SCORES[band as EpcBand];
  return `Band ${band} is a score from ${lo} to ${hi}, but the score is ${score} (band ${fromScore}). The portals show the band the score is in, so put in the score off the EPC as well.`;
}
