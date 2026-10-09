/**
 * Held for compliance's check - pure, client-safe.
 *
 * James, 9 Oct 2026: "when a gas certificate is uploaded to the system, it
 * should then send that over to Michael. Michael would then need to check it
 * and verify it before it goes live. When they upload it, it'll say 'Being
 * processed by the compliance team', and then, when it's done, it will then
 * show with a green tick."
 *
 * Gas and EICR only: the two Michael checks against a register (Gas Safe for
 * gas, NICEIC / NAPIT for electrical). An EPC still goes live on upload, so a
 * listing is never held off the portals waiting for him.
 *
 * Filed by the compliance office itself it was checked as it was filed, and
 * is never held (lib/certificate-intake fileCertificate).
 */

export const HELD_FOR_CHECK: ReadonlySet<string> = new Set(["gas_safety", "eicr"]);

/** The words every screen shows while one waits. */
export const CHECKING_LABEL = "Being processed by the compliance team";

/** And once Michael has verified it. */
export const VERIFIED_LABEL = "Verified by the compliance team";

/** A certificate waiting for its check, as the book and the screens carry it. */
export type CertChecking = {
  /** The certificate's id (os_certificates.id). */
  id: string;
  /** YYYY-MM-DD, the expiry it will have once verified. */
  expiry: string;
  /** When it was filed (ISO). */
  at: string;
  /** Who filed it. */
  by: string;
  /** Compliance's question, when they have queried it rather than verified it. */
  queried: string | null;
};
