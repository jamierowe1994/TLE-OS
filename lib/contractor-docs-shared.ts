/**
 * WHAT A CONTRACTOR SHOULD HAVE ON FILE (the agents' call, 20 Oct 2026:
 * "public liability ... they've got to sign a contract with us as well, the
 * TLE contractor's contract ... gas safe ... and for the electrician the
 * same"). Client-safe: no imports.
 *
 *   every contractor   public liability insurance (runs out), signed TLE terms
 *   gas trades         Gas Safe registration (card runs out)
 *   electrical trades  NICEIC, NAPIT or similar (runs out)
 */

export type DocKind = "public_liability" | "terms" | "gas_safe" | "electrical" | "other";

export const DOC_KINDS: { id: DocKind; label: string; expires: boolean; number: string | null }[] = [
  { id: "public_liability", label: "Public liability insurance", expires: true, number: null },
  { id: "terms", label: "Signed TLE contractor terms", expires: false, number: null },
  { id: "gas_safe", label: "Gas Safe registration", expires: true, number: "Gas Safe number" },
  { id: "electrical", label: "Electrical registration (NICEIC, NAPIT)", expires: true, number: "Registration number" },
  { id: "other", label: "Something else", expires: false, number: null },
];

export const isDocKind = (v: unknown): v is DocKind => DOC_KINDS.some((k) => k.id === v);

/** What this trade should have, in order. */
export function neededFor(trade: string): DocKind[] {
  const t = trade.toLowerCase();
  return [
    "public_liability",
    "terms",
    ...(/gas|boiler|heating/.test(t) ? (["gas_safe"] as const) : []),
    ...(/electric|niceic|napit|spark/.test(t) ? (["electrical"] as const) : []),
  ];
}

export type ContractorDoc = { id: string; kind: DocKind; name: string; key: string; expires: string | null; number: string; by: string; at: string };
