/**
 * How long a certificate usually runs, and which ones carry no expiry at all.
 *
 * Kept here, apart from the REX code, so the property file's form can ask the
 * same question the server does (Lianna Denholm, 1 Nov 2026: a PAT
 * certificate for 7 3F1 Brougham Place "won't allow" - the File button wanted
 * an expiry a PAT does not print). The same months as lib/rex-compliance
 * LIFE_MONTHS, which the book uses to read REX's entries, and lib/plc-rex,
 * which writes them: a certificate filed here on its tested date runs to the
 * same day the book works out from REX.
 */

/** REX types that hold only a tested or checked date, no expiry (getSchemaForType, 8 Oct 2026). */
export const NO_EXPIRY_TYPES = new Set(["portable_appliance_testing", "emergency_lighting_fire_exit"]);

/** Months each type usually runs from its issue date. */
export const CERT_LIFE_MONTHS: Partial<Record<string, number>> = {
  eicr: 60,
  gas_safety: 12,
  epc: 120,
  legionella_risk_assessment: 24,
  portable_appliance_testing: 12,
  emergency_lighting_fire_exit: 12,
};

/** Filed on its tested date alone: PAT and fire safety. */
export const filesOnIssueDate = (type: string) => NO_EXPIRY_TYPES.has(type);

/** The issue date plus the type's usual life, YYYY-MM-DD, or null when either is missing. */
export function expiryFromIssue(type: string, issue: string | null | undefined): string | null {
  const months = CERT_LIFE_MONTHS[type];
  if (!months || !issue || !/^\d{4}-\d{2}-\d{2}$/.test(issue)) return null;
  const d = new Date(`${issue}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** "a year", "5 years": a type's usual life in words. */
export function lifeInWords(type: string): string | null {
  const months = CERT_LIFE_MONTHS[type];
  if (!months) return null;
  if (months % 12) return `${months} months`;
  return months === 12 ? "a year" : `${months / 12} years`;
}
