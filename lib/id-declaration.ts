/**
 * THE AGENT'S DECLARATION ON A TENANT'S ID (Sean McMahon, ticket 88c98681,
 * 10 Nov 2026; James: "use your defaults", 24 Nov 2026).
 *
 * "When uploading a tenant ID can we get the facility to watermark and sign
 * them with the following ... Agents name, signature and date."
 *
 * The words are Sean's, as he wrote them. The phone shows them above the
 * agent's signature before it sends, and lib/id-stamp prints the same words
 * on every page of the stored file, so what the agent read is what the paper
 * says. Behind the "idstamp" switch (lib/new-look).
 */

export const ID_DECLARATION =
  "I have seen the applicant(s) and they match the photograph in the approved form of ID / Proof of Address. The ID looks genuine and looks not to have been tampered with.";

/** "2026-11-24" -> "24 November 2026". */
export function ukLongDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The signature as the phone sends it: a PNG data URL, kept small. */
export const SIGNATURE_MAX_BYTES = 200_000;
export const isSignatureDataUrl = (v: unknown): v is string =>
  typeof v === "string" && v.startsWith("data:image/png;base64,") && v.length <= SIGNATURE_MAX_BYTES * 1.4;
