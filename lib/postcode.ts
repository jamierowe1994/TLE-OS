/**
 * Reading a postcode out of an address.
 *
 * Lives in its own plain module rather than inside the appraisal store,
 * because that one is `server-only` and reaches Postgres — so anything using
 * this rule could otherwise only be checked by reading it. Pure, and tested.
 */

/**
 * The postcode already in the address, if there is one.
 *
 * A lead has no postcode field, so booking an appraisal from one sends
 * `postcode: ""` — see LeadDrawer. The reasoning there is right: do not INVENT
 * a postcode from a vague area. But the address a booker types is very often a
 * full one, and "W Balsdon Cottages, Whitstone, Holsworthy EX22 6LE, UK"
 * carries its postcode in plain sight. Declining to read it is not caution, it
 * is throwing away something we were given.
 *
 * The cost of not reading it is the whole feature: /api/ma-research answers
 * `address and postcode are required` with a 400, so the appraisal file shows
 * "the property details couldn't be pulled" and the presentation builder
 * cannot start. Measured on James's own appraisal, 30 Aug.
 *
 * Anchored to the END, because an address can contain other things that look
 * postcode-ish — a house name, a flat number — and the postcode is last in
 * every UK format. Optional trailing ", UK" is allowed for, since that is what
 * Google's formatted address returns.
 *
 * If there is genuinely no postcode in there, this returns "" and the empty
 * state is correct: we still do not invent one.
 */
export function postcodeIn(address: string): string {
  const m = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s*(\d[A-Z]{2})\b(?=[,\s]*(?:UK|United Kingdom)?[\s,.]*$)/i.exec(
    (address ?? "").trim()
  );
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : "";
}
