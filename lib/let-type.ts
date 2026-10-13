/**
 * THE TYPE OF LET (James, 12 Oct 2026): "rather than having 'photos on file'
 * we could just have 'type of let' ... any properties that have the word
 * 'room' in them, we should automatically try and fill this out based on live
 * data ... 'Room 1, 32 Elm Close', so we know it's a professional let."
 *
 * The type decides what the home has to hold. Client-safe: the listing page
 * shows the list, the route keeps the choice.
 */

export type LetType = "residential" | "hmo" | "professional";

export const LET_TYPES: { value: LetType; label: string; sub: string }[] = [
  { value: "residential", label: "Residential", sub: "One household - a single let" },
  { value: "hmo", label: "HMO", sub: "A shared house let as a whole" },
  { value: "professional", label: "Professional", sub: "A room in a shared house" },
];

export const isLetType = (v: unknown): v is LetType => LET_TYPES.some((t) => t.value === v);
export const letTypeLabel = (v: LetType | null | undefined) => LET_TYPES.find((t) => t.value === v)?.label ?? "Not set";
export const isHmoLet = (v: LetType | null | undefined) => v === "hmo" || v === "professional";

/** Worked out from what is live: a room in the name or the advert, else the record's HMO flag, else REX's property type. */
export function deriveLetType(p: { name: string; hmo: boolean; propertyType?: string | null; heading?: string | null }): { value: LetType; why: string } {
  if (/\broom\b/i.test(p.name)) return { value: "professional", why: "There is a room in the address" };
  /* 2 Norwich Street: "a terrace property, but it's an HMO" - the address
     says nothing, the advert says "ROOM LET ... double room". */
  if (/\b(room let|house ?share|shared house|(double|single|en-?suite) room)\b/i.test(p.heading ?? "")) return { value: "professional", why: "The advert lets a room in a shared house" };
  if (p.hmo) return { value: "hmo", why: "The property record has it as an HMO" };
  if (/\bhmo\b/i.test(p.propertyType ?? "")) return { value: "hmo", why: "The property type says HMO" };
  return { value: "residential", why: "Nothing on the record says shared" };
}

/**
 * What a home of this type has to hold, as the certificate rows name them.
 * The rule is lib/compliance requiredCerts: the big three on every home (gas
 * only where there is gas), the HMO set on a shared house, legionella in
 * Scotland. Nothing here adds a duty that rule does not already have.
 */
export function requiredFor(letType: LetType, o: { scotland: boolean; noGas: boolean }): string[] {
  return [
    ...(o.noGas ? [] : ["gas_safety"]),
    "eicr",
    "epc",
    ...(isHmoLet(letType) ? ["mandatory_hmo_license", "emergency_lighting_fire_exit", "portable_appliance_testing", "smoke_alarms"] : []),
    ...(o.scotland ? ["legionella_risk_assessment"] : []),
  ];
}
