/**
 * A tenant passport's state, as the Leads board shows it. Client-safe: no
 * token, no link (see lib/passport-states).
 */
export type PassportState = "sent" | "started" | "done";

export interface PassportStateRow {
  /** Lower-cased; empty when the passport was minted with no address. */
  email: string;
  /** os_contacts id when the passport was made from a contact added in the OS. */
  contactId: string | null;
  state: PassportState;
  /** When it got there: sent, last typed in, or finished. */
  at: string;
}

/** The board's four words, "none" being Not sent. */
export const PASSPORT_LABEL: Record<PassportState | "none", string> = {
  none: "Not sent",
  sent: "Sent",
  started: "Started",
  done: "Completed",
};
